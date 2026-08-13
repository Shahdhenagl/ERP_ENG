<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\CashBox;
use App\Models\RecurringExpense;
use App\Models\RecurringExpenseItem;
use App\Models\User;
use App\Services\BillingService;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

/**
 * The fixed, recurring bills — rent, a line, a licence. Managed as templates
 * with a cycle; paying one records an ordinary treasury expense and rolls the
 * schedule forward, so the money still runs through the one ledger.
 */
class RecurringExpenseController extends Controller
{
    public function __construct(protected BillingService $billing) {}

    public function index(Request $request): JsonResponse
    {
        $expenses = RecurringExpense::query()
            ->when($request->boolean('active'), fn ($q) => $q->active())
            ->with(['box', 'items'])
            ->orderBy('next_due_on')
            ->get()
            ->map(fn (RecurringExpense $e) => $this->present($e));

        return response()->json([
            'data' => $expenses,
            'meta' => [
                // What the reminder is watching: live and due within three days.
                'due_soon' => RecurringExpense::query()->dueWithin(3)->count(),
            ],
        ]);
    }

    /** The reusable checklist options, ordered for the expense dialog. */
    public function items(): JsonResponse
    {
        return response()->json([
            'data' => RecurringExpenseItem::query()
                ->orderBy('label')
                ->get()
                ->map(fn (RecurringExpenseItem $item) => [
                    'id' => $item->id,
                    'label' => $item->label,
                ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['next_due_on'] = $data['start_on'];
        $data['created_by'] = $request->user()->id;

        $expense = RecurringExpense::create(Arr::except($data, ['item_ids', 'new_item_labels']));
        $this->syncItems($expense, $data, $request->user());

        ActivityLog::record('recurring_expense.created', $expense, "مصروف دوري: {$expense->name}");

        return response()->json(['data' => $this->present($expense->load(['box', 'items']))], 201);
    }

    public function update(Request $request, RecurringExpense $recurringExpense): JsonResponse
    {
        $data = $this->validated($request);

        // Moving the start date before anything was paid moves the next due with
        // it; once it has been paid, the running schedule is left alone.
        if (! $recurringExpense->last_paid_on) {
            $data['next_due_on'] = $data['start_on'];
        }

        $recurringExpense->update(Arr::except($data, ['item_ids', 'new_item_labels']));
        $this->syncItems($recurringExpense, $data, $request->user());

        return response()->json(['data' => $this->present($recurringExpense->fresh(['box', 'items']))]);
    }

    public function destroy(RecurringExpense $recurringExpense): JsonResponse
    {
        $recurringExpense->delete();

        return response()->json(['message' => Terms::get('تم حذف المصروف الدوري.')]);
    }

    /**
     * Pay this cycle: an ordinary treasury expense out of the box, and the
     * schedule rolls forward one cycle so the reminder goes quiet until the next.
     */
    public function pay(Request $request, RecurringExpense $recurringExpense): JsonResponse
    {
        $box = $recurringExpense->cash_box_id
            ? CashBox::findOrFail($recurringExpense->cash_box_id)
            : CashBox::default();

        $this->billing->recordExpense($box, (float) $recurringExpense->amount, $request->user(), [
            'category' => $recurringExpense->category ?? $recurringExpense->name,
            'note' => "مصروف دوري: {$recurringExpense->name}",
        ]);

        $recurringExpense->advanceCycle();

        ActivityLog::record(
            'recurring_expense.paid',
            $recurringExpense,
            "سداد مصروف دوري {$recurringExpense->name} بمبلغ ".number_format((float) $recurringExpense->amount, 2),
        );

        return response()->json(['data' => $this->present($recurringExpense->fresh(['box', 'items']))]);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'amount' => ['required', 'numeric', 'min:0'],
            // Retained for older records and for the accounting category on payment.
            'category' => ['nullable', 'string', 'max:120'],
            'cash_box_id' => ['nullable', 'exists:cash_boxes,id'],
            'cycle_days' => ['required', 'integer', 'min:1', 'max:3660'],
            'start_on' => ['required', 'date'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'item_ids' => ['nullable', 'array'],
            'item_ids.*' => ['integer', 'distinct', 'exists:recurring_expense_items,id'],
            'new_item_labels' => ['nullable', 'array'],
            'new_item_labels.*' => ['string', 'max:120', 'distinct'],
        ]);
    }

    /**
     * Keep all selected existing entries and newly typed labels in one pivot.
     * Names entered in the dialog are reused if another operator already added
     * the same label, so the checklist stays a shared catalogue.
     *
     * @param array<string, mixed> $data
     */
    protected function syncItems(RecurringExpense $expense, array $data, User $user): void
    {
        $ids = collect($data['item_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter()
            ->values();

        foreach ($data['new_item_labels'] ?? [] as $label) {
            $label = trim($label);

            if ($label === '') {
                continue;
            }

            $item = RecurringExpenseItem::firstOrCreate(
                ['label' => $label],
                ['created_by' => $user->id],
            );

            $ids->push($item->id);
        }

        $expense->items()->sync($ids->unique()->values()->all());
    }

    /** @return array<string, mixed> */
    protected function present(RecurringExpense $e): array
    {
        return [
            'id' => $e->id,
            'name' => $e->name,
            'amount' => (float) $e->amount,
            'category' => $e->category,
            'items' => $e->items->map(fn (RecurringExpenseItem $item) => [
                'id' => $item->id,
                'label' => $item->label,
            ])->values(),
            'cash_box_id' => $e->cash_box_id,
            'cash_box' => $e->box?->name,
            'cycle_days' => $e->cycle_days,
            'start_on' => $e->start_on?->toDateString(),
            'next_due_on' => $e->next_due_on?->toDateString(),
            'last_paid_on' => $e->last_paid_on?->toDateString(),
            'days_until_due' => $e->daysUntilDue(),
            'is_due_soon' => $e->isDueSoon(),
            'is_active' => $e->is_active,
            'notes' => $e->notes,
        ];
    }
}

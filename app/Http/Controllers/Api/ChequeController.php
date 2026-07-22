<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Cheque;
use App\Services\ChequeRegister;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChequeController extends Controller
{
    public function __construct(protected ChequeRegister $cheques) {}

    public function index(Request $request): JsonResponse
    {
        $cheques = Cheque::query()
            ->search($request->string('search')->toString() ?: null)
            ->when($request->string('direction')->toString(), fn ($q, $d) => $q->where('direction', $d))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('open'), fn ($q) => $q->open())
            ->when($request->integer('due_within'), fn ($q, $days) => $q->dueWithin($days))
            ->with(['customer', 'supplier', 'invoice', 'supplierInvoice', 'box'])
            ->orderBy('due_date')
            ->paginate($request->integer('per_page', 40));

        return response()->json([
            'data' => $cheques->through(fn (Cheque $cheque) => $this->present($cheque))->items(),
            'meta' => [
                'total' => $cheques->total(),
                'last_page' => $cheques->lastPage(),
                ...$this->cheques->outlook($request->integer('days') ?: 30),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'direction' => ['required', 'in:incoming,outgoing'],

            'customer_id' => ['nullable', 'exists:customers,id'],
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'invoice_id' => ['nullable', 'exists:invoices,id'],
            'supplier_invoice_id' => ['nullable', 'exists:supplier_invoices,id'],

            'cheque_number' => ['required', 'string', 'max:64'],
            'bank_name' => ['nullable', 'string', 'max:120'],
            'party_name' => ['nullable', 'string', 'max:160'],
            'cash_box_id' => ['nullable', 'exists:cash_boxes,id'],

            'issue_date' => ['nullable', 'date'],
            'due_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $cheque = $data['direction'] === 'incoming'
            ? $this->cheques->receive($data, $request->user())
            : $this->cheques->issue($data, $request->user());

        ActivityLog::record(
            'cheque.created',
            $cheque,
            "شيك {$cheque->directionLabel()} {$cheque->code} بمبلغ ".number_format((float) $cheque->amount, 2),
        );

        return response()->json(
            ['data' => $this->present($cheque->load(['customer', 'supplier', 'invoice']))],
            201,
        );
    }

    public function show(Cheque $cheque): JsonResponse
    {
        return response()->json([
            'data' => $this->present(
                $cheque->load(['customer', 'supplier', 'invoice', 'supplierInvoice', 'box', 'payment']),
            ),
        ]);
    }

    /**
     * Move it along.
     *
     * One route rather than four: each of these is the same piece of paper
     * changing state, and splitting them would scatter the guard that says
     * which move is allowed across four controllers.
     */
    public function transition(Request $request, Cheque $cheque): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:deposit,clear,bounce,cancel'],
            'cash_box_id' => ['required_if:action,deposit', 'nullable', 'exists:cash_boxes,id'],
            'reason' => ['required_if:action,bounce', 'required_if:action,cancel', 'nullable', 'string', 'max:255'],
            'on' => ['nullable', 'date'],
        ]);

        $box = ! empty($data['cash_box_id']) ? CashBox::findOrFail($data['cash_box_id']) : null;

        $moved = match ($data['action']) {
            'deposit' => $this->cheques->deposit($cheque, $box, $data['on'] ?? null),
            'clear' => $this->cheques->clear($cheque, $request->user(), $box, $data['on'] ?? null),
            'bounce' => $this->cheques->bounce($cheque, $data['reason']),
            'cancel' => $this->cheques->cancel($cheque, $data['reason']),
        };

        ActivityLog::record(
            "cheque.{$data['action']}",
            $moved,
            "الشيك {$moved->code}: {$moved->statusLabel()}",
        );

        return response()->json([
            'data' => $this->present($moved->load(['customer', 'supplier', 'box', 'payment'])),
        ]);
    }

    /* ── Bank reconciliation ─────────────────────────────── */

    /**
     * One bank account's movements, ticked or not, against what the bank says.
     *
     * The difference between the book balance and the reconciled balance is the
     * whole output: it is what has not yet appeared on a statement, and a
     * figure that will not close is how an error gets found.
     */
    public function reconciliation(Request $request, CashBox $box): JsonResponse
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'statement_balance' => ['nullable', 'numeric'],
        ]);

        $movements = $box->movements()
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->whereDate('created_at', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->whereDate('created_at', '<=', $to))
            ->with(['payment.customer', 'actor'])
            ->orderBy('created_at')
            ->get();

        $reconciled = $movements->filter(fn (CashMovement $m) => $m->reconciled_at !== null);

        $signed = fn ($rows) => round($rows->sum(
            fn (CashMovement $m) => $m->direction === 'in' ? (float) $m->amount : -(float) $m->amount,
        ), 2);

        $book = $box->balance();
        $reconciledBalance = $signed($reconciled);
        $statement = isset($filters['statement_balance'])
            ? round((float) $filters['statement_balance'], 2)
            : null;

        return response()->json([
            'box' => ['id' => $box->id, 'name' => $box->name, 'type' => $box->type],
            'book_balance' => $book,
            'reconciled_balance' => $reconciledBalance,
            // Movements the bank has not shown yet — cheques in the post, a
            // deposit made after the statement was cut.
            'unreconciled_total' => round($book - $reconciledBalance, 2),
            'statement_balance' => $statement,
            'difference' => $statement !== null ? round($statement - $reconciledBalance, 2) : null,
            'rows' => $movements->map(fn (CashMovement $m) => [
                'id' => $m->id,
                'date' => $m->created_at?->toDateString(),
                'direction' => $m->direction,
                'amount' => (float) $m->amount,
                'source' => $m->source,
                'note' => $m->note,
                'customer' => $m->payment?->customer?->name,
                'reconciled' => $m->reconciled_at !== null,
                'reconciled_at' => $m->reconciled_at?->toDateString(),
            ])->values(),
        ]);
    }

    /** Tick movements off against a statement, or untick them. */
    public function reconcile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:cash_movements,id'],
            'reconciled' => ['required', 'boolean'],
        ]);

        CashMovement::whereIn('id', $data['ids'])->update(
            $data['reconciled']
                ? ['reconciled_at' => now(), 'reconciled_by' => $request->user()->id]
                : ['reconciled_at' => null, 'reconciled_by' => null],
        );

        ActivityLog::record(
            'treasury.reconciled',
            null,
            ($data['reconciled'] ? 'تسوية ' : 'إلغاء تسوية ').count($data['ids']).' حركة بنكية',
        );

        return response()->json(['message' => 'تم التحديث.', 'count' => count($data['ids'])]);
    }

    /** @return array<string, mixed> */
    protected function present(Cheque $cheque): array
    {
        return [
            'id' => $cheque->id,
            'code' => $cheque->code,
            'direction' => $cheque->direction,
            'direction_label' => $cheque->directionLabel(),

            'cheque_number' => $cheque->cheque_number,
            'bank_name' => $cheque->bank_name,
            'party_name' => $cheque->party_name,

            'customer_id' => $cheque->customer_id,
            'customer' => $cheque->customer?->name,
            'supplier_id' => $cheque->supplier_id,
            'supplier' => $cheque->supplier?->name,

            'invoice_id' => $cheque->invoice_id,
            'invoice_code' => $cheque->invoice?->code,
            'supplier_invoice_code' => $cheque->supplierInvoice?->code,

            'issue_date' => $cheque->issue_date?->toDateString(),
            'due_date' => $cheque->due_date?->toDateString(),
            'amount' => (float) $cheque->amount,

            'status' => $cheque->status,
            'status_label' => $cheque->statusLabel(),
            'is_open' => $cheque->isOpen(),
            // Derived on read: past its date and still not banked.
            'is_due' => $cheque->isDue(),
            'days_to_due' => $cheque->daysToDue(),

            'cash_box_id' => $cheque->cash_box_id,
            'box' => $cheque->box?->name,
            'payment_code' => $cheque->payment?->code,

            'deposited_on' => $cheque->deposited_on?->toDateString(),
            'settled_on' => $cheque->settled_on?->toDateString(),
            'bounce_reason' => $cheque->bounce_reason,
            'notes' => $cheque->notes,

            'created_at' => $cheque->created_at?->toIso8601String(),
        ];
    }
}

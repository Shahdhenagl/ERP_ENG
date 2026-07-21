<?php

namespace App\Http\Controllers\Api;

use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Models\ActivityLog;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class TreasuryController extends Controller
{
    public function __construct(protected BillingService $billing) {}

    /* ── Receipts ────────────────────────────────────────── */

    public function payments(Request $request): AnonymousResourceCollection
    {
        $payments = Payment::query()
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->integer('invoice_id'), fn ($q, $id) => $q->where('invoice_id', $id))
            ->when($request->integer('cash_box_id'), fn ($q, $id) => $q->where('cash_box_id', $id))
            ->with(['customer', 'invoice', 'box', 'actor'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return PaymentResource::collection($payments);
    }

    public function receive(Request $request): JsonResponse
    {
        $data = $request->validate([
            // One of the two must identify who paid; the invoice supplies the
            // customer when it is given.
            'invoice_id' => ['nullable', 'exists:invoices,id'],
            'customer_id' => ['required_without:invoice_id', 'nullable', 'exists:customers,id'],
            'cash_box_id' => ['nullable', 'exists:cash_boxes,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'paid_at' => ['nullable', 'date'],
            'reference' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $payment = $this->billing->receivePayment($data, $request->user());

        ActivityLog::record(
            'payment.received',
            $payment,
            "سند قبض {$payment->code} بمبلغ ".number_format((float) $payment->amount, 2),
        );

        return response()->json(
            new PaymentResource($payment->load(['customer', 'invoice', 'box', 'actor'])),
            201,
        );
    }

    public function reverse(Request $request, Payment $payment): JsonResponse
    {
        $this->billing->reversePayment($payment, $request->user());

        ActivityLog::record('payment.reversed', $payment, "تم إلغاء سند القبض {$payment->code}");

        return response()->json(['message' => 'تم إلغاء سند القبض.']);
    }

    /* ── Cash boxes ──────────────────────────────────────── */

    public function boxes(): JsonResponse
    {
        // A fresh install has no boxes, which leaves the collection screen with
        // nothing to pay into. Opening the main one on first look is the same
        // approach the stock module takes with the main warehouse.
        CashBox::default();

        $boxes = CashBox::query()->orderBy('type')->get()->map(fn (CashBox $box) => [
            'id' => $box->id,
            'name' => $box->name,
            'type' => $box->isCustody() ? 'custody' : $box->type,
            'holder' => $box->holder?->name,
            'type_label' => $box->type === 'bank' ? 'حساب بنكي' : 'خزينة نقدية',
            'account_number' => $box->account_number,
            'currency' => $box->currency,
            'is_active' => $box->is_active,
            'balance' => $box->balance(),
        ]);

        return response()->json(['data' => $boxes]);
    }

    public function storeBox(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', 'in:cash,bank'],
            'account_number' => ['nullable', 'string', 'max:64'],
        ]);

        $box = CashBox::create($data);

        return response()->json(['data' => ['id' => $box->id, 'name' => $box->name]], 201);
    }

    public function expense(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cash_box_id' => ['required', 'exists:cash_boxes,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'category' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $movement = $this->billing->recordExpense(
            CashBox::findOrFail($data['cash_box_id']),
            (float) $data['amount'],
            $request->user(),
            $data,
        );

        return response()->json(['data' => ['id' => $movement->id]], 201);
    }

    public function transfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_box_id' => ['required', 'exists:cash_boxes,id'],
            'to_box_id' => ['required', 'exists:cash_boxes,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $this->billing->transferBetweenBoxes(
            CashBox::findOrFail($data['from_box_id']),
            CashBox::findOrFail($data['to_box_id']),
            (float) $data['amount'],
            $request->user(),
            $data['note'] ?? null,
        );

        return response()->json(['message' => 'تم التحويل.'], 201);
    }

    public function movements(Request $request): JsonResponse
    {
        $movements = CashMovement::query()
            ->when($request->integer('cash_box_id'), fn ($q, $id) => $q->where('cash_box_id', $id))
            ->with(['box', 'actor', 'payment.customer'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'data' => $movements->through(fn (CashMovement $m) => [
                'id' => $m->id,
                'direction' => $m->direction,
                'amount' => (float) $m->amount,
                'source' => $m->source,
                'source_label' => match ($m->source) {
                    'payment' => 'تحصيل',
                    'expense' => 'مصروف',
                    'transfer' => 'تحويل',
                    default => 'رصيد افتتاحي',
                },
                'box' => $m->box?->name,
                'category' => $m->category,
                'note' => $m->note,
                'customer' => $m->payment?->customer?->name,
                'actor' => $m->actor?->name,
                'created_at' => $m->created_at?->toIso8601String(),
            ])->items(),
            'meta' => ['total' => $movements->total(), 'last_page' => $movements->lastPage()],
        ]);
    }

    /* ── Headline numbers ────────────────────────────────── */

    public function summary(): JsonResponse
    {
        $outstanding = (float) Invoice::query()->outstanding()->sum('total');
        $collectedOnOutstanding = (float) Payment::query()
            ->whereIn('invoice_id', Invoice::query()->outstanding()->select('id'))
            ->sum('amount');

        return response()->json([
            'cash_on_hand' => round(CashBox::all()->sum(fn (CashBox $b) => $b->balance()), 2),
            'receivable' => round($outstanding - $collectedOnOutstanding, 2),
            'overdue_count' => Invoice::query()->overdue()->count(),
            'collected_this_month' => round((float) Payment::query()
                ->whereBetween('paid_at', [now()->startOfMonth(), now()->endOfMonth()])
                ->sum('amount'), 2),
        ]);
    }
}

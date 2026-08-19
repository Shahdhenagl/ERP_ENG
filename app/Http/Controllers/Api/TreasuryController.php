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
use App\Services\TreasuryReport;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TreasuryController extends Controller
{
    public function __construct(
        protected BillingService $billing,
        protected TreasuryReport $report,
    ) {}

    /* ── Receipts ────────────────────────────────────────── */

    public function payments(Request $request): AnonymousResourceCollection
    {
        $payments = Payment::query()
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->integer('invoice_id'), fn ($q, $id) => $q->where('invoice_id', $id))
            ->when($request->integer('cash_box_id'), fn ($q, $id) => $q->where('cash_box_id', $id))
            ->with(['customer', 'invoice', 'box', 'actor', 'collector'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return PaymentResource::collection($payments);
    }

    /** One receipt on its own — for the printable voucher. */
    public function showPayment(Payment $payment): PaymentResource
    {
        return new PaymentResource($payment->load(['customer', 'invoice', 'box', 'actor', 'collector']));
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
            'collected_by_user_id' => ['nullable', 'exists:users,id'],
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

        return response()->json(['message' => Terms::get('تم إلغاء سند القبض.')]);
    }

    /* ── Cash boxes ──────────────────────────────────────── */

    public function boxes(): JsonResponse
    {
        // A fresh install has no boxes, which leaves the collection screen with
        // nothing to pay into. Opening the main one on first look is the same
        // approach the stock module takes with the main warehouse.
        CashBox::default();

        $boxes = CashBox::query()
            ->whereNull('user_id')
            ->orderBy('type')
            ->get()
            ->map(fn (CashBox $box) => [
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

    /** Rename a company box or move it between cash/bank. Custody boxes are off-limits. */
    public function updateBox(Request $request, CashBox $box): JsonResponse
    {
        if ($box->isCustody()) {
            throw ValidationException::withMessages(['box' => Terms::get('خزينة عهدة فني تُدار من شاشة العهد.')]);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', 'in:cash,bank'],
            'account_number' => ['nullable', 'string', 'max:64'],
            'is_active' => ['boolean'],
        ]);

        $box->update($data);

        return response()->json(['data' => ['id' => $box->id, 'name' => $box->name]]);
    }

    /**
     * Close an empty company box. Refused while it holds money or carries any
     * history — a box with movements is evidence and cannot just vanish — and
     * the main till and technicians' floats are never deletable here.
     */
    public function destroyBox(CashBox $box): JsonResponse
    {
        if ($box->isCustody()) {
            throw ValidationException::withMessages(['box' => Terms::get('خزينة عهدة فني تُدار من شاشة العهد.')]);
        }

        if ($box->id === CashBox::default()->id) {
            throw ValidationException::withMessages(['box' => Terms::get('لا يمكن حذف الخزينة الرئيسية.')]);
        }

        if ($box->hasFinancialReferences()) {
            throw ValidationException::withMessages([
                'box' => Terms::get('لا يمكن حذف هذه الخزينة لأنها مرتبطة بسندات مالية. قم بإيقافها بدلًا من حذفها.'),
            ]);
        }

        $box->delete();

        return response()->json(['message' => Terms::get('تم حذف الخزينة.')]);
    }

    /**
     * Correct a receipt's details — the method, its reference, the date or the
     * note. The amount and the box are deliberately fixed: changing what money
     * moved, or where, is a reversal and a new receipt, not an edit.
     */
    public function updatePayment(Request $request, Payment $payment): JsonResponse
    {
        $data = $request->validate([
            'method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'paid_at' => ['nullable', 'date'],
            'reference' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $payment->update($data);

        ActivityLog::record('payment.updated', $payment, "تعديل بيانات سند القبض {$payment->code}");

        return response()->json(
            new PaymentResource($payment->load(['customer', 'invoice', 'box', 'actor'])),
        );
    }

    public function expense(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cash_box_id' => ['required', 'exists:cash_boxes,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'category' => ['nullable', 'string', 'max:64'],
            'responsible_user_id' => ['nullable', 'exists:users,id'],
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

    /**
     * A receipt from someone who is not a customer on the books — the party's
     * name and the amount, into a box. Its own kind of voucher, kept apart from
     * a customer settling an invoice.
     */
    public function deposit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cash_box_id' => ['required', 'exists:cash_boxes,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'party' => ['required', 'string', 'max:160'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $movement = $this->billing->recordExternalDeposit(
            CashBox::findOrFail($data['cash_box_id']),
            (float) $data['amount'],
            $request->user(),
            $data,
        );

        ActivityLog::record(
            'deposit.received',
            $movement,
            "إيداع خارجي من {$data['party']} بمبلغ ".number_format((float) $data['amount'], 2),
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

        return response()->json(['message' => Terms::get('تم التحويل.')], 201);
    }

    /**
     * A manual cash voucher — an expense paid or a deposit received — for the
     * printable sheet. Only the two kinds a hand raises: a customer's or
     * supplier's receipt has its own voucher with the document behind it.
     */
    public function voucher(CashMovement $movement): JsonResponse
    {
        abort_unless(
            in_array($movement->source, ['expense', 'external_deposit'], true),
            404,
        );

        $movement->load(['box', 'actor', 'responsible']);
        $isReceipt = $movement->direction === 'in';

        return response()->json([
            'data' => [
                'id' => $movement->id,
                'code' => ($isReceipt ? 'RC-' : 'PV-').str_pad((string) $movement->id, 5, '0', STR_PAD_LEFT),
                'kind' => $isReceipt ? 'receipt' : 'payment',
                'title' => $isReceipt ? 'سند قبض' : 'سند صرف',
                'party' => $movement->category,
                'amount' => (float) $movement->amount,
                'cash_box' => $movement->box?->name,
                'note' => $movement->note,
                'actor' => $movement->actor?->name,
                'responsible' => $movement->responsible?->name,
                'date' => $movement->created_at?->toDateString(),
            ],
        ]);
    }

    /**
     * Correct a manual voucher's wording — its heading and note. The amount and
     * the box are fixed on purpose: changing what money moved, or where, is a
     * delete and a fresh voucher, not an edit — the same rule a receipt follows.
     */
    public function updateMovement(Request $request, CashMovement $movement): JsonResponse
    {
        abort_unless(
            in_array($movement->source, ['expense', 'external_deposit'], true),
            404,
        );

        $data = $request->validate([
            'category' => ['nullable', 'string', 'max:160'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $movement->update([
            'category' => $data['category'] ?? $movement->category,
            'note' => $data['note'] ?? null,
        ]);

        ActivityLog::record('cash_voucher.updated', $movement, "تعديل سند خزينة #{$movement->id}");

        return response()->json(['data' => ['id' => $movement->id]]);
    }

    /**
     * Tear up a manual voucher: the movement and the journal entry it posted go
     * together, so the box balance and the ledger are both put back. Refused
     * once the box has been reconciled up to it — a signed-off day is closed.
     */
    public function destroyMovement(CashMovement $movement): JsonResponse
    {
        abort_unless(
            in_array($movement->source, ['expense', 'external_deposit'], true),
            404,
        );

        if ($movement->reconciled_at) {
            throw ValidationException::withMessages([
                'movement' => Terms::get('لا يمكن حذف سند بعد تسوية الخزينة عليه.'),
            ]);
        }

        DB::transaction(function () use ($movement) {
            \App\Models\JournalEntry::where('sourceable_type', $movement->getMorphClass())
                ->where('sourceable_id', $movement->getKey())
                ->each(function ($entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                });

            $movement->delete();
        });

        ActivityLog::record('cash_voucher.deleted', null, "حذف سند خزينة #{$movement->id}");

        return response()->json(['message' => Terms::get('تم حذف السند.')]);
    }

    public function movements(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'direction' => ['nullable', 'in:in,out'],
            'source' => ['nullable', 'string', 'max:40'],
            'search' => ['nullable', 'string', 'max:120'],
        ]);

        $movements = CashMovement::query()
            ->when($request->integer('cash_box_id'), fn ($q, $id) => $q->where('cash_box_id', $id))
            ->when($request->string('direction')->toString(), fn ($q, $d) => $q->where('direction', $d))
            ->when($request->string('source')->toString(), fn ($q, $s) => $q->where('source', $s))
            ->when($request->date('from'), fn ($q, $from) => $q->whereDate('created_at', '>=', $from))
            ->when($request->date('to'), fn ($q, $to) => $q->whereDate('created_at', '<=', $to))
            ->when($request->string('search')->toString(), fn ($q, $term) => $q->where(
                fn ($sub) => $sub->where('note', 'like', "%{$term}%")
                    ->orWhere('category', 'like', "%{$term}%")
                    ->orWhereHas('payment.customer', fn ($c) => $c->where('name', 'like', "%{$term}%")),
            ))
            ->with(['box', 'actor', 'payment.customer', 'supplierPayment'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'data' => $movements->through(fn (CashMovement $m) => [
                'id' => $m->id,
                'direction' => $m->direction,
                'amount' => (float) $m->amount,
                'source' => $m->source,
                // Custody advances and supplier payments also land here, so the
                // labels come from the one map the report already uses.
                'source_label' => TreasuryReport::LABELS[$m->source] ?? $m->source,
                'box' => $m->box?->name,
                'category' => $m->category,
                'note' => $m->note,
                'customer' => $m->payment?->customer?->name,
                // Supplier payments print and reverse through their own voucher id.
                'supplier_payment_id' => $m->supplier_payment_id,
                // A soft-deleted supplier voucher was cancelled by a reverse entry.
                'supplier_payment_is_cancelled' => $m->source === 'supplier_payment'
                    && $m->supplier_payment_id !== null
                    && $m->supplierPayment === null,
                'actor' => $m->actor?->name,
                'created_at' => $m->created_at?->toIso8601String(),
            ])->items(),
            'meta' => ['total' => $movements->total(), 'last_page' => $movements->lastPage()],
        ]);
    }

    /* ── Headline numbers ────────────────────────────────── */

    public function summary(Request $request): JsonResponse
    {
        $outstanding = (float) Invoice::query()->outstanding()->sum('total');
        $collectedOnOutstanding = (float) Payment::query()
            ->whereIn('invoice_id', Invoice::query()->outstanding()->select('id'))
            ->sum('amount');

        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'cash_box_id' => ['nullable', 'exists:cash_boxes,id'],
        ]);

        return response()->json([
            'cash_on_hand' => round(CashBox::all()->sum(fn (CashBox $b) => $b->balance()), 2),
            'receivable' => round($outstanding - $collectedOnOutstanding, 2),
            'overdue_count' => Invoice::query()->overdue()->count(),
            'collected_this_month' => round((float) Payment::query()
                ->whereBetween('paid_at', [now()->startOfMonth(), now()->endOfMonth()])
                ->sum('amount'), 2),

            // Income and expense over whatever window was asked for. Absent
            // filters mean "everything", which is what an unfiltered screen
            // should show rather than nothing.
            'analysis' => $this->report->forPeriod($filters),
        ]);
    }

    /** One box's ledger, with the balance carried down the page. */
    public function statement(Request $request, CashBox $box): JsonResponse
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        return response()->json([
            'data' => $this->report->statement($box, $filters['from'] ?? null, $filters['to'] ?? null),
        ]);
    }
}

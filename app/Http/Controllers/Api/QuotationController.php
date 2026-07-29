<?php

namespace App\Http\Controllers\Api;

use App\Enums\QuotationStatus;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\Quotation;
use App\Services\SalesService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class QuotationController extends Controller
{
    public function __construct(protected SalesService $sales) {}

    public function index(Request $request): JsonResponse
    {
        $quotations = Quotation::query()
            ->search($request->string('search')->toString())
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('awaiting'), fn ($q) => $q->awaitingDecision())
            ->when($request->boolean('pending_approval'), fn ($q) => $q->pendingApproval())
            ->with(['customer', 'branch', 'salesOrder', 'approver'])
            ->orderByDesc('id')
            ->limit($request->integer('per_page', 50))
            ->get()
            ->map(fn (Quotation $quotation) => $this->present($quotation));

        return response()->json(['data' => $quotations]);
    }

    public function show(Quotation $quotation): JsonResponse
    {
        return response()->json([
            'data' => $this->present($quotation->load(['customer', 'branch', 'asset', 'lines.item', 'salesOrder']), true),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $this->assertBranchBelongsToCustomer($data);

        $quotation = Quotation::create([
            ...collect($data)->except('lines')->all(),
            'created_by' => $request->user()->id,
        ]);

        $this->syncLines($quotation, $data['lines']);
        $quotation = $this->sales->recalculateQuotation($quotation);

        ActivityLog::record('quotation.created', $quotation, "تم إنشاء عرض السعر {$quotation->code}");

        return response()->json(['data' => $this->present($quotation->load(['customer', 'branch', 'lines.item']), true)], 201);
    }

    public function update(Request $request, Quotation $quotation): JsonResponse
    {
        // Once sent, the customer is holding this document. Correcting it means
        // a new quote, not a quiet rewrite of the one they were given.
        if ($quotation->status !== QuotationStatus::Draft) {
            return response()->json([
                'message' => 'لا يمكن تعديل عرض سعر بعد إرساله. أنشئ عرضًا جديدًا بدلًا منه.',
            ], 422);
        }

        $data = $this->validated($request);
        $this->assertBranchBelongsToCustomer($data);

        $quotation->update(collect($data)->except('lines')->all());
        $this->syncLines($quotation, $data['lines']);
        $quotation = $this->sales->recalculateQuotation($quotation);

        return response()->json(['data' => $this->present($quotation->load(['customer', 'branch', 'lines.item']), true)]);
    }

    public function send(Quotation $quotation): JsonResponse
    {
        $sent = $this->sales->send($quotation);

        ActivityLog::record('quotation.sent', $sent, "تم إرسال عرض السعر {$sent->code}");

        return response()->json(['data' => $this->present($sent->load(['customer', 'branch', 'lines.item']), true)]);
    }

    /** The customer accepted — hand it on as a sales order. */
    public function accept(Request $request, Quotation $quotation): JsonResponse
    {
        $order = $this->sales->acceptToOrder($quotation, $request->user());

        ActivityLog::record(
            'quotation.accepted',
            $quotation,
            "تم قبول {$quotation->code} وتحويله إلى {$order->code}",
        );

        return response()->json([
            'data' => ['sales_order_id' => $order->id, 'sales_order_code' => $order->code],
        ], 201);
    }

    public function reject(Request $request, Quotation $quotation): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        $rejected = $this->sales->reject($quotation, $data['reason'] ?? null);

        ActivityLog::record('quotation.rejected', $rejected, "تم رفض عرض السعر {$rejected->code}");

        return response()->json(['data' => $this->present($rejected->load(['customer', 'branch', 'lines.item']), true)]);
    }

    public function cancel(Request $request, Quotation $quotation): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $cancelled = $this->sales->cancel($quotation, $data['reason']);

        return response()->json(['data' => $this->present($cancelled->load(['customer', 'branch', 'lines.item']), true)]);
    }

    /* ── Internal approval ───────────────────────────────── */

    /** Hand a draft to a manager for sign-off before it goes out. */
    public function submit(Quotation $quotation, \App\Services\ApprovalNotifier $approvals): JsonResponse
    {
        abort_unless($quotation->status === QuotationStatus::Draft, 422, 'لا يُقدَّم للاعتماد إلا عرض في المسودة.');

        $quotation->update([
            'submitted_at' => now(),
            'approved_at' => null,
            'approved_by' => null,
            'approval_note' => null,
        ]);

        ActivityLog::record('quotation.submitted', $quotation, "تم تقديم {$quotation->code} للاعتماد");

        $approvals->needed(
            'عرض سعر بانتظار الاعتماد',
            "{$quotation->code} — ".($quotation->customer?->name ?? ''),
            "/sales/approvals?quote={$quotation->id}",
            "quote-{$quotation->id}",
        );

        return response()->json(['data' => $this->present($quotation->fresh()->load(['customer', 'branch', 'approver']))]);
    }

    /** Sign it off — cleared to send to the customer. */
    public function approveQuote(Request $request, Quotation $quotation): JsonResponse
    {
        abort_unless($quotation->isPendingApproval(), 422, 'العرض ليس بانتظار الاعتماد.');

        $quotation->update([
            'approved_at' => now(),
            'approved_by' => $request->user()->id,
            'approval_note' => null,
        ]);

        ActivityLog::record('quotation.approved', $quotation, "تم اعتماد عرض السعر {$quotation->code}");

        return response()->json(['data' => $this->present($quotation->fresh()->load(['customer', 'branch', 'approver']))]);
    }

    /** Send it back to the salesperson with a note instead of approving. */
    public function rejectApproval(Request $request, Quotation $quotation): JsonResponse
    {
        abort_unless($quotation->isPendingApproval(), 422, 'العرض ليس بانتظار الاعتماد.');

        $data = $request->validate(['note' => ['required', 'string', 'max:500']]);

        $quotation->update(['submitted_at' => null, 'approval_note' => $data['note']]);

        ActivityLog::record('quotation.approval_rejected', $quotation, "أُعيد {$quotation->code} للتعديل");

        return response()->json(['data' => $this->present($quotation->fresh()->load(['customer', 'branch', 'approver']))]);
    }

    public function destroy(Quotation $quotation): JsonResponse
    {
        if ($quotation->status !== QuotationStatus::Draft) {
            return response()->json([
                'message' => 'لا يمكن حذف عرض سعر أُرسل. استخدم الإلغاء بدلًا من ذلك.',
            ], 422);
        }

        $quotation->delete();

        return response()->json(['message' => 'تم حذف المسودة.']);
    }

    /* ── Helpers ─────────────────────────────────────────── */

    protected function present(Quotation $quotation, bool $withLines = false): array
    {
        $payload = [
            'id' => $quotation->id,
            'code' => $quotation->code,
            'title' => $quotation->title,

            'customer_id' => $quotation->customer_id,
            'customer' => $quotation->customer?->name,
            'customer_code' => $quotation->customer?->code,
            'branch_id' => $quotation->branch_id,
            'branch' => $quotation->branch?->name,
            'asset_id' => $quotation->asset_id,
            'asset' => $quotation->asset?->serial,

            'issue_date' => $quotation->issue_date?->toDateString(),
            'valid_until' => $quotation->valid_until?->toDateString(),
            'days_remaining' => $quotation->daysRemaining(),

            'status' => $quotation->status->value,
            'status_label' => $quotation->status->label(),
            // What to show: folds in the lapse the server works out on read.
            'effective_status' => $quotation->effectiveStatus(),
            'effective_status_label' => $quotation->effectiveStatusLabel(),

            'subtotal' => (float) $quotation->subtotal,
            'conditions' => $quotation->conditions,
            'discount' => (float) $quotation->discount,
            'discount_percent' => $quotation->discount_percent !== null
                ? (float) $quotation->discount_percent
                : null,
            'tax_rate' => (float) $quotation->tax_rate,
            'tax_amount' => (float) $quotation->tax_amount,
            'total' => (float) $quotation->total,
            'currency' => $quotation->currency,

            'terms' => $quotation->terms,
            'notes' => $quotation->notes,
            'reject_reason' => $quotation->reject_reason,

            'sales_order_id' => $quotation->salesOrder?->id,
            'sales_order_code' => $quotation->salesOrder?->code,

            'submitted_at' => $quotation->submitted_at?->toIso8601String(),
            'approved_at' => $quotation->approved_at?->toIso8601String(),
            'approver' => $quotation->approver?->name,
            'approval_note' => $quotation->approval_note,
            'is_pending_approval' => $quotation->isPendingApproval(),
            'is_approved' => $quotation->isApproved(),

            'created_at' => $quotation->created_at?->toIso8601String(),
        ];

        if ($withLines) {
            $payload['lines'] = $quotation->lines->map(fn ($line) => [
                'id' => $line->id,
                'item_id' => $line->item_id,
                'item_code' => $line->item_code,
                'description' => $line->description,
                // The product behind the line — its kind and nameplate — so the
                // reader understands what is being quoted, not just its price.
                'item_category' => $line->item?->category?->value,
                'item_category_label' => $line->item?->category?->label(),
                'item_specs' => $line->item?->specs ?: null,
                'unit' => $line->item?->unit,
                'qty' => (float) $line->qty,
                'unit_price' => (float) $line->unit_price,
                'line_total' => (float) $line->line_total,
            ])->values();
        }

        return $payload;
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            // The site being quoted. Tied to the chosen customer below, because
            // "exists" alone would let a quote name someone else's branch.
            'branch_id' => ['nullable', 'exists:branches,id'],
            'asset_id' => ['nullable', 'exists:assets,id'],
            'task_id' => ['nullable', 'exists:tasks,id'],
            'title' => ['nullable', 'string', 'max:200'],
            'valid_until' => ['nullable', 'date'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'terms' => ['nullable', 'string', 'max:2000'],
            'conditions' => ['nullable', 'array', 'max:12'],
            'conditions.*.label' => ['required', 'string', 'max:60'],
            'conditions.*.value' => ['required', 'string', 'max:200'],
            'notes' => ['nullable', 'string', 'max:2000'],

            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['required', 'string', 'max:300'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);
    }

    /**
     * A branch belongs to exactly one customer, so quoting one against another
     * is a mix-up worth refusing rather than storing.
     */
    protected function assertBranchBelongsToCustomer(array $data): void
    {
        if (empty($data['branch_id'])) {
            return;
        }

        $owner = Branch::whereKey($data['branch_id'])->value('customer_id');

        if ((int) $owner !== (int) $data['customer_id']) {
            throw ValidationException::withMessages([
                'branch_id' => 'هذا الفرع لا يخص العميل المختار.',
            ]);
        }
    }

    /** Replace every line in one go — drafts are cheap, diffing is not. */
    protected function syncLines(Quotation $quotation, array $lines): void
    {
        $quotation->lines()->delete();

        foreach (array_values($lines) as $sort => $line) {
            $qty = (float) $line['qty'];
            $price = (float) $line['unit_price'];

            $quotation->lines()->create([
                'item_id' => $line['item_id'] ?? null,
                'description' => $line['description'],
                'qty' => $qty,
                'unit_price' => $price,
                'line_total' => round($qty * $price, 2),
                'sort' => $sort,
            ]);
        }
    }
}

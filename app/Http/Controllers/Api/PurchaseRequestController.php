<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\PurchaseRequest;
use App\Models\Supplier;
use App\Services\RequisitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchaseRequestController extends Controller
{
    public function __construct(protected RequisitionService $requisitions) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $requests = PurchaseRequest::query()
            // A technician sees their own requests and nobody else's. Scoped
            // here rather than in the route, the same way jobs are.
            ->when(! $user->canDispatch(), fn ($q) => $q->raisedBy($user->id))
            ->when($request->boolean('awaiting'), fn ($q) => $q->awaiting())
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->with(['requester', 'decider', 'task', 'lines.item', 'order'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'data' => $requests->through(fn (PurchaseRequest $row) => $this->present($row))->items(),
            'meta' => [
                'total' => $requests->total(),
                'last_page' => $requests->lastPage(),
                'awaiting' => PurchaseRequest::query()->awaiting()->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'task_id' => ['nullable', 'exists:tasks,id'],
            'warehouse_id' => ['nullable', 'exists:warehouses,id'],
            'needed_by' => ['nullable', 'date'],
            'priority' => ['nullable', 'in:low,normal,high,urgent'],
            'reason' => ['nullable', 'string', 'max:2000'],

            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['required_without:lines.*.item_id', 'nullable', 'string', 'max:300'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit' => ['nullable', 'string', 'max:24'],
            'lines.*.note' => ['nullable', 'string', 'max:500'],
        ]);

        $purchaseRequest = $this->requisitions->draft($data, $request->user());

        ActivityLog::record('purchase_request.created', $purchaseRequest, "طلب شراء {$purchaseRequest->code}");

        return response()->json(
            ['data' => $this->present($purchaseRequest->load(['lines.item', 'requester']))],
            201,
        );
    }

    public function show(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $this->assertVisible($request, $purchaseRequest);

        return response()->json([
            'data' => $this->present(
                $purchaseRequest->load(['lines.item', 'requester', 'decider', 'task', 'order']),
            ),
        ]);
    }

    public function update(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $this->assertOwner($request, $purchaseRequest);

        $data = $request->validate([
            'needed_by' => ['nullable', 'date'],
            'priority' => ['nullable', 'in:low,normal,high,urgent'],
            'reason' => ['nullable', 'string', 'max:2000'],
            'lines' => ['nullable', 'array'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['nullable', 'string', 'max:300'],
            'lines.*.qty' => ['required_with:lines', 'numeric', 'gt:0'],
            'lines.*.unit' => ['nullable', 'string', 'max:24'],
            'lines.*.note' => ['nullable', 'string', 'max:500'],
        ]);

        $purchaseRequest->update(collect($data)->except('lines')->all());

        if (isset($data['lines'])) {
            $this->requisitions->syncLines($purchaseRequest, $data['lines']);
        }

        return response()->json([
            'data' => $this->present($purchaseRequest->fresh(['lines.item', 'requester'])),
        ]);
    }

    public function submit(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $this->assertOwner($request, $purchaseRequest);

        $submitted = $this->requisitions->submit($purchaseRequest);

        ActivityLog::record('purchase_request.sent', $submitted, "إرسال طلب الشراء {$submitted->code}");

        return response()->json(['data' => $this->present($submitted->load(['lines.item', 'requester']))]);
    }

    /** Approve or refuse. Dispatcher-only, and never one's own request. */
    public function decide(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:approve,reject'],
            'note' => ['nullable', 'string', 'max:500'],
            'reason' => ['required_if:action,reject', 'nullable', 'string', 'max:500'],
        ]);

        $decided = $data['action'] === 'approve'
            ? $this->requisitions->approve($purchaseRequest, $request->user(), $data['note'] ?? null)
            : $this->requisitions->reject($purchaseRequest, $request->user(), $data['reason']);

        ActivityLog::record(
            "purchase_request.{$data['action']}d",
            $decided,
            "طلب الشراء {$decided->code}: {$decided->statusLabel()}",
        );

        return response()->json([
            'data' => $this->present($decided->load(['lines.item', 'requester', 'decider'])),
        ]);
    }

    public function toOrder(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $data = $request->validate(['supplier_id' => ['required', 'exists:suppliers,id']]);

        $order = $this->requisitions->toOrder(
            $purchaseRequest->load('lines.item'),
            Supplier::findOrFail($data['supplier_id']),
            $request->user(),
        );

        ActivityLog::record(
            'purchase_request.ordered',
            $purchaseRequest,
            "تحويل الطلب {$purchaseRequest->code} إلى أمر الشراء {$order->code}",
        );

        return response()->json([
            'data' => ['id' => $order->id, 'code' => $order->code],
        ], 201);
    }

    public function destroy(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $this->assertOwner($request, $purchaseRequest);
        $this->requisitions->discard($purchaseRequest);

        return response()->json(['message' => 'تم حذف الطلب.']);
    }

    /* ── Internals ───────────────────────────────────────── */

    protected function assertVisible(Request $request, PurchaseRequest $purchaseRequest): void
    {
        $user = $request->user();

        abort_if(
            ! $user->canDispatch() && $purchaseRequest->requested_by !== $user->id,
            403,
            'هذا الطلب ليس لك.',
        );
    }

    /** Editing and submitting stay with whoever raised it. */
    protected function assertOwner(Request $request, PurchaseRequest $purchaseRequest): void
    {
        abort_if(
            $purchaseRequest->requested_by !== $request->user()->id,
            403,
            'هذا الطلب ليس لك.',
        );
    }

    /** @return array<string, mixed> */
    protected function present(PurchaseRequest $row): array
    {
        return [
            'id' => $row->id,
            'code' => $row->code,

            'requested_by' => $row->requested_by,
            'requester' => $row->requester?->name,

            'task_id' => $row->task_id,
            'task_code' => $row->task?->code,
            'warehouse' => $row->warehouse?->name,

            'needed_by' => $row->needed_by?->toDateString(),
            'priority' => $row->priority,
            'reason' => $row->reason,

            'status' => $row->status,
            'status_label' => $row->statusLabel(),
            'is_editable' => $row->isEditable(),

            'decided_by' => $row->decided_by,
            'decider' => $row->decider?->name,
            'decided_at' => $row->decided_at?->toIso8601String(),
            'decision_note' => $row->decision_note,

            'purchase_order_id' => $row->purchase_order_id,
            'purchase_order_code' => $row->order?->code,

            'lines' => $row->relationLoaded('lines')
                ? $row->lines->map(fn ($line) => [
                    'id' => $line->id,
                    'item_id' => $line->item_id,
                    'item' => $line->item?->name,
                    'description' => $line->description,
                    'qty' => (float) $line->qty,
                    'unit' => $line->unit,
                    'note' => $line->note,
                    // Flagged so the manager can see, before approving, which
                    // lines cannot become order lines as they stand.
                    'in_catalogue' => $line->item_id !== null,
                ])->values()
                : null,

            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}

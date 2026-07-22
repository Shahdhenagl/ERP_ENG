<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\PurchaseOrder;
use App\Services\PurchasingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchaseOrderController extends Controller
{
    public function __construct(protected PurchasingService $purchasing) {}

    public function index(Request $request): JsonResponse
    {
        $orders = PurchaseOrder::query()
            ->search($request->string('search')->toString())
            ->when($request->integer('supplier_id'), fn ($q, $id) => $q->where('supplier_id', $id))
            ->with(['supplier', 'lines'])
            ->orderByDesc('id')
            ->limit($request->integer('per_page', 50))
            ->get()
            // `open` filters on a derived value, so it is applied after loading
            // rather than pretending it can be done in SQL.
            ->when($request->boolean('open'), fn ($rows) => $rows->filter->isOpen())
            ->map(fn (PurchaseOrder $order) => $this->present($order))
            ->values();

        return response()->json(['data' => $orders]);
    }

    public function show(PurchaseOrder $order): JsonResponse
    {
        return response()->json(['data' => $this->present($order->load(['supplier', 'lines.item']), true)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'expected_date' => ['nullable', 'date'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        $order = PurchaseOrder::create([
            ...collect($data)->except('lines')->all(),
            'created_by' => $request->user()->id,
        ]);

        $this->syncLines($order, $data['lines']);

        ActivityLog::record('purchase_order.created', $order, "تم إنشاء أمر الشراء {$order->code}");

        return response()->json(['data' => $this->present($order->fresh()->load(['supplier', 'lines.item']), true)], 201);
    }

    public function update(Request $request, PurchaseOrder $order): JsonResponse
    {
        // Once sent, the supplier has the order — changing it silently is how
        // a delivery ends up not matching anything.
        if ($order->status !== 'draft') {
            return response()->json([
                'message' => 'لا يمكن تعديل أمر شراء بعد إرساله.',
            ], 422);
        }

        $data = $request->validate([
            'expected_date' => ['nullable', 'date'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        $order->update(collect($data)->except('lines')->all());
        $this->syncLines($order, $data['lines']);

        return response()->json(['data' => $this->present($order->fresh()->load(['supplier', 'lines.item']), true)]);
    }

    public function send(PurchaseOrder $order): JsonResponse
    {
        $sent = $this->purchasing->send($order);

        ActivityLog::record('purchase_order.sent', $sent, "تم إرسال أمر الشراء {$sent->code}");

        return response()->json(['data' => $this->present($sent->load(['supplier', 'lines.item']), true)]);
    }

    public function cancel(Request $request, PurchaseOrder $order): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $cancelled = $this->purchasing->cancel($order, $data['reason']);

        return response()->json(['data' => $this->present($cancelled->load(['supplier', 'lines.item']), true)]);
    }

    /** Book a delivery in against the order. */
    public function receive(Request $request, PurchaseOrder $order): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'min:0'],
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0'],
            'lines.*.serials' => ['nullable', 'array'],
            'lines.*.serials.*' => ['string', 'max:64'],
            'reference' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $movements = $this->purchasing->receiveAgainstOrder(
            $order,
            $data['lines'],
            $request->user(),
            $data,
        );

        ActivityLog::record(
            'purchase_order.received',
            $order,
            "تم استلام ".count($movements)." صنف على {$order->code}",
        );

        return response()->json([
            'data' => $this->present($order->fresh()->load(['supplier', 'lines.item']), true),
        ], 201);
    }

    public function destroy(PurchaseOrder $order): JsonResponse
    {
        if ($order->status !== 'draft') {
            return response()->json(['message' => 'لا يمكن حذف أمر شراء مُرسَل.'], 422);
        }

        $order->delete();

        return response()->json(['message' => 'تم حذف المسودة.']);
    }

    /* ── Helpers ─────────────────────────────────────────── */

    protected function present(PurchaseOrder $order, bool $withLines = false): array
    {
        $received = $order->receivedByItem();

        $payload = [
            'id' => $order->id,
            'code' => $order->code,
            'supplier_id' => $order->supplier_id,
            'supplier' => $order->supplier?->name,
            'order_date' => $order->order_date?->toDateString(),
            'expected_date' => $order->expected_date?->toDateString(),
            'status' => $order->status,
            'fulfilment' => $order->fulfilment(),
            'fulfilment_label' => $order->fulfilmentLabel(),
            'tax_rate' => (float) $order->tax_rate,
            'subtotal' => $order->subtotal(),
            'total' => $order->total(),
            'currency' => $order->currency,
            'notes' => $order->notes,
            'cancel_reason' => $order->cancel_reason,
        ];

        if ($withLines) {
            $payload['lines'] = $order->lines->map(fn ($line) => [
                'id' => $line->id,
                'item_id' => $line->item_id,
                'item' => $line->item?->name,
                'unit' => $line->item?->unit,
                'qty' => (float) $line->qty,
                'unit_price' => (float) $line->unit_price,
                'line_total' => round((float) $line->qty * (float) $line->unit_price, 2),
                'received' => $received[$line->item_id] ?? 0.0,
                'outstanding' => round((float) $line->qty - ($received[$line->item_id] ?? 0), 3),
            ])->values();
        }

        return $payload;
    }

    protected function syncLines(PurchaseOrder $order, array $lines): void
    {
        $order->lines()->delete();

        foreach (array_values($lines) as $sort => $line) {
            $order->lines()->create([
                'item_id' => $line['item_id'],
                'qty' => $line['qty'],
                'unit_price' => $line['unit_price'],
                'sort' => $sort,
            ]);
        }
    }
}

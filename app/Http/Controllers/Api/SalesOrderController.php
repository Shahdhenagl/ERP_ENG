<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\InvoiceResource;
use App\Models\ActivityLog;
use App\Models\SalesOrder;
use App\Models\StockLevel;
use App\Models\Warehouse;
use App\Services\SalesService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesOrderController extends Controller
{
    public function __construct(protected SalesService $sales) {}

    public function index(Request $request): JsonResponse
    {
        $orders = SalesOrder::query()
            ->search($request->string('search')->toString())
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('open'), fn ($q) => $q->open())
            // Lines come along so the delivery screen can say whether the goods
            // are actually on the shelf before anyone promises a date.
            ->with(['customer', 'invoices', 'lines.item'])
            ->orderByDesc('id')
            ->limit($request->integer('per_page', 50))
            ->get()
            // `uninvoiced` filters on a derived value, so it happens after the
            // query rather than pretending it can be expressed in SQL.
            ->when(
                $request->boolean('uninvoiced'),
                fn ($rows) => $rows->filter(fn (SalesOrder $o) => $o->billingState() !== 'invoiced'),
            )
            ->values();

        $stock = $this->onHandFor($orders);

        return response()->json([
            'data' => $orders->map(fn (SalesOrder $order) => [
                ...$this->present($order),
                'stock' => $this->stockReadiness($order, $stock),
            ])->values(),
        ]);
    }

    public function show(SalesOrder $salesOrder): JsonResponse
    {
        return response()->json([
            'data' => $this->present(
                $salesOrder->load(['customer', 'quotation', 'lines.item', 'invoices', 'tasks']),
                true,
            ),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'delivery_date' => ['nullable', 'date'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['required', 'string', 'max:300'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        $order = SalesOrder::create([
            ...collect($data)->except('lines')->all(),
            'created_by' => $request->user()->id,
        ]);

        foreach (array_values($data['lines']) as $sort => $line) {
            $qty = (float) $line['qty'];
            $price = (float) $line['unit_price'];

            $order->lines()->create([
                'item_id' => $line['item_id'] ?? null,
                'description' => $line['description'],
                'qty' => $qty,
                'unit_price' => $price,
                'line_total' => round($qty * $price, 2),
                'sort' => $sort,
            ]);
        }

        $order = $this->sales->recalculateOrder($order);

        ActivityLog::record('sales_order.created', $order, "تم إنشاء أمر البيع {$order->code}");

        return response()->json(['data' => $this->present($order->load(['customer', 'lines.item']), true)], 201);
    }

    public function deliver(SalesOrder $salesOrder): JsonResponse
    {
        $delivered = $this->sales->markDelivered($salesOrder);

        ActivityLog::record('sales_order.delivered', $delivered, "تم تسليم {$delivered->code}");

        return response()->json(['data' => $this->present($delivered->load(['customer', 'lines.item']), true)]);
    }

    public function cancel(Request $request, SalesOrder $salesOrder): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $cancelled = $this->sales->cancelOrder($salesOrder, $data['reason']);

        return response()->json(['data' => $this->present($cancelled->load(['customer', 'lines.item']), true)]);
    }

    /** Draft an invoice from the order lines. Issuing stays a separate call. */
    public function invoice(Request $request, SalesOrder $salesOrder): JsonResponse
    {
        $invoice = $this->sales->invoiceOrder($salesOrder, $request->user());

        ActivityLog::record(
            'invoice.created',
            $invoice,
            "تم إنشاء الفاتورة {$invoice->code} من {$salesOrder->code}",
        );

        return response()->json(new InvoiceResource($invoice->load(['customer', 'lines.item'])), 201);
    }

    /* ── Helpers ─────────────────────────────────────────── */

    /**
     * On-hand quantity in the main store for every item these orders name, in
     * one query. Read per order it would be a query per line, on a screen whose
     * whole job is to show many orders at once.
     *
     * @param  \Illuminate\Support\Collection<int, SalesOrder>  $orders
     * @return array<int, float>
     */
    protected function onHandFor($orders): array
    {
        $itemIds = $orders->flatMap(fn (SalesOrder $o) => $o->lines->pluck('item_id'))
            ->filter()->unique()->values();

        if ($itemIds->isEmpty()) {
            return [];
        }

        return StockLevel::whereIn('item_id', $itemIds)
            ->where('warehouse_id', Warehouse::main()->id)
            ->pluck('qty', 'item_id')
            ->map(fn ($qty) => (float) $qty)
            ->all();
    }

    /**
     * Whether the store can cover this order, and what is missing if not.
     *
     * The invoice is what draws the stock down and it refuses a shortage, so
     * seeing it here — while the order is still a promise — is the difference
     * between rescheduling a delivery and turning a van around at the gate.
     * Quantities are summed per item: the same battery on two lines is one
     * demand on the shelf.
     *
     * @param  array<int, float>  $onHand
     * @return array<string, mixed>
     */
    protected function stockReadiness(SalesOrder $order, array $onHand): array
    {
        $stocked = $order->lines->filter(fn ($line) => $line->item_id);

        if ($stocked->isEmpty()) {
            // Nothing on this order comes off a shelf — labour, or lines typed
            // free-hand. Saying "ready" would imply a check that never ran.
            return ['state' => 'none', 'short' => []];
        }

        $short = $stocked->groupBy('item_id')
            ->map(function ($lines, $itemId) use ($onHand) {
                $needed = (float) $lines->sum('qty');
                $available = $onHand[$itemId] ?? 0.0;

                return $available + 1e-6 < $needed ? [
                    'item' => $lines->first()->item?->name ?? '—',
                    'needed' => $needed,
                    'available' => $available,
                ] : null;
            })
            ->filter()->values();

        return [
            'state' => $short->isEmpty() ? 'ready' : 'short',
            'short' => $short->all(),
        ];
    }

    protected function present(SalesOrder $order, bool $withLines = false): array
    {
        $payload = [
            'id' => $order->id,
            'code' => $order->code,

            'customer_id' => $order->customer_id,
            'customer' => $order->customer?->name,
            'quotation_id' => $order->quotation_id,
            'quotation_code' => $order->quotation?->code,

            'order_date' => $order->order_date?->toDateString(),
            'delivery_date' => $order->delivery_date?->toDateString(),

            'status' => $order->status->value,
            'status_label' => $order->status->label(),
            // Derived from the invoices, so voiding one cannot leave it stale.
            'billing_state' => $order->billingState(),
            'billing_state_label' => $order->billingStateLabel(),

            'subtotal' => (float) $order->subtotal,
            'discount' => (float) $order->discount,
            'tax_rate' => (float) $order->tax_rate,
            'tax_amount' => (float) $order->tax_amount,
            'total' => (float) $order->total,
            'invoiced_total' => $order->invoicedTotal(),
            'currency' => $order->currency,

            'notes' => $order->notes,
            'cancel_reason' => $order->cancel_reason,
            'created_at' => $order->created_at?->toIso8601String(),
        ];

        if ($withLines) {
            $payload['lines'] = $order->lines->map(fn ($line) => [
                'id' => $line->id,
                'item_id' => $line->item_id,
                'description' => $line->description,
                // The product behind the line — its kind and nameplate.
                'item_category' => $line->item?->category?->value,
                'item_category_label' => $line->item?->category?->label(),
                'item_specs' => $line->item?->specs ?: null,
                'unit' => $line->item?->unit,
                'qty' => (float) $line->qty,
                'unit_price' => (float) $line->unit_price,
                'line_total' => (float) $line->line_total,
            ])->values();

            $payload['invoices'] = $order->invoices->map(fn ($invoice) => [
                'id' => $invoice->id,
                'code' => $invoice->code,
                'status' => $invoice->status->value,
                'total' => (float) $invoice->total,
                'payment_state_label' => $invoice->paymentStateLabel(),
            ])->values();
        }

        return $payload;
    }
}

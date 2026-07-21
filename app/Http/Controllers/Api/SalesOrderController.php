<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\InvoiceResource;
use App\Models\ActivityLog;
use App\Models\SalesOrder;
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
            ->with(['customer', 'invoices'])
            ->orderByDesc('id')
            ->limit($request->integer('per_page', 50))
            ->get()
            // `uninvoiced` filters on a derived value, so it happens after the
            // query rather than pretending it can be expressed in SQL.
            ->when(
                $request->boolean('uninvoiced'),
                fn ($rows) => $rows->filter(fn (SalesOrder $o) => $o->billingState() !== 'invoiced'),
            )
            ->map(fn (SalesOrder $order) => $this->present($order))
            ->values();

        return response()->json(['data' => $orders]);
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

        return response()->json(new InvoiceResource($invoice->load(['customer', 'lines'])), 201);
    }

    /* ── Helpers ─────────────────────────────────────────── */

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

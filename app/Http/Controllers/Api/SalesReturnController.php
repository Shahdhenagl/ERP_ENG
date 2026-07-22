<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Invoice;
use App\Models\SalesReturn;
use App\Services\SalesReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SalesReturnController extends Controller
{
    public function __construct(protected SalesReturnService $returns) {}

    public function index(Request $request): JsonResponse
    {
        $returns = SalesReturn::query()
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->integer('invoice_id'), fn ($q, $id) => $q->where('invoice_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->with(['customer', 'invoice', 'warehouse', 'lines.item'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'data' => $returns->through(fn (SalesReturn $return) => $this->present($return))->items(),
            'meta' => ['total' => $returns->total(), 'last_page' => $returns->lastPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'invoice_id' => ['required', 'exists:invoices,id'],
            'warehouse_id' => ['nullable', 'exists:warehouses,id'],
            'return_date' => ['nullable', 'date'],
            'reason' => ['required', 'string', 'max:300'],
            'notes' => ['nullable', 'string', 'max:2000'],

            'lines' => ['required', 'array', 'min:1'],
            'lines.*.invoice_line_id' => ['nullable', 'exists:invoice_lines,id'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['nullable', 'string', 'max:300'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            // Whether the goods go back on a shelf or are written off.
            'lines.*.restock' => ['nullable', 'boolean'],
        ]);

        $return = $this->returns->draft($data, $request->user());

        ActivityLog::record('sales_return.created', $return, "مرتجع مبيعات {$return->code}");

        return response()->json(['data' => $this->present($return->fresh(['lines.item', 'customer', 'invoice']))], 201);
    }

    public function show(SalesReturn $salesReturn): JsonResponse
    {
        return response()->json([
            'data' => $this->present($salesReturn->load(['lines.item', 'customer', 'invoice', 'warehouse'])),
        ]);
    }

    public function update(Request $request, SalesReturn $salesReturn): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:300'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'lines' => ['nullable', 'array'],
            'lines.*.invoice_line_id' => ['nullable', 'exists:invoice_lines,id'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['nullable', 'string', 'max:300'],
            'lines.*.qty' => ['required_with:lines', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'lines.*.restock' => ['nullable', 'boolean'],
        ]);

        $salesReturn->update(collect($data)->except('lines')->all());

        if (isset($data['lines'])) {
            $this->returns->syncLines($salesReturn, $data['lines']);
        }

        return response()->json([
            'data' => $this->present($salesReturn->fresh(['lines.item', 'customer', 'invoice'])),
        ]);
    }

    public function post(Request $request, SalesReturn $salesReturn): JsonResponse
    {
        $return = $this->returns->post($salesReturn, $request->user());

        ActivityLog::record(
            'sales_return.posted',
            $return,
            "ترحيل مرتجع المبيعات {$return->code} بقيمة ".number_format((float) $return->total, 2),
        );

        return response()->json(['data' => $this->present($return->load(['lines.item', 'customer', 'invoice']))]);
    }

    public function destroy(SalesReturn $salesReturn): JsonResponse
    {
        $this->returns->discard($salesReturn);

        return response()->json(['message' => 'تم حذف المسودة.']);
    }

    /**
     * What can still be sent back on an invoice, line by line.
     *
     * Computed here rather than in the screen: the remaining quantity is the
     * guard the service enforces, and a form that offered a different number
     * would be inviting a refusal.
     */
    public function returnable(Invoice $invoice): JsonResponse
    {
        $invoice->load('lines.item');

        // Drafts count too: a quantity already spoken for on an unposted note
        // is not available to a second one, or the two would pass separately
        // and fail together at posting.
        $returned = DB::table('sales_return_lines')
            ->join('sales_returns', 'sales_returns.id', '=', 'sales_return_lines.sales_return_id')
            ->whereNull('sales_returns.deleted_at')
            ->where('sales_returns.invoice_id', $invoice->id)
            ->groupBy('sales_return_lines.invoice_line_id')
            ->selectRaw(
                'sales_return_lines.invoice_line_id as line_id,
                 coalesce(sum(sales_return_lines.qty), 0) as qty',
            )
            ->get()
            ->pluck('qty', 'line_id');

        return response()->json([
            'invoice' => [
                'id' => $invoice->id,
                'code' => $invoice->code,
                'customer' => $invoice->customer?->name,
                'tax_rate' => (float) $invoice->tax_rate,
                'total' => (float) $invoice->total,
                'credited' => $invoice->creditedTotal(),
                'balance' => $invoice->balance(),
            ],
            'lines' => $invoice->lines->map(function ($line) use ($returned) {
                $already = (float) ($returned[$line->id] ?? 0);

                return [
                    'invoice_line_id' => $line->id,
                    'item_id' => $line->item_id,
                    'description' => $line->description,
                    'unit' => $line->item?->unit,
                    'qty' => (float) $line->qty,
                    'returned' => round($already, 3),
                    'remaining' => round((float) $line->qty - $already, 3),
                    'unit_price' => (float) $line->unit_price,
                ];
            })->values(),
        ]);
    }

    /** @return array<string, mixed> */
    protected function present(SalesReturn $return): array
    {
        return [
            'id' => $return->id,
            'code' => $return->code,

            'customer_id' => $return->customer_id,
            'customer' => $return->customer?->name,

            'invoice_id' => $return->invoice_id,
            'invoice_code' => $return->invoice?->code,

            'warehouse_id' => $return->warehouse_id,
            'warehouse' => $return->warehouse?->name,

            'return_date' => $return->return_date?->toDateString(),
            'reason' => $return->reason,

            'status' => $return->status,
            'status_label' => $return->isPosted() ? 'مُرحّل' : 'مسودة',

            'subtotal' => (float) $return->subtotal,
            'tax_rate' => (float) $return->tax_rate,
            'tax_amount' => (float) $return->tax_amount,
            'total' => (float) $return->total,

            'lines' => $return->relationLoaded('lines')
                ? $return->lines->map(fn ($line) => [
                    'id' => $line->id,
                    'invoice_line_id' => $line->invoice_line_id,
                    'item_id' => $line->item_id,
                    'item' => $line->item?->name,
                    'description' => $line->description,
                    'qty' => (float) $line->qty,
                    'unit_price' => (float) $line->unit_price,
                    'line_total' => (float) $line->line_total,
                    'restock' => (bool) $line->restock,
                    'unit_cost' => (float) $line->unit_cost,
                ])->values()
                : null,

            'notes' => $return->notes,
            'created_at' => $return->created_at?->toIso8601String(),
        ];
    }
}

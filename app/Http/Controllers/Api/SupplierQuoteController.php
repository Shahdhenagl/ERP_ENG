<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\PurchaseOrder;
use App\Models\SupplierQuote;
use App\Models\SupplierQuoteLine;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SupplierQuoteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $quotes = SupplierQuote::query()
            ->when($request->integer('supplier_id'), fn ($q, $id) => $q->where('supplier_id', $id))
            ->when(
                $request->integer('purchase_request_id'),
                fn ($q, $id) => $q->where('purchase_request_id', $id),
            )
            ->status($request->string('status')->toString() ?: null)
            ->with(['supplier', 'request', 'order'])
            ->withCount('lines')
            ->orderByDesc('purchase_request_id')
            ->orderByDesc('id')
            ->get()
            ->map(fn (SupplierQuote $quote) => $this->present($quote));

        return response()->json(['data' => $quotes]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $quote = DB::transaction(function () use ($data, $request) {
            $quote = SupplierQuote::create([
                'supplier_id' => $data['supplier_id'],
                'purchase_request_id' => $data['purchase_request_id'] ?? null,
                'quote_date' => $data['quote_date'] ?? null,
                'valid_until' => $data['valid_until'] ?? null,
                'lead_days' => $data['lead_days'] ?? null,
                'tax_rate' => $data['tax_rate'] ?? 0,
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            $this->syncLines($quote, $data['lines']);

            return $quote;
        });

        ActivityLog::record('supplier_quote.created', $quote, "عرض مورد {$quote->code}");

        return response()->json(['data' => $this->present($quote->load(['supplier', 'request', 'lines.item']), full: true)], 201);
    }

    public function show(SupplierQuote $supplierQuote): JsonResponse
    {
        return response()->json([
            'data' => $this->present(
                $supplierQuote->load(['supplier', 'request', 'order', 'lines.item']),
                full: true,
            ),
        ]);
    }

    public function update(Request $request, SupplierQuote $supplierQuote): JsonResponse
    {
        if ($supplierQuote->status !== 'received') {
            throw ValidationException::withMessages([
                'status' => Terms::get('لا يمكن تعديل عرض بعد اعتماده أو رفضه.'),
            ]);
        }

        $data = $this->validated($request);

        DB::transaction(function () use ($supplierQuote, $data) {
            $supplierQuote->update([
                'supplier_id' => $data['supplier_id'],
                'purchase_request_id' => $data['purchase_request_id'] ?? null,
                'quote_date' => $data['quote_date'] ?? $supplierQuote->quote_date,
                'valid_until' => $data['valid_until'] ?? null,
                'lead_days' => $data['lead_days'] ?? null,
                'tax_rate' => $data['tax_rate'] ?? 0,
                'notes' => $data['notes'] ?? null,
            ]);

            $supplierQuote->lines()->delete();
            $this->syncLines($supplierQuote, $data['lines']);
        });

        return response()->json([
            'data' => $this->present($supplierQuote->fresh()->load(['supplier', 'request', 'lines.item']), full: true),
        ]);
    }

    /**
     * Choose this quote. It becomes a draft purchase order, and the other
     * quotes against the same request are rejected — the decision is recorded,
     * not just acted on.
     */
    public function select(SupplierQuote $supplierQuote): JsonResponse
    {
        if ($supplierQuote->status === 'selected') {
            throw ValidationException::withMessages(['status' => Terms::get('العرض معتمد بالفعل.')]);
        }

        $itemLines = $supplierQuote->lines()->whereNotNull('item_id')->get();

        if ($itemLines->isEmpty()) {
            throw ValidationException::withMessages([
                'lines' => Terms::get('لا يمكن تحويل عرض بلا أصناف من الكتالوج إلى أمر شراء.'),
            ]);
        }

        $order = DB::transaction(function () use ($supplierQuote, $itemLines) {
            $order = PurchaseOrder::create([
                'supplier_id' => $supplierQuote->supplier_id,
                'order_date' => now()->toDateString(),
                'tax_rate' => $supplierQuote->tax_rate,
                'status' => 'draft',
                'notes' => "من عرض المورد {$supplierQuote->code}",
                'created_by' => $supplierQuote->created_by,
            ]);

            foreach ($itemLines as $index => $line) {
                $order->lines()->create([
                    'item_id' => $line->item_id,
                    'qty' => $line->qty,
                    'unit_price' => $line->unit_price,
                    'sort' => $index,
                ]);
            }

            $supplierQuote->update(['status' => 'selected', 'purchase_order_id' => $order->id]);

            // Rivals for the same request lose, so the comparison has an answer.
            if ($supplierQuote->purchase_request_id) {
                SupplierQuote::where('purchase_request_id', $supplierQuote->purchase_request_id)
                    ->where('id', '!=', $supplierQuote->id)
                    ->where('status', 'received')
                    ->update(['status' => 'rejected']);
            }

            return $order;
        });

        ActivityLog::record(
            'supplier_quote.selected',
            $supplierQuote,
            "اعتماد عرض {$supplierQuote->code} وإنشاء أمر شراء {$order->code}",
        );

        return response()->json([
            'data' => $this->present($supplierQuote->fresh()->load(['supplier', 'request', 'order', 'lines.item']), full: true),
            'purchase_order' => ['id' => $order->id, 'code' => $order->code],
        ]);
    }

    public function reject(SupplierQuote $supplierQuote): JsonResponse
    {
        if ($supplierQuote->status === 'selected') {
            throw ValidationException::withMessages(['status' => Terms::get('لا يمكن رفض عرض معتمد.')]);
        }

        $supplierQuote->update(['status' => 'rejected']);

        return response()->json(['data' => $this->present($supplierQuote->fresh()->load(['supplier', 'request']))]);
    }

    /* ── Helpers ─────────────────────────────────────────── */

    /** @param array<int, array<string, mixed>> $lines */
    protected function syncLines(SupplierQuote $quote, array $lines): void
    {
        foreach (array_values($lines) as $index => $line) {
            $quote->lines()->create([
                'item_id' => $line['item_id'] ?? null,
                'description' => $line['description'] ?? null,
                'qty' => $line['qty'],
                'unit_price' => $line['unit_price'] ?? 0,
                'sort' => $index,
            ]);
        }
    }

    /** @return array<string, mixed> */
    protected function present(SupplierQuote $quote, bool $full = false): array
    {
        $data = [
            'id' => $quote->id,
            'code' => $quote->code,
            'supplier_id' => $quote->supplier_id,
            'supplier' => $quote->supplier?->name,

            'purchase_request_id' => $quote->purchase_request_id,
            'request_code' => $quote->request?->code,

            'quote_date' => $quote->quote_date?->toDateString(),
            'valid_until' => $quote->valid_until?->toDateString(),
            'status' => $quote->status,
            'status_label' => $quote->statusLabel(),
            'lead_days' => $quote->lead_days,
            'tax_rate' => (float) $quote->tax_rate,

            'subtotal' => $quote->subtotal(),
            'total' => $quote->total(),

            'purchase_order_id' => $quote->purchase_order_id,
            'order_code' => $quote->order?->code,

            'notes' => $quote->notes,
            'lines_count' => $quote->lines_count ?? $quote->lines()->count(),
            'created_at' => $quote->created_at?->toIso8601String(),
        ];

        if ($full) {
            $data['lines'] = $quote->lines->map(fn (SupplierQuoteLine $line) => [
                'id' => $line->id,
                'item_id' => $line->item_id,
                'item' => $line->item?->name,
                'description' => $line->description ?? $line->item?->name,
                'qty' => (float) $line->qty,
                'unit_price' => (float) $line->unit_price,
                'line_total' => $line->lineTotal(),
            ])->values();
        }

        return $data;
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'purchase_request_id' => ['nullable', 'exists:purchase_requests,id'],
            'quote_date' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date'],
            'lead_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],

            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['required_without:lines.*.item_id', 'nullable', 'string', 'max:300'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
        ]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PurchaseReturnResource;
use App\Http\Resources\SupplierInvoiceResource;
use App\Models\ActivityLog;
use App\Models\PurchaseReturn;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Services\SupplierBilling;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class SupplierInvoiceController extends Controller
{
    public function __construct(protected SupplierBilling $billing) {}

    /* ── Bills ───────────────────────────────────────────── */

    public function index(Request $request): AnonymousResourceCollection
    {
        $invoices = SupplierInvoice::query()
            ->when($request->integer('supplier_id'), fn ($q, $id) => $q->where('supplier_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('outstanding'), fn ($q) => $q->outstanding())
            ->when($request->boolean('overdue'), fn ($q) => $q->overdue())
            ->when($request->string('search')->toString(), fn ($q, $term) => $q->where(
                fn ($i) => $i->where('code', 'like', "%{$term}%")
                    ->orWhere('supplier_ref', 'like', "%{$term}%")
                    ->orWhereHas('supplier', fn ($s) => $s->search($term)),
            ))
            ->with(['supplier', 'order'])
            ->withCount('receipts')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return SupplierInvoiceResource::collection($invoices);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'supplier_ref' => ['nullable', 'string', 'max:64'],
            'purchase_order_id' => ['nullable', 'exists:purchase_orders,id'],
            'invoice_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],

            // Either bill goods already received, or type the lines by hand.
            'receipt_ids' => ['nullable', 'array'],
            'receipt_ids.*' => ['integer', 'exists:stock_movements,id'],

            'lines' => ['nullable', 'array'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['required_with:lines', 'string', 'max:300'],
            'lines.*.qty' => ['required_with:lines', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required_with:lines', 'numeric', 'min:0'],
        ]);

        $invoice = $this->billing->draft($data, $request->user());

        ActivityLog::record('supplier_invoice.created', $invoice, "فاتورة مورّد {$invoice->code}");

        return (new SupplierInvoiceResource($invoice->load(['lines', 'supplier'])))
            ->response()->setStatusCode(201);
    }

    public function show(SupplierInvoice $supplierInvoice): SupplierInvoiceResource
    {
        return new SupplierInvoiceResource(
            $supplierInvoice->load(['lines.item', 'supplier', 'order', 'payments'])
                ->loadCount('receipts'),
        );
    }

    public function update(Request $request, SupplierInvoice $supplierInvoice): SupplierInvoiceResource
    {
        $data = $request->validate([
            'supplier_ref' => ['nullable', 'string', 'max:64'],
            'invoice_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'lines' => ['nullable', 'array'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['required_with:lines', 'string', 'max:300'],
            'lines.*.qty' => ['required_with:lines', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required_with:lines', 'numeric', 'min:0'],
        ]);

        $supplierInvoice->update(collect($data)->except('lines')->all());

        if (isset($data['lines'])) {
            $this->billing->syncLines($supplierInvoice, $data['lines']);
        } else {
            $this->billing->recalculate($supplierInvoice);
        }

        return new SupplierInvoiceResource(
            $supplierInvoice->fresh(['lines.item', 'supplier']),
        );
    }

    public function post(SupplierInvoice $supplierInvoice): SupplierInvoiceResource
    {
        $invoice = $this->billing->post($supplierInvoice);

        ActivityLog::record('supplier_invoice.posted', $invoice, "ترحيل فاتورة المورّد {$invoice->code}");

        return new SupplierInvoiceResource($invoice->load(['lines.item', 'supplier']));
    }

    public function void(Request $request, SupplierInvoice $supplierInvoice): SupplierInvoiceResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        $invoice = $this->billing->void($supplierInvoice, $data['reason']);

        ActivityLog::record('supplier_invoice.voided', $invoice, "إلغاء فاتورة المورّد {$invoice->code}");

        return new SupplierInvoiceResource($invoice->load(['lines.item', 'supplier']));
    }

    public function destroy(SupplierInvoice $supplierInvoice): JsonResponse
    {
        if ($supplierInvoice->status !== 'draft') {
            return response()->json(
                ['message' => 'لا يمكن حذف فاتورة مُرحّلة. ألغِها بسبب موثّق.'],
                422,
            );
        }

        $supplierInvoice->receipts()->update(['supplier_invoice_id' => null]);
        $supplierInvoice->delete();

        return response()->json(['message' => 'تم حذف المسودة.']);
    }

    /** Deliveries with no bill against them yet — what a bill is drafted from. */
    public function uninvoicedReceipts(Request $request, Supplier $supplier): JsonResponse
    {
        $receipts = StockMovement::query()
            ->where('supplier_id', $supplier->id)
            ->where('type', 'receipt')
            ->whereNull('supplier_invoice_id')
            ->with(['item', 'purchaseOrder'])
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        return response()->json([
            'data' => $receipts->map(fn (StockMovement $movement) => [
                'id' => $movement->id,
                'item_id' => $movement->item_id,
                'item' => $movement->item?->name,
                'unit' => $movement->item?->unit,
                'qty' => (float) $movement->qty,
                'unit_cost' => (float) $movement->unit_cost,
                'value' => round((float) $movement->qty * (float) $movement->unit_cost, 2),
                'purchase_order_id' => $movement->purchase_order_id,
                'purchase_order_code' => $movement->purchaseOrder?->code,
                'received_at' => $movement->created_at?->toDateString(),
            ]),
            'total' => $supplier->uninvoicedTotal(),
        ]);
    }

    /** One supplier's account, with the balance carried down. */
    public function statement(Request $request, Supplier $supplier): JsonResponse
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        return response()->json([
            'data' => $this->billing->statement(
                $supplier,
                $filters['from'] ?? null,
                $filters['to'] ?? null,
            ),
        ]);
    }

    /* ── Returns ─────────────────────────────────────────── */

    public function returns(Request $request): AnonymousResourceCollection
    {
        $returns = PurchaseReturn::query()
            ->when($request->integer('supplier_id'), fn ($q, $id) => $q->where('supplier_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->with(['supplier', 'invoice', 'warehouse', 'lines.item'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return PurchaseReturnResource::collection($returns);
    }

    public function storeReturn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'supplier_invoice_id' => ['nullable', 'exists:supplier_invoices,id'],
            'warehouse_id' => ['nullable', 'exists:warehouses,id'],
            'return_date' => ['nullable', 'date'],
            'reason' => ['required', 'string', 'max:300'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0'],
        ]);

        $return = $this->billing->draftReturn($data, $request->user());

        ActivityLog::record('purchase_return.created', $return, "مرتجع مشتريات {$return->code}");

        return (new PurchaseReturnResource($return->load(['lines.item', 'supplier', 'warehouse'])))
            ->response()->setStatusCode(201);
    }

    public function postReturn(Request $request, PurchaseReturn $purchaseReturn): PurchaseReturnResource
    {
        $return = $this->billing->postReturn($purchaseReturn, $request->user());

        ActivityLog::record(
            'purchase_return.posted',
            $return,
            "ترحيل مرتجع المشتريات {$return->code} بقيمة ".number_format((float) $return->total, 2),
        );

        return new PurchaseReturnResource($return->load(['lines.item', 'supplier', 'warehouse']));
    }

    public function destroyReturn(PurchaseReturn $purchaseReturn): JsonResponse
    {
        if ($purchaseReturn->isPosted()) {
            return response()->json(
                ['message' => 'لا يمكن حذف مرتجع مُرحّل — البضاعة خرجت بالفعل.'],
                422,
            );
        }

        $purchaseReturn->delete();

        return response()->json(['message' => 'تم حذف المسودة.']);
    }
}

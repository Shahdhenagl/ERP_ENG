<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use App\Services\PurchasingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupplierController extends Controller
{
    public function __construct(protected PurchasingService $purchasing) {}

    public function index(Request $request): JsonResponse
    {
        $suppliers = Supplier::query()
            ->search($request->string('search')->toString())
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->when($request->boolean('owing'), fn ($q) => $q->whereRaw(
                '(select coalesce(sum(qty * unit_cost), 0) from stock_movements
                  where stock_movements.supplier_id = suppliers.id and type = "receipt")
                 > (select coalesce(sum(amount), 0) from supplier_payments
                    where supplier_payments.supplier_id = suppliers.id and deleted_at is null) + 0.005',
            ))
            ->orderBy('name')
            ->get()
            ->map(fn (Supplier $supplier) => $this->present($supplier));

        return response()->json(['data' => $suppliers]);
    }

    public function show(Supplier $supplier): JsonResponse
    {
        $payload = $this->present($supplier);

        $payload['orders'] = $supplier->orders()->latest('id')->limit(20)->get()
            ->map(fn ($order) => [
                'id' => $order->id,
                'code' => $order->code,
                'order_date' => $order->order_date?->toDateString(),
                'total' => $order->total(),
                'fulfilment' => $order->fulfilment(),
                'fulfilment_label' => $order->fulfilmentLabel(),
            ]);

        $payload['payments'] = $supplier->payments()->with('box')->latest('id')->limit(20)->get()
            ->map(fn (SupplierPayment $payment) => [
                'id' => $payment->id,
                'code' => $payment->code,
                'amount' => (float) $payment->amount,
                'method_label' => $payment->method->label(),
                'paid_at' => $payment->paid_at?->toDateString(),
                'cash_box' => $payment->box?->name,
            ]);

        return response()->json(['data' => $payload]);
    }

    public function store(Request $request): JsonResponse
    {
        $supplier = Supplier::create([
            ...$this->validated($request),
            'created_by' => $request->user()->id,
        ]);

        ActivityLog::record('supplier.created', $supplier, "تم إضافة المورّد {$supplier->name}");

        return response()->json(['data' => $this->present($supplier)], 201);
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        $supplier->update($this->validated($request, $supplier));

        return response()->json(['data' => $this->present($supplier->fresh())]);
    }

    public function destroy(Supplier $supplier): JsonResponse
    {
        if ($supplier->receipts()->exists() || $supplier->orders()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف مورّد له حركة. أوقفه بدلًا من ذلك.',
            ], 422);
        }

        $supplier->delete();

        return response()->json(['message' => 'تم حذف المورّد.']);
    }

    /* ── Paying them ─────────────────────────────────────── */

    public function pay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'cash_box_id' => ['nullable', 'exists:cash_boxes,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank_transfer,cheque,wallet'],
            'paid_at' => ['nullable', 'date'],
            'reference' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $payment = $this->purchasing->paySupplier($data, $request->user());

        ActivityLog::record(
            'supplier.paid',
            $payment,
            "سند صرف {$payment->code} بمبلغ ".number_format((float) $payment->amount, 2),
        );

        return response()->json(['data' => ['id' => $payment->id, 'code' => $payment->code]], 201);
    }

    public function reversePayment(Request $request, SupplierPayment $payment): JsonResponse
    {
        $this->purchasing->reversePayment($payment, $request->user());

        return response()->json(['message' => 'تم إلغاء سند الصرف.']);
    }

    /* ── Helpers ─────────────────────────────────────────── */

    protected function present(Supplier $supplier): array
    {
        return [
            'id' => $supplier->id,
            'code' => $supplier->code,
            'name' => $supplier->name,
            'company' => $supplier->company,
            'phone' => $supplier->phone,
            'whatsapp' => $supplier->whatsapp,
            'email' => $supplier->email,
            'address' => $supplier->address,
            'tax_id' => $supplier->tax_id,
            'notes' => $supplier->notes,
            'is_active' => $supplier->is_active,

            // Derived: what arrived, less what was handed over.
            'purchased_total' => $supplier->purchasedTotal(),
            'paid_total' => $supplier->paidTotal(),
            'balance' => $supplier->balance(),
        ];
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Supplier $supplier = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'company' => ['nullable', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:32'],
            'whatsapp' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'tax_id' => [
                'nullable', 'string', 'max:32',
                Rule::unique('suppliers')->ignore($supplier?->id)->whereNull('deleted_at'),
            ],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ]);
    }
}

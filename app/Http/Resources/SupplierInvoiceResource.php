<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\SupplierInvoice */
class SupplierInvoiceResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'supplier_ref' => $this->supplier_ref,

            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => $this->supplier?->name),

            'purchase_order_id' => $this->purchase_order_id,
            'purchase_order_code' => $this->whenLoaded('order', fn () => $this->order?->code),

            'invoice_date' => $this->invoice_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),

            'subtotal' => (float) $this->subtotal,
            'discount' => (float) $this->discount,
            'discount_percent' => $this->discount_percent !== null
                ? (float) $this->discount_percent
                : null,
            'tax_rate' => (float) $this->tax_rate,
            'tax_amount' => (float) $this->tax_amount,
            'total' => (float) $this->total,
            'currency' => $this->currency,

            // What the goods receipt already booked, and what this bill adds on
            // top. Shown because "the total went in but the debt did not move"
            // is otherwise the most alarming thing on the screen.
            'covered_value' => $this->coveredValue(),
            'accrual' => $this->accrual(),

            'paid_total' => $this->paidTotal(),
            'returned_total' => $this->returnedTotal(),
            'balance' => $this->balance(),

            'status' => $this->status,
            'payment_state' => $this->paymentState(),
            'payment_state_label' => $this->paymentStateLabel(),
            'void_reason' => $this->void_reason,

            'lines' => SupplierInvoiceLineResource::collection($this->whenLoaded('lines')),
            'receipts_count' => $this->whenCounted('receipts'),
            // The deliveries behind the bill: what arrived, when, and at what
            // cost — the printed sheet is checked against these, not the total.
            'receipts' => $this->whenLoaded('receipts', fn () => $this->receipts->map(fn ($r) => [
                'id' => $r->id,
                'item' => $r->item?->name,
                'item_code' => $r->item?->code,
                'qty' => (float) $r->qty,
                'unit_cost' => (float) $r->unit_cost,
                'total' => round((float) $r->qty * (float) $r->unit_cost, 2),
                'reference' => $r->reference,
                'moved_on' => $r->created_at?->toDateString(),
            ])->values()),

            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

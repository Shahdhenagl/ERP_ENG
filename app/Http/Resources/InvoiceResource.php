<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Invoice */
class InvoiceResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,

            'customer_id' => $this->customer_id,
            'customer' => new CustomerResource($this->whenLoaded('customer')),
            'task_id' => $this->task_id,
            'task_code' => $this->whenLoaded('task', fn () => $this->task?->code),

            'issue_date' => $this->issue_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),

            'status' => $this->status->value,
            'status_label' => $this->status->label(),

            // Derived on every read — a stored flag would go stale the moment a
            // receipt was edited, and nothing here runs on a timer to fix it.
            'payment_state' => $this->paymentState(),
            'payment_state_label' => $this->paymentStateLabel(),
            'is_overdue' => $this->isOverdue(),

            'subtotal' => (float) $this->subtotal,
            'discount' => (float) $this->discount,
            'tax_rate' => (float) $this->tax_rate,
            'tax_amount' => (float) $this->tax_amount,
            'total' => (float) $this->total,
            'paid_total' => $this->paidTotal(),
            // Credited back by posted returns. Shown separately from what was
            // collected: money that never arrived is not money received.
            'credited_total' => $this->creditedTotal(),
            'balance' => $this->balance(),
            'currency' => $this->currency,

            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn ($line) => [
                'id' => $line->id,
                'item_id' => $line->item_id,
                'item_code' => $line->item_code,
                'description' => $line->description,
                'qty' => (float) $line->qty,
                'unit_price' => (float) $line->unit_price,
                'line_total' => (float) $line->line_total,
            ])->values()),

            'payments' => PaymentResource::collection($this->whenLoaded('payments')),

            'customer_tax_id' => $this->customer_tax_id,
            'notes' => $this->notes,
            'void_reason' => $this->void_reason,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

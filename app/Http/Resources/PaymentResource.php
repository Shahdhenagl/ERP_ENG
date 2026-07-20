<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Payment */
class PaymentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,

            'customer_id' => $this->customer_id,
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->name),
            'invoice_id' => $this->invoice_id,
            'invoice_code' => $this->whenLoaded('invoice', fn () => $this->invoice?->code),

            'cash_box_id' => $this->cash_box_id,
            'cash_box' => $this->whenLoaded('box', fn () => $this->box?->name),

            'amount' => (float) $this->amount,
            'method' => $this->method->value,
            'method_label' => $this->method->label(),

            'paid_at' => $this->paid_at?->toDateString(),
            'reference' => $this->reference,
            'note' => $this->note,

            'actor' => $this->whenLoaded('actor', fn () => $this->actor?->name),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

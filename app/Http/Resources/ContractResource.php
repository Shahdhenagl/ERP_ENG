<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Contract */
class ContractResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'label' => $this->title ?: "عقد صيانة {$this->code}",

            'customer_id' => $this->customer_id,
            'customer' => new CustomerResource($this->whenLoaded('customer')),

            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
            'visits_per_year' => $this->visits_per_year,
            'days_remaining' => $this->daysRemaining(),

            // What the operator set, kept separate from what the calendar says.
            // Only `status` can be written back; `effective_status` is the one
            // worth showing, and it is derived on every read because nothing on
            // this host can run on a timer to flip it.
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'effective_status' => $this->effectiveStatus(),
            'effective_status_label' => $this->effectiveStatusLabel(),

            'value' => $this->value,
            'currency' => $this->currency,

            'billing_frequency' => $this->billing_frequency->value,
            'billing_frequency_label' => $this->billing_frequency->label(),

            // The instalment schedule, and the two facts the UI gates on: whether
            // the contract may be activated yet, and which visits are held for pay.
            'first_payment_collected' => $this->firstPaymentCollected(),
            'held_visit_sequences' => $this->relationLoaded('payments')
                ? $this->payments->where('status', 'due')->whereNotNull('due_visit_sequence')
                    ->pluck('due_visit_sequence')->values()
                : [],
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'id' => $p->id,
                'sequence' => $p->sequence,
                'amount' => (float) $p->amount,
                'due_visit_sequence' => $p->due_visit_sequence,
                'status' => $p->status,
                'status_label' => $p->statusLabel(),
                'is_upfront' => $p->isUpfront(),
                'collected_at' => $p->collected_at?->toIso8601String(),
                'invoice_id' => $p->invoice_id,
                'invoice_code' => $p->invoice?->code,
            ])->values()),
            'payments_total' => $this->relationLoaded('payments')
                ? round((float) $this->payments->sum('amount'), 2)
                : null,
            'collected_total' => $this->relationLoaded('payments')
                ? round((float) $this->payments->where('status', 'collected')->sum('amount'), 2)
                : null,

            'sla_response_hours' => $this->sla_response_hours,
            'sla_resolution_hours' => $this->sla_resolution_hours,

            'renewed_from_id' => $this->renewed_from_id,
            'renewed_from_code' => $this->renewedFrom?->code,
            // Set once a successor exists, which is what stops a second one.
            'renewal_code' => $this->renewal?->code,
            'notes' => $this->notes,

            'assets_count' => $this->whenCounted('assets'),
            'assets' => AssetResource::collection($this->whenLoaded('assets')),

            'visits_count' => $this->whenCounted('visits'),
            'visits' => ContractVisitResource::collection($this->whenLoaded('visits')),

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

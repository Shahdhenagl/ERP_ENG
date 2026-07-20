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

            'sla_response_hours' => $this->sla_response_hours,
            'sla_resolution_hours' => $this->sla_resolution_hours,

            'notes' => $this->notes,

            'assets_count' => $this->whenCounted('assets'),
            'assets' => AssetResource::collection($this->whenLoaded('assets')),

            'visits_count' => $this->whenCounted('visits'),
            'visits' => ContractVisitResource::collection($this->whenLoaded('visits')),

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

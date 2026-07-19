<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Asset */
class AssetResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'serial' => $this->serial,

            'brand' => $this->brand,
            'model' => $this->model,
            'capacity' => $this->capacity,
            'label' => trim("{$this->brand} {$this->model}") ?: ($this->serial ?? $this->code),

            'customer_id' => $this->customer_id,
            'customer' => new CustomerResource($this->whenLoaded('customer')),

            'site_address' => $this->site_address,
            'site_lat' => $this->site_lat,
            'site_lng' => $this->site_lng,

            'sold_at' => $this->sold_at?->toDateString(),
            'installed_at' => $this->installed_at?->toDateString(),
            'warranty_months' => $this->warranty_months,
            // Null means "we cannot tell" — a missing sale date is not the same
            // as an expired warranty, and the UI has to say so.
            'warranty_ends_at' => $this->warrantyEndsAt()?->toDateString(),
            'under_warranty' => $this->isUnderWarranty(),
            'warranty_label' => $this->warrantyLabel(),

            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'notes' => $this->notes,

            'tasks_count' => $this->whenCounted('tasks'),
            'tasks' => TaskResource::collection($this->whenLoaded('tasks')),

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

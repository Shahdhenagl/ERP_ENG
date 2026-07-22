<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\WarrantyClaim */
class WarrantyClaimResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,

            'warranty_id' => $this->warranty_id,
            'warranty' => new WarrantyResource($this->whenLoaded('warranty')),

            'asset_id' => $this->asset_id,
            'asset' => $this->whenLoaded('asset', fn () => $this->asset?->label()),
            'asset_code' => $this->whenLoaded('asset', fn () => $this->asset?->code),
            'serial' => $this->whenLoaded('asset', fn () => $this->asset?->serial),
            'customer' => $this->whenLoaded('asset', fn () => $this->asset?->customer?->name),

            'reported_on' => $this->reported_on?->toDateString(),
            'fault' => $this->fault,

            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_final' => $this->status->isFinal(),
            'decision_note' => $this->decision_note,

            // How long it has been open — the number that embarrasses, and the
            // reason it is on the list row rather than buried in the detail.
            'age_days' => $this->ageInDays(),

            'task_id' => $this->task_id,
            'task_code' => $this->whenLoaded('task', fn () => $this->task?->code),
            'task_status' => $this->whenLoaded('task', fn () => $this->task?->status?->label()),

            'replacement_asset_id' => $this->replacement_asset_id,
            'replacement' => $this->whenLoaded('replacement', fn () => $this->replacement?->label()),
            'replacement_code' => $this->whenLoaded('replacement', fn () => $this->replacement?->code),

            'resolved_at' => $this->resolved_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

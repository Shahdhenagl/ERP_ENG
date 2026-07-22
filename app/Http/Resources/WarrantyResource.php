<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Warranty */
class WarrantyResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,

            'asset_id' => $this->asset_id,
            'asset' => $this->whenLoaded('asset', fn () => $this->asset?->label()),
            'asset_code' => $this->whenLoaded('asset', fn () => $this->asset?->code),
            'serial' => $this->whenLoaded('asset', fn () => $this->asset?->serial),

            'customer_id' => $this->customer_id,
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->name),

            'kind' => $this->kind->value,
            'kind_label' => $this->kind->label(),
            'covers' => $this->covers,
            'covers_label' => $this->coversLabel(),

            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
            // Negative once the term has elapsed, which is what makes the
            // number worth printing rather than clamping at zero.
            'days_remaining' => $this->daysRemaining(),

            'status' => $this->status,
            // Derived on every read: nothing on this host flips a flag when a
            // term runs out, so a stored status would lie by the next morning.
            'effective_status' => $this->effectiveStatus(),
            'effective_status_label' => $this->effectiveStatusLabel(),
            'void_reason' => $this->void_reason,

            'parent_id' => $this->parent_id,
            'parent_code' => $this->whenLoaded('parent', fn () => $this->parent?->code),

            'invoice_id' => $this->invoice_id,
            'invoice_code' => $this->whenLoaded('invoice', fn () => $this->invoice?->code),
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => $this->supplier?->name),
            'supplier_reference' => $this->supplier_reference,

            'terms' => $this->terms,
            'notes' => $this->notes,

            'claims_count' => $this->whenCounted('claims'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

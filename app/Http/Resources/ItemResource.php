<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Item */
class ItemResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'sku' => $this->sku,
            'name' => $this->name,

            'category' => $this->category->value,
            'category_label' => $this->category->label(),
            'unit' => $this->unit,

            'avg_cost' => (float) $this->avg_cost,
            'reorder_level' => (float) $this->reorder_level,

            'total_qty' => $this->totalQty(),
            'stock_value' => $this->stockValue(),
            'below_reorder_level' => $this->isBelowReorderLevel(),

            // Where it is sitting right now — the store and every van holding any.
            'levels' => $this->whenLoaded('levels', fn () => $this->levels
                ->map(fn ($level) => [
                    'warehouse_id' => $level->warehouse_id,
                    'warehouse' => $level->warehouse?->name,
                    'type' => $level->warehouse?->type->value,
                    'qty' => (float) $level->qty,
                ])
                ->values()),

            'notes' => $this->notes,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

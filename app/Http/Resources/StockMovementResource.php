<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\StockMovement */
class StockMovementResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'type_label' => $this->type->label(),

            'item_id' => $this->item_id,
            'item' => $this->whenLoaded('item', fn () => [
                'id' => $this->item->id,
                'name' => $this->item->name,
                'unit' => $this->item->unit,
            ]),

            'qty' => (float) $this->qty,
            'unit_cost' => (float) $this->unit_cost,
            'value' => $this->value(),

            'from' => $this->whenLoaded('from', fn () => $this->from?->name),
            'to' => $this->whenLoaded('to', fn () => $this->to?->name),

            'task_id' => $this->task_id,
            'task_code' => $this->whenLoaded('task', fn () => $this->task?->code),

            'supplier' => $this->supplier,
            'reference' => $this->reference,
            'note' => $this->note,

            'actor' => $this->whenLoaded('actor', fn () => $this->actor?->name),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

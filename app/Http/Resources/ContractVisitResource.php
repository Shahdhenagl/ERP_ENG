<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\ContractVisit */
class ContractVisitResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sequence' => $this->sequence,
            'planned_for' => $this->planned_for?->toDateString(),

            'status' => $this->status->value,
            'status_label' => $this->status->label(),

            // Drives whether the UI offers to move this visit: a locked one
            // survives any change to the contract.
            'is_locked' => $this->isLocked(),

            'task_id' => $this->task_id,
            'task' => new TaskResource($this->whenLoaded('task')),
        ];
    }
}

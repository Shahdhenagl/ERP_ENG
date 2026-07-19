<?php

namespace App\Http\Resources;

use App\Enums\TaskStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\TaskStatusLog */
class TaskStatusLogResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'from_status' => $this->from_status,
            'from_label' => $this->from_status
                ? TaskStatus::from($this->from_status)->label()
                : null,
            'to_status' => $this->to_status,
            'to_label' => TaskStatus::from($this->to_status)->label(),
            'note' => $this->note,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'user' => new UserResource($this->whenLoaded('user')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

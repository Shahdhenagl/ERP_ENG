<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\User */
class UserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            // What this user may actually do. The nav is built from it, so a
            // screen nobody may open is never offered in the first place.
            'permissions' => $this->permissions(),
            'role_label' => $this->role->label(),
            'phone' => $this->phone,
            'whatsapp' => $this->whatsapp,
            'whatsapp_number' => $this->whatsappNumber(),
            'job_title' => $this->job_title,
            'is_active' => $this->is_active,
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'open_tasks_count' => $this->whenCounted('assignedTasks'),
        ];
    }
}

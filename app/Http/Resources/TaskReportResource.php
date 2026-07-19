<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin \App\Models\TaskReport */
class TaskReportResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'readings' => [
                'input_voltage' => $this->input_voltage,
                'output_voltage' => $this->output_voltage,
                'frequency' => $this->frequency,
                'load_percent' => $this->load_percent,
                'battery_voltage' => $this->battery_voltage,
                'temperature' => $this->temperature,
                'backup_minutes' => $this->backup_minutes,
            ],
            'device_condition' => $this->device_condition,
            'batteries_need_replacement' => $this->batteries_need_replacement,
            'findings' => $this->findings,
            'actions_taken' => $this->actions_taken,
            'recommendations' => $this->recommendations,
            'parts_used' => $this->parts_used ?? [],
            'signature_url' => $this->signature_path
                ? Storage::disk('public')->url($this->signature_path)
                : null,
            'signed_by_name' => $this->signed_by_name,
            'signed_at' => $this->signed_at?->toIso8601String(),
            'author' => new UserResource($this->whenLoaded('author')),
            'attachments' => TaskAttachmentResource::collection($this->whenLoaded('attachments')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

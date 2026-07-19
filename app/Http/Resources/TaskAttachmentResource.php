<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\TaskAttachment */
class TaskAttachmentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'url' => $this->url,
            'original_name' => $this->original_name,
            'mime' => $this->mime,
            'size' => $this->size,
            'caption' => $this->caption,
            'uploader' => new UserResource($this->whenLoaded('uploader')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

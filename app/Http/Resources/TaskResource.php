<?php

namespace App\Http\Resources;

use App\Services\WhatsAppLinkBuilder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Task */
class TaskResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $whatsapp = app(WhatsAppLinkBuilder::class);

        return [
            'id' => $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'description' => $this->description,

            'type' => $this->type->value,
            'type_label' => $this->type->label(),
            'priority' => $this->priority->value,
            'priority_label' => $this->priority->label(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'allowed_next' => array_map(
                fn ($s) => ['value' => $s->value, 'label' => $s->label()],
                $this->status->allowedNext(),
            ),
            'is_terminal' => $this->status->isTerminal(),

            'customer' => new CustomerResource($this->whenLoaded('customer')),
            'technician' => new UserResource($this->whenLoaded('technician')),
            'creator' => new UserResource($this->whenLoaded('creator')),

            'site_address' => $this->site_address,
            'site_lat' => $this->site_lat,
            'site_lng' => $this->site_lng,
            'effective_address' => $this->effectiveAddress(),
            'navigation_url' => $this->navigationUrl(),

            'asset_id' => $this->asset_id,
            'asset' => new AssetResource($this->whenLoaded('asset')),

            // Kept as a flat summary so a task row can show the device without
            // eager-loading the asset — the registry is the source of truth.
            'device' => $this->relationLoaded('asset') && $this->asset
                ? [
                    'brand' => $this->asset->brand,
                    'model' => $this->asset->model,
                    'serial' => $this->asset->serial,
                    'capacity' => $this->asset->capacity,
                ]
                : null,

            'contract_id' => $this->contract_id,
            'contract' => $this->relationLoaded('contract') && $this->contract
                ? [
                    'id' => $this->contract->id,
                    'code' => $this->contract->code,
                    'label' => $this->contract->title ?: "عقد صيانة {$this->contract->code}",
                ]
                : null,

            // Deadlines are stored; whether they were missed is worked out on
            // every read. A stored breach flag would drift the moment a
            // timestamp changed, and nothing here runs on a timer to fix it.
            'sla' => $this->response_due_at || $this->resolution_due_at
                ? [
                    'response_due_at' => $this->response_due_at?->toIso8601String(),
                    'resolution_due_at' => $this->resolution_due_at?->toIso8601String(),
                    'response_breached' => $this->hasBreachedResponse(),
                    'resolution_breached' => $this->hasBreachedResolution(),
                ]
                : null,

            'scheduled_at' => $this->scheduled_at?->toIso8601String(),
            'accepted_at' => $this->accepted_at?->toIso8601String(),
            'on_the_way_at' => $this->on_the_way_at?->toIso8601String(),
            'started_at' => $this->started_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'cancel_reason' => $this->cancel_reason,

            // Ready-to-tap WhatsApp links — manager briefs the technician,
            // technician reports back to the manager.
            'whatsapp' => [
                'brief_technician' => $this->whenLoaded(
                    'technician',
                    fn () => $whatsapp->link(
                        $this->technician?->whatsappNumber(),
                        $whatsapp->taskBriefMessage($this->resource),
                    ),
                ),
                'brief_customer' => $this->whenLoaded(
                    'customer',
                    fn () => $whatsapp->link(
                        $this->customer?->whatsappNumber(),
                        $whatsapp->taskBriefMessage($this->resource),
                    ),
                ),
                'report_manager' => $this->whenLoaded(
                    'creator',
                    fn () => $whatsapp->link(
                        $this->creator?->whatsappNumber(),
                        $whatsapp->completionMessage($this->resource),
                    ),
                ),
            ],

            'status_logs' => TaskStatusLogResource::collection($this->whenLoaded('statusLogs')),
            'reports' => TaskReportResource::collection($this->whenLoaded('reports')),
            'attachments' => TaskAttachmentResource::collection($this->whenLoaded('attachments')),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}

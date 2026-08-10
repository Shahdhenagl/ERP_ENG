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

        // Time on site: the diagnosis report is filed on arrival, the completion
        // report on the way out — so the two stamps bound the visit.
        $reports = $this->relationLoaded('reports') ? $this->reports : collect();
        $timeIn = $reports->firstWhere('type', 'diagnosis')?->created_at;
        $timeOut = $reports->firstWhere('type', 'completion')?->created_at;

        return [
            'id' => $this->id,
            'code' => $this->code,
            'service_report_no' => $this->service_report_no,
            'visit' => [
                'time_in' => $timeIn?->toIso8601String(),
                'time_out' => $timeOut?->toIso8601String(),
                'duration_minutes' => $timeIn && $timeOut ? (int) round($timeIn->diffInMinutes($timeOut)) : null,
            ],
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
            'technicians' => UserResource::collection($this->whenLoaded('technicians')),
            'creator' => new UserResource($this->whenLoaded('creator')),

            // The active postponement request (pending / last resolved)
            'pending_postponement' => $this->when(
                $this->relationLoaded('postponements'),
                fn () => $this->postponements
                    ->where('status', 'pending')
                    ->sortByDesc('id')
                    ->first()
                    ? [
                        'id'           => $this->postponements->where('status','pending')->sortByDesc('id')->first()->id,
                        'postponed_to' => $this->postponements->where('status','pending')->sortByDesc('id')->first()->postponed_to?->toDateString(),
                        'reason'       => $this->postponements->where('status','pending')->sortByDesc('id')->first()->reason,
                        'requested_by' => $this->postponements->where('status','pending')->sortByDesc('id')->first()->requester?->name,
                        'status'       => 'pending',
                    ]
                    : null,
            ),

            'site_address' => $this->site_address,
            'site_lat' => $this->site_lat,
            'site_lng' => $this->site_lng,
            'effective_address' => $this->effectiveAddress(),
            'navigation_url' => $this->navigationUrl(),

            'branch_id' => $this->branch_id,
            'branch' => $this->relationLoaded('branch') && $this->branch
                ? [
                    'id' => $this->branch->id,
                    'name' => $this->branch->name,
                    'address' => $this->branch->address,
                    'maps_url' => $this->branch->mapsUrl(),
                    'contact_name' => $this->branch->contact_name,
                    'contact_number' => $this->branch->contactNumber(),
                    'working_hours' => $this->branch->working_hours,
                    // خط السير to reach this site, and the float it implies.
                    'route' => $this->branch->route,
                    'route_total' => $this->branch->routeTotal(),
                ]
                : null,

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
                    'technicians',
                    fn () => $whatsapp->link(
                        $this->technicians->first()?->whatsappNumber(),
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

            // What the technician spent on this job out of their float.
            'expenses' => $this->relationLoaded('expenses')
                ? $this->expenses->map(fn ($m) => [
                    'id' => $m->id,
                    'amount' => (float) $m->amount,
                    'category' => $m->category,
                    'note' => $m->note,
                    'receipt_url' => $m->receiptUrl(),
                    'by' => $m->actor?->name,
                    'created_at' => $m->created_at?->toIso8601String(),
                ])->values()
                : null,
            'expenses_total' => $this->relationLoaded('expenses')
                ? round((float) $this->expenses->sum('amount'), 2)
                : null,

            'status_logs' => TaskStatusLogResource::collection($this->whenLoaded('statusLogs')),
            'reports' => TaskReportResource::collection($this->whenLoaded('reports')),
            'attachments' => TaskAttachmentResource::collection($this->whenLoaded('attachments')),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}

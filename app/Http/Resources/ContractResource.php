<?php

namespace App\Http\Resources;

use App\Enums\ContractBillingFrequency;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Schema;

/** @mixin \App\Models\Contract */
class ContractResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        // Keep the contracts list readable while a production database is
        // waiting for the approved billing/renewal migrations. These defaults
        // describe legacy contracts and do not write anything to the database.
        $billingFrequency = $this->billing_frequency ?? ContractBillingFrequency::Upfront;
        $hasRenewalColumn = Schema::hasColumn('contracts', 'renewed_from_id');

        return [
            'id' => $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'label' => $this->title ?: "عقد صيانة {$this->code}",

            'customer_id' => $this->customer_id,
            'customer' => new CustomerResource($this->whenLoaded('customer')),

            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
            'visits_per_year' => $this->visits_per_year,
            // Null means "spread from the start"; a date anchors the schedule.
            'first_visit_on' => $this->first_visit_on?->toDateString(),
            'days_remaining' => $this->daysRemaining(),

            // What the operator set, kept separate from what the calendar says.
            // Only `status` can be written back; `effective_status` is the one
            // worth showing, and it is derived on every read because nothing on
            // this host can run on a timer to flip it.
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'effective_status' => $this->effectiveStatus(),
            'effective_status_label' => $this->effectiveStatusLabel(),

            'value' => $this->value,
            'currency' => $this->currency,

            'billing_frequency' => $billingFrequency->value,
            'billing_frequency_label' => $billingFrequency->label(),
            'collection_timing' => $this->collection_timing ?? 'upfront',
            'collection_timing_label' => ($this->collection_timing ?? 'upfront') === 'arrears'
                ? 'مؤخر بعد الخدمة'
                : 'مقدّم مع اعتماد العقد',
            'includes_spare_parts' => (bool) $this->includes_spare_parts,

            // The instalment schedule, and the two facts the UI gates on: whether
            // the contract may be activated yet, and which visits are held for pay.
            'first_payment_collected' => $this->firstPaymentCollected(),
            'held_visit_sequences' => $this->relationLoaded('payments')
                ? $this->payments->where('status', 'due')->whereNotNull('due_visit_sequence')
                    ->pluck('due_visit_sequence')->values()
                : [],
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'id' => $p->id,
                'sequence' => $p->sequence,
                'amount' => (float) $p->amount,
                'service_year' => $p->service_year ?? (int) ceil($p->sequence / max(1, $this->instalmentsPerYear())),
                'period_number' => $p->period_number ?? ((($p->sequence - 1) % max(1, $this->instalmentsPerYear())) + 1),
                'service_from_visit_sequence' => $p->service_from_visit_sequence,
                'service_to_visit_sequence' => $p->service_to_visit_sequence,
                'due_on' => $p->due_on?->toDateString(),
                'service_label' => $p->service_from_visit_sequence && $p->service_to_visit_sequence
                    ? "بعد الزيارات {$p->service_from_visit_sequence}–{$p->service_to_visit_sequence}"
                    : (($this->collection_timing ?? 'upfront') === 'arrears' ? 'بعد تنفيذ الخدمة' : 'مع اعتماد العقد'),
                'due_visit_sequence' => $p->due_visit_sequence,
                'status' => $p->status,
                'status_label' => $p->statusLabel(),
                'is_upfront' => $p->isUpfront(),
                'collected_at' => $p->collected_at?->toIso8601String(),
                'invoice_id' => $p->invoice_id,
                'invoice_code' => $p->invoice?->code,
                'service_stats' => $this->paymentVisitStats($p),
                'workflow' => $p->relationLoaded('installmentWorkflow') && $p->installmentWorkflow ? [
                    'id' => $p->installmentWorkflow->id,
                    'status' => $p->installmentWorkflow->status,
                    'completed_at' => $p->installmentWorkflow->completed_at?->toIso8601String(),
                    'template' => $p->installmentWorkflow->relationLoaded('template') && $p->installmentWorkflow->template ? [
                        'id' => $p->installmentWorkflow->template->id,
                        'name' => $p->installmentWorkflow->template->name,
                    ] : null,
                    'steps' => $p->installmentWorkflow->relationLoaded('steps') ? $p->installmentWorkflow->steps->map(fn ($step) => [
                        'id' => $step->id,
                        'name' => $step->name,
                        'description' => $step->description,
                        'sort_order' => $step->sort_order,
                        'is_required' => (bool) $step->is_required,
                        'completed' => $step->completed_at !== null,
                        'completed_at' => $step->completed_at?->toIso8601String(),
                        'completed_by' => $step->completer?->name,
                        'notes' => $step->notes,
                        'attachments' => $step->relationLoaded('attachments') ? $step->attachments->map(fn ($attachment) => [
                            'id' => $attachment->id,
                            'url' => $attachment->url,
                            'is_image' => $attachment->is_image,
                            'original_name' => $attachment->original_name,
                            'mime' => $attachment->mime,
                            'size' => $attachment->size,
                            'caption' => $attachment->caption,
                        ])->values() : [],
                    ])->values() : [],
                ] : null,
            ])->values()),
            'payments_total' => $this->relationLoaded('payments')
                ? round((float) $this->payments->sum('amount'), 2)
                : null,
            'collected_total' => $this->relationLoaded('payments')
                ? round((float) $this->payments->where('status', 'collected')->sum('amount'), 2)
                : null,

            'sla_response_hours' => $this->sla_response_hours,
            'sla_resolution_hours' => $this->sla_resolution_hours,

            'renewed_from_id' => $hasRenewalColumn ? $this->renewed_from_id : null,
            'renewed_from_code' => $hasRenewalColumn ? $this->renewedFrom?->code : null,
            // Set once a successor exists, which is what stops a second one.
            'renewal_code' => $hasRenewalColumn ? $this->renewal?->code : null,
            'notes' => $this->notes,
            'terms' => $this->terms,

            'assets_count' => $this->whenCounted('assets'),
            'assets' => AssetResource::collection($this->whenLoaded('assets')),

            'visits_count' => $this->whenCounted('visits'),
            'visits' => ContractVisitResource::collection($this->whenLoaded('visits')),

            // A contract answers for every live branch the customer has, and a
            // round fans out to one job each — so the year's real workload is
            // branches × rounds. Only sent where the customer is loaded; a list
            // would pay for the count once per row to say nothing new.
            'branches_count' => $this->when(
                $this->relationLoaded('customer'),
                fn () => $this->coveredBranchesCount(),
            ),
            'jobs_per_year' => $this->when(
                $this->relationLoaded('customer'),
                fn () => $this->jobsPerYear(),
            ),
            // Named, so the printed contract can schedule the sites it protects
            // rather than assert a number.
            'branches' => $this->when(
                $this->relationLoaded('customer'),
                fn () => $this->coveredBranches()->map(fn ($branch) => [
                    'id' => $branch->id,
                    'name' => $branch->name,
                    'address' => $branch->address,
                ])->values(),
            ),

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed>|null */
    protected function paymentVisitStats($payment): ?array
    {
        if (! $this->relationLoaded('visits') || ! $payment->service_from_visit_sequence || ! $payment->service_to_visit_sequence) {
            return null;
        }

        $visits = $this->visits->whereBetween('sequence', [
            $payment->service_from_visit_sequence,
            $payment->service_to_visit_sequence,
        ]);
        $statusCounts = $visits->groupBy(fn ($visit) => $visit->status->value)
            ->map(fn ($group) => $group->count())
            ->all();
        $tasks = $visits->flatMap(fn ($visit) => $visit->relationLoaded('tasks') ? $visit->tasks : collect());
        $branchCounts = $tasks->groupBy(fn ($task) => $task->branch?->name ?? 'الموقع الرئيسي')
            ->map(fn ($branchTasks, $branch) => [
                'branch' => $branch,
                'total' => $branchTasks->count(),
                'completed' => $branchTasks->where('status', \App\Enums\TaskStatus::Completed)->count(),
                'statuses' => $branchTasks->groupBy(fn ($task) => $task->status->value)->map->count()->all(),
            ])->values()->all();

        return [
            'visits_total' => $visits->count(),
            'visits_completed' => $visits->where('status', \App\Enums\VisitStatus::Done)->count(),
            'visits_statuses' => $statusCounts,
            'branch_tasks_total' => $tasks->count(),
            'branch_tasks_completed' => $tasks->where('status', \App\Enums\TaskStatus::Completed)->count(),
            'branches' => $branchCounts,
        ];
    }
}

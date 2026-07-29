<?php

namespace App\Http\Resources;

use App\Enums\TaskStatus;
use App\Models\Task;
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

            // A round is one visit to every covered branch, so the honest unit
            // of progress is "how many of its branches are done", not whether a
            // single representative job closed.
            'jobs_count' => $this->when(
                $this->relationLoaded('tasks'),
                fn () => $this->tasks->count(),
            ),
            'jobs_done' => $this->when(
                $this->relationLoaded('tasks'),
                fn () => $this->tasks->where('status', TaskStatus::Completed)->count(),
            ),
            'jobs' => $this->whenLoaded('tasks', fn () => $this->tasks
                ->map(fn (Task $task) => [
                    'id' => $task->id,
                    'code' => $task->code,
                    'status' => $task->status->value,
                    'status_label' => $task->status->label(),
                    'branch' => $task->branch?->name,
                    'technician' => $task->technician?->name,
                ])
                ->values()),
        ];
    }
}

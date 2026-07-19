<?php

namespace App\Services;

use App\Enums\TaskStatus;
use App\Models\ActivityLog;
use App\Models\Task;
use App\Models\TaskStatusLog;
use App\Models\User;
use App\Notifications\TaskAssigned;
use App\Notifications\TaskStatusChanged;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Single owner of every status change a job can undergo. Controllers never
 * write `status` directly — routing it all through here is what guarantees the
 * timestamp trail, the audit log, and the notifications stay in sync.
 */
class TaskWorkflow
{
    /**
     * Move a job to a new status.
     *
     * @param  array{note?: string|null, lat?: float|null, lng?: float|null, cancel_reason?: string|null}  $context
     *
     * @throws ValidationException when the transition is not allowed
     */
    public function transition(
        Task $task,
        TaskStatus $to,
        User $actor,
        array $context = [],
    ): Task {
        $from = $task->status;

        if ($from === $to) {
            throw ValidationException::withMessages([
                'status' => "المهمة بالفعل في حالة «{$to->label()}».",
            ]);
        }

        if (! $from->canTransitionTo($to)) {
            throw ValidationException::withMessages([
                'status' => "لا يمكن الانتقال من «{$from->label()}» إلى «{$to->label()}».",
            ]);
        }

        return DB::transaction(function () use ($task, $from, $to, $actor, $context) {
            $task->status = $to;

            if ($column = $to->timestampColumn()) {
                $task->{$column} = now();
            }

            if ($to === TaskStatus::Cancelled) {
                $task->cancel_reason = $context['cancel_reason'] ?? ($context['note'] ?? null);
            }

            $task->save();

            TaskStatusLog::create([
                'task_id' => $task->id,
                'user_id' => $actor->id,
                'from_status' => $from->value,
                'to_status' => $to->value,
                'note' => $context['note'] ?? null,
                'lat' => $context['lat'] ?? null,
                'lng' => $context['lng'] ?? null,
            ]);

            ActivityLog::record(
                action: 'task.status_changed',
                subject: $task,
                description: "{$task->code}: {$from->label()} ← {$to->label()}",
                properties: ['from' => $from->value, 'to' => $to->value],
            );

            $this->notifyStatusChange($task, $from, $to, $actor);

            return $task->fresh(['customer', 'technician', 'creator']);
        });
    }

    /**
     * Assign (or reassign) a job to a technician and alert them.
     */
    public function assign(Task $task, ?User $technician, User $actor): Task
    {
        $previous = $task->assigned_to;

        $task->assigned_to = $technician?->id;
        $task->save();

        ActivityLog::record(
            action: 'task.assigned',
            subject: $task,
            description: $technician
                ? "{$task->code} أُسندت إلى {$technician->name}"
                : "{$task->code} أُلغي إسنادها",
            properties: ['from' => $previous, 'to' => $technician?->id],
        );

        if ($technician && $technician->id !== $previous) {
            $technician->notify(new TaskAssigned($task));
        }

        return $task->fresh(['customer', 'technician', 'creator']);
    }

    /**
     * Managers who should hear about a job moving: whoever dispatched it, plus
     * every admin. Technicians hear about their own assignment instead.
     */
    protected function notifyStatusChange(Task $task, TaskStatus $from, TaskStatus $to, User $actor): void
    {
        $recipients = User::query()
            ->active()
            ->where(function ($q) use ($task) {
                $q->where('role', 'admin')
                    ->orWhere('id', $task->created_by);
            })
            ->where('id', '!=', $actor->id)   // don't notify whoever pushed the button
            ->get();

        foreach ($recipients as $recipient) {
            $recipient->notify(new TaskStatusChanged($task, $from, $to, $actor));
        }
    }
}

<?php

namespace App\Services;

use App\Enums\TaskStatus;
use App\Enums\VisitStatus;
use App\Models\ActivityLog;
use App\Models\Task;
use App\Models\TaskStatusLog;
use App\Models\User;
use App\Notifications\TaskAssigned;
use App\Notifications\TaskStatusChanged;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

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

        DB::transaction(function () use ($task, $from, $to, $actor, $context) {
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

            // A completed maintenance visit closes its plan entry, so PPM
            // compliance counts the visits actually carried out — not just the
            // ones a work order was cut for. A round fans out to one job per
            // branch, so it is only done once every branch's job is: closing it
            // on the first would count a round nobody finished.
            if ($to === TaskStatus::Completed && ($visit = $task->contractVisit)) {
                if ($visit->status === VisitStatus::Scheduled) {
                    $open = $visit->tasks()
                        ->whereNotIn('status', [TaskStatus::Completed->value, TaskStatus::Cancelled->value])
                        ->exists();

                    if (! $open) {
                        $visit->update(['status' => VisitStatus::Done->value]);
                    }
                }
            }
        });

        // Outside the transaction and on purpose. On this deployment the queue
        // runs `sync`, so a notification is delivered inline — a slow SMTP host
        // or a dead push subscription would otherwise roll back a status change
        // the technician already made in the field.
        $this->notifyStatusChange($task, $from, $to, $actor);

        return $task->fresh(['customer', 'technicians', 'creator']);
    }

    /**
     * Assign (or reassign) a job to a technician and alert them.
     */
    public function assign(Task $task, ?User $technician, User $actor): Task
    {
        // The relationship `technicians` is synced before calling this method.
        // We only need to record the activity and send the push notification.

        ActivityLog::record(
            action: 'task.assigned',
            subject: $task,
            description: $technician
                ? "{$task->code} أُسندت إلى {$technician->name}"
                : "{$task->code} أُلغي إسنادها",
            properties: ['from' => $previous, 'to' => $technician?->id],
        );

        if ($technician && $technician->id !== $previous) {
            $this->deliver($technician, new TaskAssigned($task));
        }

        return $task->fresh(['customer', 'technicians', 'creator']);
    }

    /**
     * Managers who should hear about a job moving: whoever dispatched it, plus
     * every admin. Technicians hear about their own assignment instead.
     */
    protected function notifyStatusChange(Task $task, TaskStatus $from, TaskStatus $to, User $actor): void
    {
        $techIds = $task->technicians()->pluck('users.id')->all();

        $recipients = User::query()
            ->active()
            ->where(function ($q) use ($task, $techIds) {
                $q->where('role', 'admin')
                    ->orWhere('id', $task->created_by)
                    ->orWhereIn('id', $techIds);
            })
            ->where('id', '!=', $actor->id)   // don't notify whoever pushed the button
            ->get();

        foreach ($recipients as $recipient) {
            $this->deliver($recipient, new TaskStatusChanged($task, $from, $to, $actor));
        }
    }

    /**
     * Send a notification without letting a delivery problem become the
     * caller's problem. The work already happened; failing to announce it is
     * worth a log line, not a failed request the technician has to retry.
     */
    protected function deliver(User $recipient, Notification $notification): void
    {
        try {
            $recipient->notify($notification);
        } catch (Throwable $e) {
            Log::warning('Notification delivery failed', [
                'recipient' => $recipient->id,
                'notification' => $notification::class,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

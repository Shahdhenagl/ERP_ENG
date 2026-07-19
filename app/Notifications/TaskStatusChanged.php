<?php

namespace App\Notifications;

use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

class TaskStatusChanged extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Task $task,
        public TaskStatus $from,
        public TaskStatus $to,
        public User $actor,
    ) {}

    /**
     * Intermediate steps only warrant an in-app nudge; completion and
     * cancellation are worth an email.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        $channels = ['database', WebPushChannel::class];

        if ($this->to->isTerminal()) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $task = $this->task->loadMissing(['customer', 'completionReport']);

        $mail = (new MailMessage)
            ->subject("{$task->code} — {$this->to->label()}")
            ->greeting("أهلاً {$notifiable->name}")
            ->line("قام {$this->actor->name} بتحديث حالة المهمة إلى **{$this->to->label()}**.")
            ->line("**رقم المهمة:** {$task->code}")
            ->line("**الموضوع:** {$task->title}")
            ->line("**العميل:** {$task->customer->name}");

        if ($this->to === TaskStatus::Cancelled && $task->cancel_reason) {
            $mail->line("**سبب الإلغاء:** {$task->cancel_reason}");
        }

        if ($report = $task->completionReport) {
            if ($report->findings) {
                $mail->line("**ما تم رصده:** {$report->findings}");
            }

            if ($report->actions_taken) {
                $mail->line("**ما تم تنفيذه:** {$report->actions_taken}");
            }

            if ($report->batteries_need_replacement) {
                $mail->line('⚠️ **البطاريات تحتاج استبدال.**');
            }
        }

        return $mail
            ->action('عرض المهمة', url("/tasks/{$task->id}"))
            ->salutation('City Engineering');
    }

    public function toWebPush(object $notifiable, $notification): WebPushMessage
    {
        $task = $this->task->loadMissing('customer');

        return (new WebPushMessage)
            ->title("{$task->code} — {$this->to->label()}")
            ->body("{$this->actor->name} · {$task->customer->name}")
            ->icon('/brand/icon-192.png')
            ->badge('/brand/badge.png')
            ->tag("task-{$task->id}")
            ->data(['url' => "/tasks/{$task->id}", 'task_id' => $task->id])
            ->options(['TTL' => 86400]);
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'task.status_changed',
            'task_id' => $this->task->id,
            'code' => $this->task->code,
            'title' => $this->task->title,
            'from' => $this->from->value,
            'to' => $this->to->value,
            'actor' => $this->actor->name,
            'url' => "/tasks/{$this->task->id}",
        ];
    }
}

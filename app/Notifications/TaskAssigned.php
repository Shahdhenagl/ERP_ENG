<?php

namespace App\Notifications;

use App\Models\Task;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

class TaskAssigned extends Notification
{
    public function __construct(public Task $task) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database', 'mail', WebPushChannel::class];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $task = $this->task->loadMissing(['customer', 'branch']);

        $mail = (new MailMessage)
            ->subject("مهمة جديدة {$task->code} — {$task->title}")
            ->greeting("أهلاً {$notifiable->name}")
            ->line('تم إسناد مهمة جديدة إليك.')
            ->line("**رقم المهمة:** {$task->code}")
            ->line("**النوع:** {$task->type->label()}")
            ->line("**الأولوية:** {$task->priority->label()}")
            ->line("**العميل:** {$task->customer->name}")
            ->line('**الفرع:** '.($task->branch?->name ?? 'بدون فرع محدد'))
            ->line("**الهاتف:** {$task->customer->phone}");

        if ($address = $task->effectiveAddress()) {
            $mail->line("**العنوان:** {$address}");
        }

        if ($task->scheduled_at) {
            $mail->line('**الموعد:** '.$task->scheduled_at->format('Y-m-d H:i'));
        }

        if ($task->description) {
            $mail->line("**التفاصيل:** {$task->description}");
        }

        return $mail
            ->action('فتح المهمة', url("/tasks/{$task->id}"))
            ->salutation('City Engineering');
    }

    public function toWebPush(object $notifiable, $notification): WebPushMessage
    {
        $task = $this->task->loadMissing(['customer', 'branch']);
        $context = $this->context($task);

        return (new WebPushMessage)
            ->title("مهمة جديدة — {$task->priority->label()}")
            ->body($context)
            ->icon('/brand/icon-192.png')
            ->badge('/brand/badge.png')
            ->tag("task-{$task->id}")
            ->data(['url' => "/tasks/{$task->id}", 'task_id' => $task->id])
            ->options(['TTL' => 86400]);
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $task = $this->task->loadMissing(['customer', 'branch']);

        return [
            'type' => 'task.assigned',
            'task_id' => $task->id,
            'code' => $task->code,
            'title' => $task->title,
            'body' => $this->customerAndBranch($task),
            'priority' => $task->priority->value,
            'customer' => $task->customer?->name,
            'branch' => $task->branch?->name ?? 'بدون فرع محدد',
            'url' => "/tasks/{$task->id}",
        ];
    }

    private function context(Task $task): string
    {
        return implode(' — ', array_filter([
            $task->title,
            $task->customer?->name,
            $task->branch?->name ?? 'بدون فرع محدد',
        ]));
    }

    private function customerAndBranch(Task $task): string
    {
        return implode(' — ', array_filter([
            $task->customer?->name,
            $task->branch?->name ?? 'بدون فرع محدد',
        ]));
    }
}

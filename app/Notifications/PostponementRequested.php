<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\TaskPostponement;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;
use Illuminate\Notifications\Messages\MailMessage;

class PostponementRequested extends Notification
{
    public function __construct(
        public Task $task,
        public TaskPostponement $postponement
    ) {}

    public function via($notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    public function toArray($notifiable): array
    {
        $task = $this->task->loadMissing(['customer', 'branch']);

        return [
            'type' => 'postponement_requested',
            'task_id' => $task->id,
            'task_code' => $task->code,
            'code' => $task->code,
            'title' => $task->title,
            'customer' => $task->customer?->name,
            'branch' => $task->branch?->name ?? 'بدون فرع محدد',
            'body' => "طلب {$this->postponement->requester->name} التأجيل إلى {$this->postponement->postponed_to->format('Y-m-d')}",
            'url' => "/tasks/{$task->id}",
        ];
    }

    public function toWebPush($notifiable, $notification): WebPushMessage
    {
        $task = $this->task->loadMissing(['customer', 'branch']);

        return (new WebPushMessage)
            ->title('طلب تأجيل مهمة: ' . $task->code)
            ->icon('/icon.png')
            ->body($this->context($task)." · طلب {$this->postponement->requester->name} التأجيل")
            ->action('عرض التفاصيل', "/tasks/{$task->id}");
    }

    private function context(Task $task): string
    {
        return implode(' — ', [$task->title, $task->customer?->name ?? 'بدون عميل', $task->branch?->name ?? 'بدون فرع محدد']);
    }
}

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
        return [
            'type' => 'postponement_requested',
            'task_id' => $this->task->id,
            'task_code' => $this->task->code,
            'title' => 'طلب تأجيل مهمة',
            'body' => "طلب {$this->postponement->requester->name} تأجيل المهمة {$this->task->code} إلى {$this->postponement->postponed_to->format('Y-m-d')}",
            'url' => "/tasks/{$this->task->id}",
        ];
    }

    public function toWebPush($notifiable, $notification): WebPushMessage
    {
        return (new WebPushMessage)
            ->title('طلب تأجيل مهمة: ' . $this->task->code)
            ->icon('/icon.png')
            ->body("طلب {$this->postponement->requester->name} التأجيل إلى {$this->postponement->postponed_to->format('Y-m-d')}")
            ->action('عرض التفاصيل', "/tasks/{$this->task->id}");
    }
}

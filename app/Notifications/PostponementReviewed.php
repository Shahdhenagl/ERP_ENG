<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\TaskPostponement;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

class PostponementReviewed extends Notification
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
        $statusAr = $this->postponement->status === 'approved' ? 'بالموافقة على' : 'برفض';
        return [
            'type' => 'postponement_reviewed',
            'task_id' => $this->task->id,
            'task_code' => $this->task->code,
            'title' => 'الرد على طلب التأجيل',
            'body' => "تم الرد {$statusAr} طلب تأجيل المهمة {$this->task->code}",
            'url' => "/tasks/{$this->task->id}",
        ];
    }

    public function toWebPush($notifiable, $notification): WebPushMessage
    {
        $statusAr = $this->postponement->status === 'approved' ? 'تمت الموافقة على' : 'تم رفض';
        return (new WebPushMessage)
            ->title('تحديث حالة طلب التأجيل')
            ->icon('/icon.png')
            ->body("{$statusAr} طلب تأجيل المهمة {$this->task->code}")
            ->action('عرض التفاصيل', "/tasks/{$this->task->id}");
    }
}

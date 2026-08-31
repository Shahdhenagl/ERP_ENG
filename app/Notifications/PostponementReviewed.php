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
        $task = $this->task->loadMissing(['customer', 'branch']);
        $statusAr = $this->postponement->status === 'approved' ? 'بالموافقة على' : 'برفض';
        return [
            'type' => 'postponement_reviewed',
            'task_id' => $task->id,
            'task_code' => $task->code,
            'code' => $task->code,
            'title' => $task->title,
            'customer' => $task->customer?->name,
            'branch' => $task->branch?->name ?? 'بدون فرع محدد',
            'body' => "تم الرد {$statusAr} طلب التأجيل",
            'url' => "/tasks/{$task->id}",
        ];
    }

    public function toWebPush($notifiable, $notification): WebPushMessage
    {
        $task = $this->task->loadMissing(['customer', 'branch']);
        $statusAr = $this->postponement->status === 'approved' ? 'تمت الموافقة على' : 'تم رفض';
        return (new WebPushMessage)
            ->title('تحديث حالة طلب التأجيل')
            ->icon('/icon.png')
            ->body($this->context($task)." · {$statusAr} طلب التأجيل")
            ->action('عرض التفاصيل', "/tasks/{$task->id}");
    }

    private function context(Task $task): string
    {
        return implode(' — ', [$task->title, $task->customer?->name ?? 'بدون عميل', $task->branch?->name ?? 'بدون فرع محدد']);
    }
}

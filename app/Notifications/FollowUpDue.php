<?php

namespace App\Notifications;

use App\Models\FollowUp;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

/**
 * The nudge that a promise to call someone back has come due.
 *
 * Deliberately no mail channel: this fires on a schedule, and a daily email for
 * every due follow-up is how a mailbox filter learns to hide the whole sender.
 * It lands in the bell and, if the device allowed it, as a push — both of which
 * a person chooses to look at.
 */
class FollowUpDue extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public FollowUp $followUp) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    public function toWebPush(object $notifiable, $notification): WebPushMessage
    {
        $subject = $this->followUp->subjectName() ?? 'عميل';

        return (new WebPushMessage)
            ->title("متابعة مستحقة — {$this->followUp->typeLabel()}")
            ->body($subject)
            ->icon('/brand/icon-192.png')
            ->badge('/brand/badge.png')
            ->tag("followup-{$this->followUp->id}")
            ->data(['url' => '/crm', 'follow_up_id' => $this->followUp->id])
            ->options(['TTL' => 86400]);
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'followup.due',
            'follow_up_id' => $this->followUp->id,
            'title' => 'متابعة مستحقة: '.($this->followUp->subjectName() ?? 'عميل'),
            'follow_up_type' => $this->followUp->typeLabel(),
            'due_at' => $this->followUp->due_at?->toDateString(),
            'url' => '/crm',
        ];
    }
}

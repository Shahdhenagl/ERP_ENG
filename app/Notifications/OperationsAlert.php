<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

/**
 * An operational alert raised by the daily sweep — a warranty about to lapse, an
 * invoice overdue, a part run low. One shape for every kind; the `type` tells
 * the bell which it is and the `url` where to act on it.
 *
 * No mail: a daily email per alert is how a mailbox learns to hide the sender.
 * It lands in the bell and, where allowed, as a push.
 *
 * Sent inline rather than queued. This host has no worker — the same reason
 * maintenance rides on request traffic — so a queued notification is a row in
 * `jobs` and nothing more: no bell entry, no push, no error. A push is one HTTP
 * call to the browser's push service and every caller already treats it as
 * best-effort, so the cost of sending it where it is raised is a fraction of a
 * second and the alternative is not sending it at all.
 */
class OperationsAlert extends Notification
{
    public function __construct(
        public string $type,
        public string $title,
        public string $body,
        public string $url,
        public string $tag,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    public function toWebPush(object $notifiable, $notification): WebPushMessage
    {
        return (new WebPushMessage)
            ->title($this->title)
            ->body($this->body)
            ->icon('/brand/icon-192.png')
            ->badge('/brand/badge.png')
            ->tag($this->tag)
            ->data(['url' => $this->url, 'type' => $this->type])
            ->options(['TTL' => 86400]);
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => $this->type,
            'title' => $this->title,
            'body' => $this->body,
            'url' => $this->url,
        ];
    }
}

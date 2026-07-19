<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

/**
 * A push with nothing behind it — used by `php artisan push:test` to prove the
 * VAPID keys, the service worker and the browser subscription all line up.
 *
 * Deliberately not queued and deliberately not stored in the notification
 * bell: a delivery check should not leave anything behind for the user to
 * clear out afterwards.
 */
class TestPush extends Notification
{
    public function __construct(private string $body)
    {
    }

    /** @return array<int, class-string> */
    public function via(object $notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush(object $notifiable, $notification): WebPushMessage
    {
        return (new WebPushMessage)
            ->title('اختبار الإشعارات')
            ->body($this->body)
            ->icon('/brand/icon-192.png')
            ->badge('/brand/badge.png')
            // No tag: successive test pushes should stack rather than replace
            // each other, so a second run is visibly a second notification.
            ->data(['url' => '/'])
            ->options(['TTL' => 3600]);
    }
}

<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\User;
use App\Notifications\OperationsAlert;

/**
 * Tells the managers that something is waiting on their sign-off.
 *
 * Anything that enters an approval queue — a quote, a leave request, a purchase
 * request — pushes a live notification to every active admin and manager, so it
 * lands in the bell (and as a desktop push) the moment it is raised rather than
 * on the next daily sweep. Sending is best-effort per recipient: a failing push
 * to one manager must never roll back the action that raised it.
 */
class ApprovalNotifier
{
    public function needed(string $title, string $body, string $url, string $tag): void
    {
        User::query()
            ->where('is_active', true)
            ->whereIn('role', [UserRole::Admin->value, UserRole::Manager->value])
            ->get()
            ->each(function (User $manager) use ($title, $body, $url, $tag) {
                try {
                    $manager->notify(new OperationsAlert('approval.needed', $title, $body, $url, $tag));
                } catch (\Throwable $e) {
                    report($e);
                }
            });
    }
}

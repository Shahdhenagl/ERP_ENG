<?php

namespace App\Services;

use App\Models\AlertDispatch;
use App\Models\User;
use App\Notifications\OperationsAlert;
use Illuminate\Support\Facades\Cache;

/**
 * Turns the conditions the scanner finds into alerts that actually reach a
 * manager.
 *
 * The scanner already runs on every load of the alerts board, which is why the
 * board has always been right while nothing was ever sent: the dispatch lived
 * in `alerts:sweep`, a console command nothing schedules. There is no cron on
 * this host — the same reason maintenance planning rides on request traffic —
 * so an overdue invoice sat on the board indefinitely and never rang a bell.
 *
 * A dispatch ledger keyed per condition is what keeps this from re-alerting the
 * same invoice on every sweep: a condition alerts once, and acting on it is the
 * manager's job rather than the sweep's.
 */
class OperationsAlertDispatcher
{
    protected const THROTTLE_KEY = 'operations-alerts:last-run';

    /** Often enough to be timely, rarely enough not to scan on every page. */
    protected const THROTTLE_MINUTES = 20;

    public function __construct(protected OperationsAlertScanner $scanner) {}

    /**
     * Opportunistic sweep, called from endpoints managers hit anyway.
     *
     * Locked because two managers loading the dashboard together would
     * otherwise both sweep and race the ledger; throttled because scanning
     * every condition on every page view is waste.
     */
    public function tick(): void
    {
        if (Cache::get(self::THROTTLE_KEY) !== null) {
            return;
        }

        $lock = Cache::lock('operations-alerts', 60);

        if (! $lock->get()) {
            return;
        }

        try {
            $this->dispatch();
            Cache::put(self::THROTTLE_KEY, now()->toIso8601String(), now()->addMinutes(self::THROTTLE_MINUTES));
        } finally {
            $lock->release();
        }
    }

    /**
     * Send every condition not already alerted.
     *
     * @return int conditions newly alerted
     */
    public function dispatch(): int
    {
        $alerts = $this->scanner->scan();

        if ($alerts->isEmpty()) {
            return 0;
        }

        $recipients = User::query()
            ->whereIn('role', ['admin', 'manager'])
            ->where('is_active', true)
            ->get();

        $sent = 0;

        foreach ($alerts as $alert) {
            // A key that already exists was already alerted, so there is
            // nothing new to send.
            if (! AlertDispatch::firstOrCreate(['key' => $alert['key']])->wasRecentlyCreated) {
                continue;
            }

            foreach ($recipients as $user) {
                try {
                    $user->notify(new OperationsAlert(
                        $alert['type'], $alert['title'], $alert['body'], $alert['url'], $alert['tag'],
                    ));
                } catch (\Throwable $e) {
                    // One dead subscription must not stop the rest of the sweep,
                    // and must not leave the ledger claiming it was sent.
                    report($e);
                }
            }

            $sent++;
        }

        return $sent;
    }
}

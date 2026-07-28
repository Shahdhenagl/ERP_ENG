<?php

namespace App\Console\Commands;

use App\Models\AlertDispatch;
use App\Models\User;
use App\Notifications\OperationsAlert;
use App\Services\OperationsAlertScanner;
use Illuminate\Console\Command;

/**
 * The daily sweep that turns operational conditions into alerts and sends them to
 * the managers.
 *
 * The conditions themselves are detected by OperationsAlertScanner — shared with
 * the alerts board so the two never disagree. This command's own job is only the
 * dispatch: a stable key per condition and a dispatch ledger keep it from
 * re-alerting the same overdue invoice every morning. A condition alerts once;
 * acting on it is the manager's.
 */
class SendOperationsAlerts extends Command
{
    protected $signature = 'alerts:sweep';

    protected $description = 'رصد الأعطال والصيانة والضمانات والفواتير وقطع الغيار وإطلاق التنبيهات';

    public function __construct(protected OperationsAlertScanner $scanner)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $alerts = $this->scanner->scan();

        $recipients = User::query()
            ->whereIn('role', ['admin', 'manager'])
            ->where('is_active', true)
            ->get();

        $sent = 0;

        foreach ($alerts as $alert) {
            // Insert once per condition; a key that already exists was already
            // alerted, so there is nothing new to send.
            if (! AlertDispatch::firstOrCreate(['key' => $alert['key']])->wasRecentlyCreated) {
                continue;
            }

            foreach ($recipients as $user) {
                $user->notify(new OperationsAlert(
                    $alert['type'], $alert['title'], $alert['body'], $alert['url'], $alert['tag'],
                ));
            }

            $sent++;
        }

        $this->info("تنبيهات جديدة: {$sent} من {$alerts->count()} حالة مرصودة.");

        return self::SUCCESS;
    }
}

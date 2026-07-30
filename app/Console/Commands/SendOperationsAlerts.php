<?php

namespace App\Console\Commands;

use App\Services\OperationsAlertDispatcher;
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

    public function __construct(protected OperationsAlertDispatcher $dispatcher)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $sent = $this->dispatcher->dispatch();

        $this->info("تنبيهات جديدة: {$sent}.");

        return self::SUCCESS;
    }
}

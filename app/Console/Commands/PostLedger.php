<?php

namespace App\Console\Commands;

use App\Services\FinancialReports;
use App\Services\LedgerBackfill;
use Illuminate\Console\Command;

class PostLedger extends Command
{
    protected $signature = 'accounting:post';

    protected $description = 'ترحيل كل مستند لم يصل إلى دفتر اليومية بعد';

    public function handle(LedgerBackfill $backfill, FinancialReports $reports): int
    {
        $this->info('جارٍ الترحيل…');

        $posted = $backfill->run();

        $this->table(
            ['المستند', 'قيود جديدة'],
            [
                ['الفواتير', $posted['invoices']],
                ['حركة الخزينة', $posted['cash_movements']],
                ['حركة المخزون', $posted['stock_movements']],
            ],
        );

        // A backfill that leaves anything behind has hit a rule it could not
        // apply, and saying so is more use than a cheerful total.
        $remaining = array_sum($reports->unposted());

        if ($remaining > 0) {
            $this->warn("ما زال هناك {$remaining} مستند بدون قيد — راجع سجل الأخطاء.");

            return self::FAILURE;
        }

        $sheet = $reports->balanceSheet();

        $this->info(sprintf(
            'الأصول %s مقابل الخصوم وحقوق الملكية %s.',
            number_format($sheet['assets_total'], 2),
            number_format($sheet['liabilities_and_equity_total'], 2),
        ));

        return self::SUCCESS;
    }
}

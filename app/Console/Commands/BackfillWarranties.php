<?php

namespace App\Console\Commands;

use App\Services\WarrantyService;
use Illuminate\Console\Command;

class BackfillWarranties extends Command
{
    protected $signature = 'warranties:backfill';

    protected $description = 'إنشاء سجلات ضمان للأجهزة المسجّل عليها تاريخ بيع ومدة ضمان';

    public function handle(WarrantyService $warranties): int
    {
        $created = $warranties->backfillFromAssets();

        $this->info($created > 0
            ? "تم إنشاء {$created} سجل ضمان من بيانات البيع."
            : 'لا توجد أجهزة تحتاج ترحيلًا.');

        return self::SUCCESS;
    }
}

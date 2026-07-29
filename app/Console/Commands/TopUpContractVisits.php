<?php

namespace App\Console\Commands;

use App\Models\Contract;
use App\Services\MaintenancePlanner;
use Illuminate\Console\Command;

class TopUpContractVisits extends Command
{
    protected $signature = 'contracts:top-up-visits {--contract= : كود العقد، أو اتركه فارغًا لكل العقود السارية}';

    protected $description = 'إنشاء أوامر الشغل الناقصة لفروع أُضيفت بعد توليد الجولة';

    public function handle(MaintenancePlanner $planner): int
    {
        $only = null;

        if ($code = $this->option('contract')) {
            $only = Contract::query()->where('code', $code)->first();

            if (! $only) {
                $this->error("لا يوجد عقد بالكود {$code}.");

                return self::FAILURE;
            }
        }

        $created = $planner->topUpBranchJobs($only);

        $this->info($created > 0
            ? "تم إنشاء {$created} أمر شغل للفروع الناقصة."
            : 'كل الجولات المولّدة تغطي فروعها — لا شيء ينقص.');

        return self::SUCCESS;
    }
}

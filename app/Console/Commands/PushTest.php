<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Notifications\TestPush;
use Illuminate\Console\Command;
use Throwable;

/**
 * Sends a throwaway push so a deploy can be verified end to end without
 * creating a real work order just to see whether notifications arrive.
 */
class PushTest extends Command
{
    protected $signature = 'push:test
        {--email= : أرسل لمستخدم واحد بدل الجميع}
        {--body= : نص مخصص للإشعار}';

    protected $description = 'إرسال إشعار تجريبي لكل من فعّل الإشعارات';

    public function handle(): int
    {
        // Anyone without a subscription simply has no device listening, so
        // targeting them would report a false failure.
        $query = User::query()->whereHas('pushSubscriptions');

        if ($email = $this->option('email')) {
            $query->where('email', $email);
        }

        $users = $query->with('pushSubscriptions')->get();

        if ($users->isEmpty()) {
            $this->warn('لا يوجد مستخدم فعّل الإشعارات بعد.');
            $this->line('');
            $this->line('على كل جهاز: افتح الموقع ← سجّل الدخول ← فعّل الإشعارات واقبل إذن المتصفح.');
            $this->line('على الآيفون لا بد من تثبيت الموقع على الشاشة الرئيسية أولًا.');

            if ($email) {
                $this->line('');
                $this->line("لا يوجد اشتراك مسجّل للبريد: {$email}");
            }

            return self::FAILURE;
        }

        $body = $this->option('body') ?: 'لو وصلك ده، الإشعارات شغالة ✅';
        $sent = 0;
        $failed = 0;

        foreach ($users as $user) {
            $devices = $user->pushSubscriptions->count();

            try {
                $user->notify(new TestPush($body));
                $this->line("  ✓ {$user->email} — {$devices} جهاز");
                $sent++;
            } catch (Throwable $e) {
                // Keep going: one dead subscription should not hide whether
                // everyone else received theirs.
                $this->line("  ✗ {$user->email} — {$e->getMessage()}");
                $failed++;
            }
        }

        $this->line('');
        $this->info("تم الإرسال إلى {$sent} مستخدم.");

        if ($failed > 0) {
            $this->warn("فشل الإرسال إلى {$failed} مستخدم.");
        }

        $this->line('');
        $this->line('الإرسال الناجح يعني أن خدمة الدفع قبلت الرسالة — لا أنها ظهرت على');
        $this->line('الجهاز. إن لم يظهر شيء، الأرجح أن الإذن مرفوض أو أن الجهاز صامت.');

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}

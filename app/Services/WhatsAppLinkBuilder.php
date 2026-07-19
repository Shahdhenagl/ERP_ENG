<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskReport;

/**
 * Builds click-to-chat wa.me links with the message pre-filled.
 *
 * This deliberately uses deep links rather than the WhatsApp Business API:
 * no per-message cost, no Meta business verification, and it works the moment
 * the app is deployed. The trade-off is that the sender taps "send" themselves
 * — messages are not dispatched by the server.
 */
class WhatsAppLinkBuilder
{
    /** Default country code applied to local numbers (Egypt). */
    protected string $defaultCountryCode = '20';

    /**
     * Normalise a number to the international format wa.me expects:
     * digits only, no leading + or zeros.
     */
    public function normalizeNumber(?string $number): ?string
    {
        if (! $number) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $number);

        if (! $digits) {
            return null;
        }

        // 00201234567890 → 201234567890
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }

        // Local form 01234567890 → 201234567890
        if (str_starts_with($digits, '0')) {
            $digits = $this->defaultCountryCode.substr($digits, 1);
        }

        return $digits;
    }

    public function link(?string $number, string $message): ?string
    {
        $normalized = $this->normalizeNumber($number);

        if (! $normalized) {
            return null;
        }

        return 'https://wa.me/'.$normalized.'?text='.rawurlencode($message);
    }

    /**
     * Manager → technician: the full job brief, ready to send.
     */
    public function taskBriefMessage(Task $task): string
    {
        $customer = $task->customer;

        $lines = [
            "*مهمة جديدة — {$task->code}*",
            '',
            "*النوع:* {$task->type->label()}",
            "*الأولوية:* {$task->priority->label()}",
            "*الموضوع:* {$task->title}",
        ];

        if ($task->description) {
            $lines[] = "*التفاصيل:* {$task->description}";
        }

        $lines[] = '';
        $lines[] = '*بيانات العميل*';
        $lines[] = "الاسم: {$customer->name}";

        if ($customer->company) {
            $lines[] = "الشركة: {$customer->company}";
        }

        $lines[] = "الهاتف: {$customer->phone}";

        if ($address = $task->effectiveAddress()) {
            $lines[] = "العنوان: {$address}";
        }

        if ($task->device_brand || $task->device_model || $task->device_serial) {
            $lines[] = '';
            $lines[] = '*الجهاز*';

            if ($task->device_brand || $task->device_model) {
                $lines[] = 'الموديل: '.trim("{$task->device_brand} {$task->device_model}");
            }

            if ($task->device_capacity) {
                $lines[] = "القدرة: {$task->device_capacity}";
            }

            if ($task->device_serial) {
                $lines[] = "الرقم التسلسلي: {$task->device_serial}";
            }
        }

        if ($task->scheduled_at) {
            $lines[] = '';
            $lines[] = '*الموعد:* '.$task->scheduled_at->format('Y-m-d H:i');
        }

        if ($navigation = $task->navigationUrl()) {
            $lines[] = '';
            $lines[] = "*الموقع على الخريطة:*\n{$navigation}";
        }

        return implode("\n", $lines);
    }

    /**
     * Technician → manager: the closing summary once the job is done.
     */
    public function completionMessage(Task $task, ?TaskReport $report = null): string
    {
        $report ??= $task->completionReport;

        $lines = [
            "*تم إنهاء المهمة — {$task->code}*",
            '',
            "*العميل:* {$task->customer->name}",
            "*الموضوع:* {$task->title}",
        ];

        if ($task->technician) {
            $lines[] = "*الفني:* {$task->technician->name}";
        }

        if ($task->completed_at) {
            $lines[] = '*وقت الإنهاء:* '.$task->completed_at->format('Y-m-d H:i');
        }

        if ($report) {
            $readings = array_filter([
                'جهد الدخول' => $report->input_voltage,
                'جهد الخروج' => $report->output_voltage,
                'نسبة التحميل %' => $report->load_percent,
                'جهد البطاريات' => $report->battery_voltage,
                'زمن الـ Backup (دقيقة)' => $report->backup_minutes,
            ], fn ($v) => $v !== null);

            if ($readings) {
                $lines[] = '';
                $lines[] = '*القراءات*';

                foreach ($readings as $label => $value) {
                    $lines[] = "{$label}: {$value}";
                }
            }

            if ($report->findings) {
                $lines[] = '';
                $lines[] = "*ما تم رصده:* {$report->findings}";
            }

            if ($report->actions_taken) {
                $lines[] = "*ما تم تنفيذه:* {$report->actions_taken}";
            }

            if ($report->recommendations) {
                $lines[] = "*التوصيات:* {$report->recommendations}";
            }

            if ($report->batteries_need_replacement) {
                $lines[] = '';
                $lines[] = '⚠️ *البطاريات تحتاج استبدال*';
            }

            if ($parts = $report->parts_used) {
                $lines[] = '';
                $lines[] = '*قطع الغيار المستخدمة*';

                foreach ($parts as $part) {
                    $name = $part['name'] ?? '—';
                    $qty = $part['qty'] ?? 1;
                    $lines[] = "• {$name} × {$qty}";
                }
            }
        }

        $photos = $task->attachments()->whereIn('kind', ['before', 'after'])->count();

        if ($photos > 0) {
            $lines[] = '';
            $lines[] = "📷 تم رفع {$photos} صورة على النظام.";
        }

        return implode("\n", $lines);
    }
}

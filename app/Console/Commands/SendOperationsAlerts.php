<?php

namespace App\Console\Commands;

use App\Enums\TaskPriority;
use App\Enums\VisitStatus;
use App\Models\AlertDispatch;
use App\Models\ContractVisit;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Task;
use App\Models\User;
use App\Models\Warranty;
use App\Notifications\OperationsAlert;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

/**
 * The daily sweep that turns operational conditions into alerts.
 *
 * It re-detects the same conditions every run, so a stable key per condition
 * and a dispatch ledger are what keep it from re-alerting the same overdue
 * invoice every morning. A condition alerts once; acting on it is the manager's.
 */
class SendOperationsAlerts extends Command
{
    protected $signature = 'alerts:sweep';

    protected $description = 'رصد الأعطال والصيانة والضمانات والفواتير وقطع الغيار وإطلاق التنبيهات';

    /** How far ahead a periodic visit or a warranty counts as "coming up". */
    protected const PPM_HORIZON_DAYS = 7;

    protected const WARRANTY_HORIZON_DAYS = 30;

    public function handle(): int
    {
        $alerts = collect()
            ->merge($this->urgentTasks())
            ->merge($this->delayedTasks())
            ->merge($this->ppmDue())
            ->merge($this->warrantiesExpiring())
            ->merge($this->overdueInvoices())
            ->merge($this->partsLow());

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

    /** Urgent work still open — a fault or a call that cannot wait. */
    protected function urgentTasks(): Collection
    {
        return Task::query()->open()->where('priority', TaskPriority::Urgent->value)
            ->with('customer')->get()
            ->map(fn (Task $t) => [
                'key' => "urgent-task:{$t->id}", 'type' => 'task.urgent',
                'title' => 'صيانة عاجلة',
                'body' => "{$t->code} — ".($t->customer?->name ?? $t->title),
                'url' => "/tasks/{$t->id}", 'tag' => "task-{$t->id}",
            ]);
    }

    /** Requests open past the time they were promised. */
    protected function delayedTasks(): Collection
    {
        return Task::query()->open()->slaBreached()->with('customer')->get()
            ->map(fn (Task $t) => [
                'key' => "task-delayed:{$t->id}", 'type' => 'task.delayed',
                'title' => 'تأخر تنفيذ طلب صيانة',
                'body' => "{$t->code} — ".($t->customer?->name ?? $t->title),
                'url' => "/tasks/{$t->id}", 'tag' => "task-{$t->id}",
            ]);
    }

    /** Planned visits coming up within the horizon. */
    protected function ppmDue(): Collection
    {
        $today = now()->toDateString();

        return ContractVisit::query()
            ->whereIn('status', [VisitStatus::Planned->value, VisitStatus::Scheduled->value])
            ->whereDate('planned_for', '>=', $today)
            ->whereDate('planned_for', '<=', now()->addDays(self::PPM_HORIZON_DAYS)->toDateString())
            ->with('contract.customer')->get()
            ->map(fn (ContractVisit $v) => [
                'key' => "ppm-due:{$v->id}", 'type' => 'ppm.due',
                'title' => 'قرب موعد صيانة دورية',
                'body' => ($v->contract?->customer?->name ?? 'عقد صيانة')." — {$v->planned_for->toDateString()}",
                'url' => '/contracts', 'tag' => "visit-{$v->id}",
            ]);
    }

    /** Cover about to lapse. */
    protected function warrantiesExpiring(): Collection
    {
        return Warranty::query()->effective()->expiringWithin(self::WARRANTY_HORIZON_DAYS)
            ->with('asset')->get()
            ->map(fn (Warranty $w) => [
                'key' => "warranty-expiring:{$w->id}", 'type' => 'warranty.expiring',
                'title' => 'قرب انتهاء ضمان',
                'body' => ($w->asset?->label() ?? $w->code)." — ينتهي {$w->ends_on?->toDateString()}",
                'url' => '/warranties', 'tag' => "warranty-{$w->id}",
            ]);
    }

    /** Invoices past their due date and still owed. */
    protected function overdueInvoices(): Collection
    {
        return Invoice::query()->overdue()->with('customer')->get()
            ->map(fn (Invoice $i) => [
                'key' => "invoice-overdue:{$i->id}", 'type' => 'invoice.overdue',
                'title' => 'فاتورة متأخرة',
                'body' => "{$i->code} — ".($i->customer?->name ?? ''),
                'url' => "/invoices/{$i->id}", 'tag' => "invoice-{$i->id}",
            ]);
    }

    /** Stock that has fallen below its reorder level — a shortage forming. */
    protected function partsLow(): Collection
    {
        return Item::query()->active()->get()
            ->filter->isBelowReorderLevel()
            ->map(fn (Item $item) => [
                'key' => "parts-low:{$item->id}", 'type' => 'parts.low',
                'title' => 'نقص قطع غيار',
                'body' => "{$item->name} — المتاح ".$item->totalQty()." {$item->unit}",
                'url' => '/inventory', 'tag' => "item-{$item->id}",
            ])
            ->values();
    }
}

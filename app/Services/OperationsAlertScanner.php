<?php

namespace App\Services;

use App\Enums\ClaimStatus;
use App\Enums\ContractStatus;
use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Enums\VisitStatus;
use App\Models\ContractPayment;
use App\Models\ContractVisit;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\LeaveRequest;
use App\Models\PurchaseRequest;
use App\Models\Quotation;
use App\Models\Task;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Illuminate\Support\Collection;

/**
 * The one place operational conditions are turned into alerts — a shortage, a
 * delayed job, a visit coming up, money overdue, something waiting on a sign-off.
 *
 * Both the daily sweep (which sends them to the managers) and the alerts board
 * (which shows them live) read from here, so the two can never disagree about
 * what counts as an alert. Each alert is `[key, type, title, body, url, tag]`;
 * the `key` is stable per condition so the sweep's ledger can dedupe it.
 */
class OperationsAlertScanner
{
    /** How far ahead a periodic visit or a warranty counts as "coming up". */
    public const PPM_HORIZON_DAYS = 7;

    public const WARRANTY_HORIZON_DAYS = 30;

    /** Every standing condition, merged into one list. */
    public function scan(): Collection
    {
        return collect()
            ->merge($this->urgentTasks())
            ->merge($this->deviceFaults())
            ->merge($this->delayedTasks())
            ->merge($this->ppmDue())
            ->merge($this->contractPaymentsDue())
            ->merge($this->contractsExpiring())
            ->merge($this->warrantiesExpiring())
            ->merge($this->newInvoices())
            ->merge($this->overdueInvoices())
            ->merge($this->recurringExpensesDue())
            ->merge($this->partsLow())
            ->merge($this->approvalsNeeded());
    }

    /** How many days before a fixed expense falls due it starts reminding. */
    public const RECURRING_HORIZON_DAYS = 3;

    /**
     * Fixed expenses due within three days, or already overdue — the reminder
     * keeps showing until the bill is paid, which rolls its next due forward and
     * takes it back off this list.
     */
    protected function recurringExpensesDue(): Collection
    {
        return \App\Models\RecurringExpense::query()
            ->dueWithin(self::RECURRING_HORIZON_DAYS)
            ->with('box')->get()
            ->map(function (\App\Models\RecurringExpense $e) {
                $days = $e->daysUntilDue();
                $when = $days < 0 ? 'متأخر' : ($days === 0 ? 'اليوم' : "خلال {$days} يوم");

                return [
                    'key' => "recurring-expense-due:{$e->id}:{$e->next_due_on->toDateString()}",
                    'type' => 'expense.recurring_due',
                    'title' => 'مصروف دوري مستحق',
                    'body' => "{$e->name} — ".number_format((float) $e->amount, 2)." ج · {$when}",
                    'url' => '/treasury/operations', 'tag' => "recurring-expense-{$e->id}",
                ];
            });
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

    /** A reported device fault — an open repair job on a unit. */
    protected function deviceFaults(): Collection
    {
        return Task::query()->open()->where('type', TaskType::Repair->value)
            ->with(['customer', 'asset'])->get()
            ->map(fn (Task $t) => [
                'key' => "device-fault:{$t->id}", 'type' => 'device.fault',
                'title' => 'بلاغ عطل جهاز',
                'body' => ($t->asset?->label() ?? $t->customer?->name ?? $t->title)." — {$t->code}",
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

    /**
     * A contract instalment that is holding an upcoming visit's work order — the
     * manager collects it so the job can be released to a technician.
     */
    protected function contractPaymentsDue(): Collection
    {
        $horizon = now()->addDays(self::PPM_HORIZON_DAYS)->toDateString();

        return ContractPayment::query()
            ->where('status', 'due')
            ->whereNotNull('due_visit_sequence')
            ->whereHas('contract', fn ($q) => $q->where('status', ContractStatus::Active->value))
            ->whereExists(function ($q) use ($horizon) {
                $q->from('contract_visits')
                    ->whereColumn('contract_visits.contract_id', 'contract_payments.contract_id')
                    ->whereColumn('contract_visits.sequence', 'contract_payments.due_visit_sequence')
                    ->where('contract_visits.status', VisitStatus::Planned->value)
                    ->whereDate('contract_visits.planned_for', '<=', $horizon);
            })
            ->with('contract.customer')->get()
            ->map(fn ($p) => [
                'key' => "contract-payment-due:{$p->id}", 'type' => 'contract.payment_due',
                'title' => 'دفعة عقد مستحقة قبل الزيارة',
                'body' => ($p->contract?->customer?->name ?? $p->contract?->code)
                    ." — الدفعة {$p->sequence} (".number_format((float) $p->amount, 2).' ج)',
                'url' => "/contracts/{$p->contract_id}", 'tag' => "contract-payment-{$p->id}",
            ]);
    }

    /** How far ahead a maintenance contract counts as "about to end". */
    public const CONTRACT_HORIZON_DAYS = 60;

    /** Contracts whose term is nearly up — a renewal to chase before cover lapses. */
    protected function contractsExpiring(): Collection
    {
        return \App\Models\Contract::query()
            ->expiringWithin(self::CONTRACT_HORIZON_DAYS)
            ->with('customer')->get()
            ->map(fn (\App\Models\Contract $c) => [
                'key' => "contract-expiring:{$c->id}",
                'type' => 'contract.expiring',
                'title' => 'عقد قارب على الانتهاء',
                'body' => ($c->customer?->name ?? $c->code)." — ينتهي {$c->ends_on?->toDateString()}",
                'url' => "/contracts/{$c->id}", 'tag' => "contract-{$c->id}",
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
                'title' => 'فاتورة متأخرة السداد',
                'body' => "{$i->code} — ".($i->customer?->name ?? '')
                    .' · '.number_format((float) $i->balance(), 2).' ج',
                'url' => "/invoices/{$i->id}", 'tag' => "invoice-{$i->id}",
            ]);
    }

    /**
     * Stock that has fallen below its reorder level — a shortage forming. The
     * heading names the kind, so a UPS or battery running low reads as a device
     * shortage rather than hiding under "spare parts".
     */
    protected function partsLow(): Collection
    {
        return Item::query()->active()->get()
            ->filter->isBelowReorderLevel()
            ->map(fn (Item $item) => [
                'key' => "parts-low:{$item->id}", 'type' => 'stock.low',
                'title' => match ($item->category->value) {
                    'ups' => 'نقص أجهزة UPS',
                    'battery' => 'نقص بطاريات',
                    default => 'نقص قطع غيار',
                },
                'body' => "{$item->name} — المتاح ".$item->totalQty()." {$item->unit}",
                'url' => '/inventory', 'tag' => "item-{$item->id}",
            ])
            ->values();
    }

    /** Newly issued invoices — a bill went out and is now owed. */
    protected function newInvoices(): Collection
    {
        return Invoice::query()
            ->where('status', 'issued')
            ->whereDate('created_at', '>=', now()->subDays(2)->toDateString())
            ->with('customer')->get()
            ->map(fn (Invoice $i) => [
                'key' => "invoice-new:{$i->id}", 'type' => 'invoice.created',
                'title' => 'فاتورة جديدة',
                'body' => "{$i->code} — ".($i->customer?->name ?? '')
                    .' · '.number_format((float) $i->total, 2).' ج',
                'url' => "/invoices/{$i->id}", 'tag' => "invoice-{$i->id}",
            ]);
    }

    /**
     * Anything in the workflow waiting on a decision — a quote for sign-off,
     * leave to approve, a purchase request to clear, a warranty claim to rule on.
     */
    protected function approvalsNeeded(): Collection
    {
        $quotes = Quotation::query()->pendingApproval()->with('customer')->get()
            ->map(fn (Quotation $q) => [
                'key' => "approval-quote:{$q->id}", 'type' => 'approval.needed',
                'title' => 'عرض سعر بانتظار الاعتماد',
                'body' => "{$q->code} — ".($q->customer?->name ?? ''),
                'url' => "/sales/approvals?quote={$q->id}", 'tag' => "quote-{$q->id}",
            ]);

        $leave = LeaveRequest::query()->pending()->with('employee')->get()
            ->map(fn (LeaveRequest $l) => [
                'key' => "approval-leave:{$l->id}", 'type' => 'approval.needed',
                'title' => 'طلب إجازة بانتظار الاعتماد',
                'body' => "{$l->code} — ".($l->employee?->name ?? ''),
                'url' => '/hr/leave', 'tag' => "leave-{$l->id}",
            ]);

        $requests = PurchaseRequest::query()->awaiting()->get()
            ->map(fn (PurchaseRequest $r) => [
                'key' => "approval-request:{$r->id}", 'type' => 'approval.needed',
                'title' => 'طلب شراء بانتظار الاعتماد',
                'body' => $r->code ?? "طلب #{$r->id}",
                'url' => '/purchase-requests', 'tag' => "request-{$r->id}",
            ]);

        $claims = WarrantyClaim::query()->where('status', ClaimStatus::Open->value)
            ->with('asset')->get()
            ->map(fn (WarrantyClaim $c) => [
                'key' => "approval-claim:{$c->id}", 'type' => 'approval.needed',
                'title' => 'مطالبة ضمان بانتظار البتّ',
                'body' => $c->asset?->label() ?? "مطالبة #{$c->id}",
                'url' => '/warranties', 'tag' => "claim-{$c->id}",
            ]);

        return collect()->merge($quotes)->merge($leave)->merge($requests)->merge($claims);
    }
}

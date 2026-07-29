<?php

namespace App\Services;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Enums\VisitStatus;
use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\Contract;
use App\Models\ContractVisit;
use App\Models\Task;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Turns a maintenance contract into dated visits, and dated visits into work
 * orders once they are near enough to act on.
 *
 * The split matters. Everything the contract promises is planned immediately,
 * so a manager can see the year from the day it is signed — but only the near
 * ones become tasks, so the work queue keeps meaning "things to do now".
 *
 * There is no cron on this host, so materialisation rides on request traffic
 * (see tick()). That is why plan/replan/materialiseDueVisits are each callable
 * on their own: tests and the manual button use them directly.
 */
class MaintenancePlanner
{
    /** How far ahead a visit becomes a real work order. */
    public const HORIZON_DAYS = 45;

    /** Visits are booked for the start of the working day, Cairo time. */
    public const VISIT_HOUR = 9;

    protected const THROTTLE_KEY = 'maintenance-planner:last-run';

    protected const THROTTLE_MINUTES = 15;

    /** Official-holiday dates, loaded once per run. @var array<string, true>|null */
    protected ?array $holidayCache = null;

    public function __construct(protected TaskWorkflow $workflow) {}

    // ── Entry point ──────────────────────────────────────────

    /**
     * Opportunistic sweep, called from endpoints managers hit anyway.
     *
     * Wrapped in a lock because two managers loading the dashboard together
     * would otherwise both sweep; throttled because most requests have nothing
     * to do and a query per page view is waste. `cache_locks` already exists
     * and the cache store is the database, so this is atomic here with no
     * extra infrastructure.
     */
    public function tick(): void
    {
        if (Cache::get(self::THROTTLE_KEY) !== null) {
            return;
        }

        $lock = Cache::lock('maintenance-planner', 60);

        if (! $lock->get()) {
            return;
        }

        try {
            $this->materialiseDueVisits();
            Cache::put(self::THROTTLE_KEY, now()->toIso8601String(), now()->addMinutes(self::THROTTLE_MINUTES));
        } finally {
            $lock->release();
        }
    }

    // ── Planning ─────────────────────────────────────────────

    /**
     * Lay out every visit the contract owes, replacing any existing plan that
     * nobody has acted on yet.
     *
     * @return int visits planned
     */
    public function plan(Contract $contract): int
    {
        return DB::transaction(function () use ($contract) {
            $locked = $contract->visits()->with('task')->get()
                ->filter(fn (ContractVisit $visit) => $visit->isLocked())
                ->sortBy('planned_for')
                ->values();

            $this->releaseFreeVisits($contract, cancelReason: 'أُعيدت جدولة العقد');

            $target = $this->visitCountFor($contract);

            // Already delivered at least what the new plan calls for. Nothing
            // more to schedule, and nothing delivered is ever unmade.
            if ($target <= $locked->count()) {
                $this->resequence($locked);

                return 0;
            }

            $this->resequence($locked);

            // Remaining visits spread over what is left of the term, so
            // shortening a contract mid-way compresses the rest rather than
            // planning dates that have already passed.
            $from = CarbonImmutable::parse($contract->starts_on)->max(CarbonImmutable::now()->startOfDay());
            $until = CarbonImmutable::parse($contract->ends_on);
            $remaining = $target - $locked->count();

            // An agreed first-visit date anchors the whole run; without one the
            // visits are spread across the term. Only while nothing has been
            // committed yet — a date cannot move a round somebody already did.
            $anchor = $contract->first_visit_on
                ? CarbonImmutable::parse($contract->first_visit_on)
                : null;

            $dates = $anchor && $locked->isEmpty()
                ? $this->distributeFrom($anchor, $contract, $remaining)
                : $this->distribute($from, $until, $remaining);
            $sequence = $locked->count();

            foreach ($dates as $date) {
                $contract->visits()->create([
                    'sequence' => ++$sequence,
                    'planned_for' => $date->toDateString(),
                    'status' => VisitStatus::Planned,
                ]);
            }

            ActivityLog::record(
                action: 'contract.planned',
                subject: $contract,
                description: "{$contract->code}: تم تخطيط ".count($dates).' زيارة',
                properties: ['planned' => count($dates), 'locked' => $locked->count()],
            );

            return count($dates);
        });
    }

    /**
     * Lay the visits out from an agreed first date, one cadence apart.
     *
     * The cadence is the term's own — a year at twelve a year is a visit every
     * thirty days or so — so "first visit on the 5th" gives the 5th of every
     * month rather than a run compressed into what is left of the year. A date
     * that would fall past the term is pinned to its last day: the contract
     * still owes the visit, and dropping it silently would be worse.
     *
     * @return array<int, CarbonImmutable>
     */
    public function distributeFrom(CarbonImmutable $anchor, Contract $contract, int $count): array
    {
        if ($count < 1) {
            return [];
        }

        $starts = CarbonImmutable::parse($contract->starts_on)->startOfDay();
        $until = CarbonImmutable::parse($contract->ends_on)->startOfDay();

        $termDays = max(1, $starts->diffInDays($until));
        $step = $termDays / max(1, $this->visitCountFor($contract));

        $dates = [];

        for ($i = 0; $i < $count; $i++) {
            $date = $anchor->startOfDay()->addDays((int) round($i * $step));
            $dates[] = $this->nudgeToWorkingDayWithinMonth($date->min($until));
        }

        return $dates;
    }

    /**
     * Spread n visits evenly across a term, each at the midpoint of its slice.
     *
     * Midpoints rather than the obvious i/n: that would put the first visit on
     * the contract's start date, which is usually the installation itself, and
     * (i+1)/n would put the last one on the final day, where any slip pushes it
     * outside the term. Splitting by days rather than months also means an
     * awkward frequency like 5 a year needs no special case.
     *
     * @return array<int, CarbonImmutable>
     */
    public function distribute(CarbonImmutable $from, CarbonImmutable $until, int $count): array
    {
        if ($count < 1) {
            return [];
        }

        $days = max(1, $from->startOfDay()->diffInDays($until->startOfDay()));
        $dates = [];

        for ($i = 0; $i < $count; $i++) {
            $offset = (int) round($days * (2 * $i + 1) / (2 * $count));

            // Each visit belongs to the month its slice falls in, so working-day
            // nudging is kept inside that month — a month's visit is done within
            // the month, never spilled into the next.
            $dates[] = $this->nudgeToWorkingDayWithinMonth($from->startOfDay()->addDays($offset));
        }

        return $dates;
    }

    /**
     * How many visits the term is worth. A two-year contract at 4 a year owes
     * 8; a six-month one owes 2.
     */
    public function visitCountFor(Contract $contract): int
    {
        $days = CarbonImmutable::parse($contract->starts_on)
            ->startOfDay()
            ->diffInDays(CarbonImmutable::parse($contract->ends_on)->startOfDay()) + 1;

        return max(1, (int) round($contract->visits_per_year * ($days / 365.25)));
    }

    /** A closed office: the Fri/Sat weekend, or an admin-marked official holiday. */
    protected function isClosed(CarbonImmutable $date): bool
    {
        return in_array($date->dayOfWeek, [CarbonImmutable::FRIDAY, CarbonImmutable::SATURDAY], true)
            || isset($this->holidays()[$date->toDateString()]);
    }

    /**
     * Step a visit onto a working day: Friday and Saturday are the weekend
     * here, and an admin-marked official holiday is a closed office too. Walk
     * forward until the date is neither.
     */
    protected function nudgeToWorkingDay(CarbonImmutable $date): CarbonImmutable
    {
        while ($this->isClosed($date)) {
            $date = $date->addDay();
        }

        return $date;
    }

    /**
     * The same, but never leaving the date's own month. Nudging forward is tried
     * first; if that would cross into the next month, it walks backward instead,
     * so a visit planned for the month's end lands on the last working day of the
     * month rather than the first of the next. Only if the whole tail of the
     * month is closed does it accept the forward slip.
     */
    protected function nudgeToWorkingDayWithinMonth(CarbonImmutable $date): CarbonImmutable
    {
        $forward = $this->nudgeToWorkingDay($date);

        if ($forward->isSameMonth($date)) {
            return $forward;
        }

        $back = $date;
        $monthStart = $date->startOfMonth();

        while ($back->gte($monthStart) && $this->isClosed($back)) {
            $back = $back->subDay();
        }

        return $back->gte($monthStart) ? $back : $forward;
    }

    /**
     * The official holidays as a date-keyed set, loaded once per planner run.
     *
     * @return array<string, true>
     */
    protected function holidays(): array
    {
        return $this->holidayCache ??= \App\Models\Holiday::query()
            ->pluck('date')
            ->mapWithKeys(fn ($date) => [$date->toDateString() => true])
            ->all();
    }

    /** @param  \Illuminate\Support\Collection<int, ContractVisit>  $locked */
    protected function resequence(iterable $locked): void
    {
        $sequence = 0;

        foreach ($locked as $visit) {
            // Sequences are unique per contract, so walking them down into
            // slots the free visits just vacated is safe.
            $visit->update(['sequence' => ++$sequence]);
        }
    }

    // ── Materialisation ──────────────────────────────────────

    /**
     * Cut work orders for visits inside the horizon.
     *
     * `whereNull('task_id')` under a row lock, plus the unique index on
     * (contract_id, sequence), is what makes a double sweep structurally
     * unable to produce two tasks for one visit.
     *
     * @return int tasks created
     */
    public function materialiseDueVisits(int $limit = 50): int
    {
        return DB::transaction(function () use ($limit) {
            $visits = ContractVisit::query()
                ->due(self::HORIZON_DAYS)
                ->whereHas('contract', fn ($q) => $q->activeOn(now()->toDateString()))
                ->with('contract.customer.branches', 'contract.assets')
                ->orderBy('planned_for')
                ->limit($limit)
                ->lockForUpdate()
                ->get();

            $created = 0;

            foreach ($visits as $visit) {
                // A visit whose instalment has not been collected is held: no work
                // order is cut for it, so it never reaches a technician until the
                // manager confirms the payment and the next sweep picks it up.
                if ($this->isHeldForPayment($visit)) {
                    continue;
                }

                // A round covers every branch — one work order each — so a
                // customer with thirty branches gets thirty jobs this month. A
                // customer with no branches on file gets the single site job it
                // always did.
                $branches = $visit->contract->customer?->branches()->active()->get() ?? collect();
                $first = null;

                if ($branches->isEmpty()) {
                    $first = $this->createTaskFor($visit, null);
                } else {
                    foreach ($branches as $branch) {
                        $task = $this->createTaskFor($visit, $branch);
                        $first ??= $task;
                    }
                }

                $visit->update([
                    // The representative job keeps the legacy one-to-one link
                    // alive; every job also carries the round id on its own side.
                    'task_id' => $first?->id,
                    'status' => VisitStatus::Scheduled,
                ]);

                $created++;
            }

            return $created;
        });
    }

    /** True while a visit carries an instalment that has not yet been collected. */
    public function isHeldForPayment(ContractVisit $visit): bool
    {
        return \App\Models\ContractPayment::query()
            ->where('contract_id', $visit->contract_id)
            ->where('due_visit_sequence', $visit->sequence)
            ->where('status', 'due')
            ->exists();
    }

    /**
     * Cut the branch jobs a materialised round is missing.
     *
     * Fan-out happens once, at materialisation, which freezes the branch list at
     * that moment. A site opened afterwards — or a round cut before rounds fanned
     * out at all — leaves a branch holding a promise nobody scheduled. This
     * closes that gap.
     *
     * Nothing anyone has started is touched: a job already accepted or assigned
     * is left exactly where it is, and a finished round is history.
     *
     * @return int jobs created
     */
    public function topUpBranchJobs(?Contract $only = null): int
    {
        return DB::transaction(function () use ($only) {
            $visits = ContractVisit::query()
                ->whereNotNull('task_id')
                ->whereIn('status', [VisitStatus::Planned->value, VisitStatus::Scheduled->value])
                ->when($only, fn ($q, $contract) => $q->where('contract_id', $contract->id))
                ->whereHas('contract', fn ($q) => $q->activeOn(now()->toDateString()))
                ->with(['contract.customer', 'contract.assets', 'tasks'])
                ->get();

            $created = 0;

            foreach ($visits as $visit) {
                $branches = $visit->contract->customer?->branches()->active()->get() ?? collect();

                if ($branches->isEmpty()) {
                    continue;
                }

                $live = $visit->tasks->reject(fn (Task $task) => $task->status === TaskStatus::Cancelled);
                $covered = $live->pluck('branch_id')->filter()->all();
                $missing = $branches->reject(fn (Branch $branch) => in_array($branch->id, $covered, true));

                if ($missing->isEmpty()) {
                    continue;
                }

                // A round cut before the fan-out carries one site-wide job. Point
                // it at the first uncovered branch rather than leaving it beside
                // the new ones, where it would double that round's first visit —
                // but only while it is still untouched.
                $legacy = $live->first(fn (Task $task) => $task->branch_id === null
                    && $task->status === TaskStatus::Pending
                    && $task->assigned_to === null);

                if ($legacy) {
                    $branch = $missing->shift();
                    $assets = $visit->contract->assets->where('branch_id', $branch->id)->values();

                    $legacy->update([
                        'branch_id' => $branch->id,
                        'asset_id' => $assets->count() === 1 ? $assets->first()->id : null,
                        'title' => 'زيارة صيانة دورية — '.$visit->contract->code.' — '.$branch->name,
                    ]);
                }

                foreach ($missing as $branch) {
                    $this->createTaskFor($visit, $branch);
                    $created++;
                }
            }

            return $created;
        });
    }

    protected function createTaskFor(ContractVisit $visit, ?Branch $branch = null): Task
    {
        $contract = $visit->contract;

        // The devices this job answers for: the branch's own when it is a branch
        // job, the whole covered set otherwise.
        $assets = $branch
            ? $contract->assets->where('branch_id', $branch->id)->values()
            : $contract->assets;

        return Task::create([
            'customer_id' => $contract->customer_id,
            'contract_id' => $contract->id,
            'contract_visit_id' => $visit->id,
            'branch_id' => $branch?->id,
            // One device: point the job straight at it so the visit shows up in
            // that device's history. Several: the job covers the site, and the
            // per-device link is a gap we have not closed yet.
            'asset_id' => $assets->count() === 1 ? $assets->first()->id : null,
            'created_by' => $contract->created_by,
            'title' => 'زيارة صيانة دورية — '.$contract->code
                .($branch ? ' — '.$branch->name : ''),
            'description' => $this->visitDescription($visit),
            'type' => TaskType::Maintenance,
            'priority' => TaskPriority::Normal,
            'status' => TaskStatus::Pending,
            'scheduled_at' => $this->scheduledAtFor($visit),
        ]);
    }

    /**
     * Build the slot in Cairo time and let the cast convert it. Adding hours to
     * a UTC value would drift by an hour twice a year now that Egypt observes
     * DST again — enough to flip an SLA verdict.
     */
    protected function scheduledAtFor(ContractVisit $visit): CarbonImmutable
    {
        return CarbonImmutable::parse($visit->planned_for->toDateString(), 'Africa/Cairo')
            ->setTime(self::VISIT_HOUR, 0);
    }

    protected function visitDescription(ContractVisit $visit): string
    {
        $contract = $visit->contract;
        $total = $contract->visits()->count();
        $lines = ["الزيارة {$visit->sequence} من {$total} ضمن عقد الصيانة {$contract->code}."];

        if ($contract->assets->isNotEmpty()) {
            $devices = $contract->assets
                ->map(fn ($asset) => $asset->label())
                ->implode('، ');

            $lines[] = "الأجهزة المغطاة: {$devices}.";
        }

        return implode(PHP_EOL, $lines);
    }

    // ── Teardown ─────────────────────────────────────────────

    /**
     * Drop the uncommitted part of a contract's plan. Used when the contract is
     * cancelled and when replanning.
     */
    public function cancelPlanFor(Contract $contract): int
    {
        return DB::transaction(fn () => $this->releaseFreeVisits($contract, 'تم إلغاء عقد الصيانة'));
    }

    /**
     * Delete every visit nobody has committed to, cancelling any work order
     * already cut for it.
     *
     * Cancellation goes through TaskWorkflow rather than a direct update so the
     * status log, the audit trail and the notifications stay consistent with
     * every other way a job can be cancelled.
     */
    protected function releaseFreeVisits(Contract $contract, string $cancelReason): int
    {
        $actor = $contract->creator ?? User::query()->where('role', 'admin')->first();
        $released = 0;

        $visits = $contract->visits()->with('task')->get()
            ->reject(fn (ContractVisit $visit) => $visit->isLocked());

        foreach ($visits as $visit) {
            if ($visit->task && $actor) {
                $this->workflow->transition(
                    $visit->task,
                    TaskStatus::Cancelled,
                    $actor,
                    ['cancel_reason' => $cancelReason],
                );
            }

            $visit->delete();
            $released++;
        }

        return $released;
    }
}

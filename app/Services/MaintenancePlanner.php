<?php

namespace App\Services;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Enums\VisitStatus;
use App\Models\ActivityLog;
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

            $dates = $this->distribute($from, $until, $target - $locked->count());
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

            $dates[] = $this->nudgeOffWeekend($from->startOfDay()->addDays($offset));
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

    /** Friday and Saturday are the weekend here; push into Sunday. */
    protected function nudgeOffWeekend(CarbonImmutable $date): CarbonImmutable
    {
        return match ($date->dayOfWeek) {
            CarbonImmutable::FRIDAY => $date->addDays(2),
            CarbonImmutable::SATURDAY => $date->addDay(),
            default => $date,
        };
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
                ->with('contract.customer', 'contract.assets')
                ->orderBy('planned_for')
                ->limit($limit)
                ->lockForUpdate()
                ->get();

            foreach ($visits as $visit) {
                $task = $this->createTaskFor($visit);

                $visit->update([
                    'task_id' => $task->id,
                    'status' => VisitStatus::Scheduled,
                ]);
            }

            return $visits->count();
        });
    }

    protected function createTaskFor(ContractVisit $visit): Task
    {
        $contract = $visit->contract;
        $assets = $contract->assets;

        return Task::create([
            'customer_id' => $contract->customer_id,
            'contract_id' => $contract->id,
            // One device: point the job straight at it so the visit shows up in
            // that device's history. Several: the job covers the site, and the
            // per-device link is a gap we have not closed yet.
            'asset_id' => $assets->count() === 1 ? $assets->first()->id : null,
            'created_by' => $contract->created_by,
            'title' => 'زيارة صيانة دورية — '.$contract->code,
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
                ->map(fn ($asset) => trim($asset->label ?? $asset->code))
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

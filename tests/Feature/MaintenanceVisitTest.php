<?php

use App\Enums\TaskStatus;
use App\Enums\VisitStatus;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use App\Services\MaintenancePlanner;
use Illuminate\Support\Facades\Cache;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;

beforeEach(function () {
    // The tick() throttle is a cache key, so without this the order tests run
    // in would decide whether a sweep happens.
    Cache::flush();

    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    $this->planner = app(MaintenancePlanner::class);
});

/* ── Planning ───────────────────────────────────────────── */

it('lays out the whole term as visits, not as work orders', function () {
    $contract = Contract::factory()->for($this->customer)->create([
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->addYear()->subDay()->toDateString(),
        'visits_per_year' => 4,
    ]);

    $this->planner->plan($contract);

    expect($contract->visits()->count())->toBe(4);

    // The point of the whole design: a signed contract must not drop a year of
    // jobs into the dispatcher's queue.
    expect(Task::query()->where('contract_id', $contract->id)->count())->toBe(0);
});

it('only cuts work orders for visits inside the horizon', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->addYear()->subDay()->toDateString(),
        'visits_per_year' => 4,
    ]);

    $this->planner->plan($contract);
    $this->planner->materialiseDueVisits();

    $withinHorizon = $contract->visits()
        ->whereDate('planned_for', '<=', now()->addDays(MaintenancePlanner::HORIZON_DAYS))
        ->count();

    expect(Task::query()->where('contract_id', $contract->id)->count())->toBe($withinHorizon)
        ->and($withinHorizon)->toBeLessThan(4);
});

it('does not cut a second work order for a visit it already materialised', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->subDays(5)->toDateString(),
        'ends_on' => now()->addYear()->toDateString(),
        'visits_per_year' => 12,
    ]);

    $this->planner->plan($contract);

    $this->planner->materialiseDueVisits();
    $after = Task::query()->where('contract_id', $contract->id)->count();

    // Two managers hitting the dashboard in the same minute must not double up.
    $this->planner->materialiseDueVisits();
    $this->planner->materialiseDueVisits();

    expect(Task::query()->where('contract_id', $contract->id)->count())->toBe($after)
        ->and($after)->toBeGreaterThan(0);
});

it('ignores contracts that are not running', function () {
    $draft = Contract::factory()->for($this->customer)->create([
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->addYear()->toDateString(),
        'visits_per_year' => 12,
    ]);

    $this->planner->plan($draft);
    $this->planner->materialiseDueVisits();

    expect(Task::query()->where('contract_id', $draft->id)->count())->toBe(0);
});

it('marks a materialised visit as scheduled and links it to the job', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->subDay()->toDateString(),
        'ends_on' => now()->addMonths(2)->toDateString(),
        'visits_per_year' => 12,
    ]);

    $this->planner->plan($contract);
    $this->planner->materialiseDueVisits();

    $visit = $contract->visits()->whereNotNull('task_id')->first();

    expect($visit->status)->toBe(VisitStatus::Scheduled)
        ->and($visit->task)->not->toBeNull()
        ->and($visit->task->assigned_to)->toBeNull()
        ->and($visit->task->status)->toBe(TaskStatus::Pending);
});

/* ── Replanning ─────────────────────────────────────────── */

it('keeps visits a technician has already been put on when the contract changes', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->subDays(10)->toDateString(),
        'ends_on' => now()->addYear()->toDateString(),
        'visits_per_year' => 12,
    ]);

    $this->planner->plan($contract);
    $this->planner->materialiseDueVisits();

    $technician = User::factory()->technician()->create();
    $committed = $contract->visits()->whereNotNull('task_id')->first();
    $committed->task->update(['assigned_to' => $technician->id]);

    $this->planner->plan($contract);

    // Someone promised a customer this date. Replanning must not take it back.
    expect($contract->visits()->whereKey($committed->id)->exists())->toBeTrue()
        ->and($committed->task->fresh()->status)->toBe(TaskStatus::Pending);
});

it('cancels untouched work orders through the workflow when replanning', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->subDay()->toDateString(),
        'ends_on' => now()->addMonths(6)->toDateString(),
        'visits_per_year' => 12,
    ]);
    $contract->update(['created_by' => $this->manager->id]);

    $this->planner->plan($contract);
    $this->planner->materialiseDueVisits();

    $task = Task::query()->where('contract_id', $contract->id)->firstOrFail();

    $this->planner->plan($contract);

    // Routed through TaskWorkflow rather than a bare update, so the status log
    // and audit trail stay consistent with every other cancellation.
    $task->refresh();

    expect($task->status)->toBe(TaskStatus::Cancelled)
        ->and($task->cancel_reason)->toBe('أُعيدت جدولة العقد')
        ->and($task->statusLogs()->count())->toBeGreaterThan(0);
});

/* ── Cancellation ───────────────────────────────────────── */

it('drops the uncommitted plan when the contract is cancelled', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->addYear()->toDateString(),
        'visits_per_year' => 4,
        'created_by' => $this->manager->id,
    ]);

    $this->planner->plan($contract);

    actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/cancel")
        ->assertOk()
        ->assertJsonPath('data.effective_status', 'cancelled');

    expect($contract->visits()->count())->toBe(0);
});

/* ── Endpoints ──────────────────────────────────────────── */

it('plans the term when a draft contract is activated', function () {
    $contract = Contract::factory()->for($this->customer)->create([
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->addYear()->subDay()->toDateString(),
        'visits_per_year' => 4,
    ]);

    actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/activate")
        ->assertOk()
        ->assertJsonPath('data.effective_status', 'active')
        ->assertJsonCount(4, 'data.visits');
});

it('surfaces due visits to the dispatcher without inflating the unassigned badge', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->subDay()->toDateString(),
        'ends_on' => now()->addYear()->toDateString(),
        'visits_per_year' => 12,
    ]);

    $this->planner->plan($contract);
    $this->planner->materialiseDueVisits();

    $response = actingAs($this->manager)->getJson('/api/dashboard')->assertOk();

    $due = $response->json('maintenance_due');
    $unassigned = $response->json('stats.unassigned');

    expect($due)->not->toBeEmpty();

    // Only visits close enough to act on count towards the badge; the rest of
    // the year is planning, not a backlog.
    $actionable = Task::query()
        ->where('contract_id', $contract->id)
        ->whereDate('scheduled_at', '<=', now()->addDays(14))
        ->count();

    expect($unassigned)->toBe($actionable);
});

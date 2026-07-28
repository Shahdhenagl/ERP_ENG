<?php

use App\Enums\TaskStatus;
use App\Enums\VisitStatus;
use App\Models\Contract;
use App\Models\ContractVisit;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskWorkflow;
use Illuminate\Support\Facades\Cache;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    Cache::flush();
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    $this->contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->subMonths(6)->toDateString(),
        'ends_on' => now()->addMonths(6)->toDateString(),
        'visits_per_year' => 4,
    ]);
});

function visit(array $attributes = []): ContractVisit
{
    return ContractVisit::create([
        'contract_id' => test()->contract->id,
        'sequence' => ContractVisit::where('contract_id', test()->contract->id)->max('sequence') + 1,
        'planned_for' => now()->toDateString(),
        'status' => VisitStatus::Planned,
        ...$attributes,
    ]);
}

it('lists the visit schedule, leaving cancelled ones out', function () {
    visit(['planned_for' => now()->addDays(5)]);
    visit(['status' => VisitStatus::Cancelled]);

    $rows = actingAs($this->manager)->getJson('/api/ppm/visits')->assertOk()->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['contract_code'])->toBe($this->contract->code);
});

it('flags an overdue open visit', function () {
    visit(['planned_for' => now()->subDays(3), 'status' => VisitStatus::Scheduled]);

    $rows = actingAs($this->manager)->getJson('/api/ppm/visits?overdue=1')->assertOk()->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['is_overdue'])->toBeTrue();
});

it('computes compliance from what was due', function () {
    visit(['planned_for' => now()->subDays(10), 'status' => VisitStatus::Done]);   // done
    visit(['planned_for' => now()->subDays(5), 'status' => VisitStatus::Done]);    // done
    visit(['planned_for' => now()->subDays(2), 'status' => VisitStatus::Scheduled]); // overdue, open
    visit(['planned_for' => now()->addDays(30), 'status' => VisitStatus::Planned]);  // future, not due

    $summary = actingAs($this->manager)->getJson('/api/ppm/summary')->assertOk();

    expect($summary->json('done'))->toBe(2)
        ->and($summary->json('overdue'))->toBe(1)
        ->and($summary->json('compliance'))->toEqual(66.7);  // 2 of (2 + 1)
});

it('marks a visit done when its maintenance task completes', function () {
    $visit = visit(['status' => VisitStatus::Scheduled]);
    $task = Task::factory()->for($this->customer)->create([
        'contract_id' => $this->contract->id,
        'contract_visit_id' => $visit->id,
        'status' => TaskStatus::InProgress,
    ]);
    $visit->update(['task_id' => $task->id]);

    app(TaskWorkflow::class)->transition($task, TaskStatus::Completed, $this->manager);

    expect($visit->fresh()->status)->toBe(VisitStatus::Done);
});

it('holds a round open until every branch job is done', function () {
    // Two branches → two jobs for the round; the round closes only when both do.
    $visit = visit(['status' => VisitStatus::Scheduled]);

    $jobs = collect(range(1, 2))->map(fn () => Task::factory()->for($this->customer)->create([
        'contract_id' => $this->contract->id,
        'contract_visit_id' => $visit->id,
        'status' => TaskStatus::InProgress,
    ]));

    app(TaskWorkflow::class)->transition($jobs[0], TaskStatus::Completed, $this->manager);
    expect($visit->fresh()->status)->toBe(VisitStatus::Scheduled);   // one still open

    app(TaskWorkflow::class)->transition($jobs[1], TaskStatus::Completed, $this->manager);
    expect($visit->fresh()->status)->toBe(VisitStatus::Done);        // both done
});

it('bars a technician from the PPM schedule', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/ppm/visits')->assertForbidden();
});

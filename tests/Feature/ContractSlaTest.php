<?php

use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Asset;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
});

/* ── Stamping ───────────────────────────────────────────── */

it('puts a deadline on a job when the customer is under contract', function () {
    Contract::factory()->active()->for($this->customer)->create([
        'sla_response_hours' => 4,
        'sla_resolution_hours' => 24,
    ]);

    $task = Task::create([
        'customer_id' => $this->customer->id,
        'title' => 'عطل مفاجئ',
        'type' => TaskType::Repair,
        'status' => TaskStatus::Pending,
    ]);

    expect($task->response_due_at)->not->toBeNull()
        ->and($task->resolution_due_at)->not->toBeNull()
        // A breakdown is late from the moment it is logged.
        ->and($task->response_due_at->diffInHours(now()))->toBeLessThanOrEqual(4);
});

it('leaves a job alone when the customer has no contract', function () {
    $task = Task::create([
        'customer_id' => $this->customer->id,
        'title' => 'زيارة بدون عقد',
        'type' => TaskType::Repair,
        'status' => TaskStatus::Pending,
    ]);

    expect($task->contract_id)->toBeNull()
        ->and($task->response_due_at)->toBeNull()
        ->and($task->resolution_due_at)->toBeNull();
});

it('ignores a contract whose term has run out', function () {
    Contract::factory()->expired()->for($this->customer)->create([
        'sla_response_hours' => 4,
    ]);

    $task = Task::create([
        'customer_id' => $this->customer->id,
        'title' => 'بعد انتهاء العقد',
        'type' => TaskType::Repair,
        'status' => TaskStatus::Pending,
    ]);

    expect($task->contract_id)->toBeNull()
        ->and($task->response_due_at)->toBeNull();
});

it('starts a planned visit clock at its appointment, not at creation', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'sla_response_hours' => 4,
    ]);

    $appointment = now()->addMonths(3);

    $task = Task::create([
        'customer_id' => $this->customer->id,
        'contract_id' => $contract->id,
        'title' => 'زيارة صيانة دورية',
        'type' => TaskType::Maintenance,
        'status' => TaskStatus::Pending,
        'scheduled_at' => $appointment,
    ]);

    // Without this a visit cut ahead of time would be born in breach — nobody
    // is late for an appointment three months out.
    expect($task->response_due_at->greaterThan(now()->addMonths(2)))->toBeTrue()
        ->and($task->hasBreachedResponse())->toBeFalse();
});

it('prefers the contract that names the device over a blanket one', function () {
    $asset = Asset::factory()->for($this->customer)->create();

    Contract::factory()->active()->for($this->customer)->create([
        'sla_response_hours' => 48,
    ]);

    $specific = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->subMonth()->toDateString(),
        'sla_response_hours' => 2,
    ]);
    $specific->assets()->attach($asset);

    $task = Task::create([
        'customer_id' => $this->customer->id,
        'asset_id' => $asset->id,
        'title' => 'عطل في جهاز مغطى',
        'type' => TaskType::Repair,
        'status' => TaskStatus::Pending,
    ]);

    expect($task->contract_id)->toBe($specific->id);
});

/* ── Breach ─────────────────────────────────────────────── */

it('reports a breach once the response deadline has passed unanswered', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'sla_response_hours' => 4,
    ]);

    $task = Task::factory()->for($this->customer)->create([
        'contract_id' => $contract->id,
        'response_due_at' => now()->subHour(),
        'accepted_at' => null,
    ]);

    expect($task->hasBreachedResponse())->toBeTrue()
        ->and(Task::query()->slaBreached()->whereKey($task->id)->exists())->toBeTrue();
});

it('does not report a breach when the job was accepted in time', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'sla_response_hours' => 4,
    ]);

    $task = Task::factory()->for($this->customer)->create([
        'contract_id' => $contract->id,
        'response_due_at' => now()->addHour(),
        'accepted_at' => now()->subMinutes(30),
    ]);

    expect($task->hasBreachedResponse())->toBeFalse();
});

it('keeps the deadline that was in force when the job was logged', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'sla_response_hours' => 4,
    ]);

    $task = Task::create([
        'customer_id' => $this->customer->id,
        'title' => 'قبل تعديل العقد',
        'type' => TaskType::Repair,
        'status' => TaskStatus::Pending,
    ]);

    $original = $task->response_due_at->toIso8601String();

    // Re-pricing next year's terms must not rewrite last year's record.
    $contract->update(['sla_response_hours' => 72]);

    expect($task->fresh()->response_due_at->toIso8601String())->toBe($original);
});

/* ── Exposure ───────────────────────────────────────────── */

it('shows the deadline on the job so a technician knows what they are held to', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'sla_response_hours' => 4,
        'sla_resolution_hours' => 24,
    ]);

    $task = Task::factory()->for($this->customer)->create([
        'contract_id' => $contract->id,
        'response_due_at' => now()->addHours(4),
        'resolution_due_at' => now()->addDay(),
    ]);

    actingAs($this->manager)
        ->getJson("/api/tasks/{$task->id}")
        ->assertOk()
        ->assertJsonPath('data.sla.response_breached', false)
        ->assertJsonPath('data.contract.code', $contract->code);
});

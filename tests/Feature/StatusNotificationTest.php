<?php

use App\Enums\TaskStatus;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * A dispatcher's whole view of the day is the notification list. If closing a
 * job does not reach them, they are back to ringing technicians to ask.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    $this->task = Task::factory()->create([
        'customer_id' => Customer::factory(),
        'assigned_to' => $this->technician->id,
        'created_by' => $this->manager->id,
        'status' => TaskStatus::InProgress,
    ]);
});

it('tells the manager when the technician closes the job by hand', function () {
    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/reports", ['type' => 'completion'])
        ->assertCreated();

    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/status", ['status' => 'completed'])
        ->assertStatus(422);   // already closed by the report

    expect($this->manager->notifications()->count())->toBeGreaterThan(0);
});

it('tells the manager when filing the report closes the job', function () {
    // The path the technician actually takes — and the one that was silent.
    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/reports", ['type' => 'completion'])
        ->assertCreated();

    expect($this->task->fresh()->status)->toBe(TaskStatus::Completed)
        ->and($this->manager->notifications()->count())->toBe(1);
});

it('names the job in the notification it sends', function () {
    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/reports", ['type' => 'completion'])
        ->assertCreated();

    expect($this->manager->notifications()->first()->data['task_id'])->toBe($this->task->id);
});

it('notifies on an ordinary status change too', function () {
    $pending = Task::factory()->create([
        'customer_id' => Customer::factory(),
        'assigned_to' => $this->technician->id,
        'created_by' => $this->manager->id,
        'status' => TaskStatus::Pending,
    ]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$pending->id}/status", ['status' => 'accepted'])
        ->assertOk();

    expect($this->manager->notifications()->count())->toBe(1);
});

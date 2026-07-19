<?php

use App\Enums\TaskStatus;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->otherTechnician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
});

function job(array $attributes = []): Task
{
    return Task::factory()->create([
        'customer_id' => test()->customer->id,
        'assigned_to' => test()->technician->id,
        'created_by' => test()->manager->id,
        ...$attributes,
    ]);
}

/* ── Progress belongs to the technician who was there ────── */

it('stops a manager moving a job forward', function () {
    $task = job(['status' => TaskStatus::Pending]);

    actingAs($this->manager)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'accepted'])
        ->assertForbidden();

    expect($task->fresh()->status)->toBe(TaskStatus::Pending);
});

it('stops an admin moving a job forward', function () {
    // Admin outranks everyone on configuration, but was still not at the site.
    $task = job(['status' => TaskStatus::Pending]);

    actingAs($this->admin)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'accepted'])
        ->assertForbidden();

    expect($task->fresh()->status)->toBe(TaskStatus::Pending);
});

it('lets the assigned technician move their own job forward', function () {
    $task = job(['status' => TaskStatus::Pending]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'accepted'])
        ->assertOk()
        ->assertJsonPath('data.status', 'accepted');
});

it('stops a technician moving somebody else\'s job', function () {
    $task = job(['status' => TaskStatus::Pending]);

    actingAs($this->otherTechnician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'accepted'])
        ->assertForbidden();
});

/* ── Cancelling is a dispatch decision ───────────────────── */

it('lets a manager cancel any job', function () {
    // The customer calls the office, not the technician — so the office cancels.
    $task = job(['status' => TaskStatus::Accepted]);

    actingAs($this->manager)
        ->postJson("/api/tasks/{$task->id}/status", [
            'status' => 'cancelled',
            'cancel_reason' => 'العميل أجّل الزيارة',
        ])
        ->assertOk()
        ->assertJsonPath('data.status', 'cancelled');
});

it('stops a technician cancelling a job', function () {
    $task = job(['status' => TaskStatus::Accepted]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'cancelled'])
        ->assertForbidden();

    expect($task->fresh()->status)->toBe(TaskStatus::Accepted);
});

/* ── Filing the completion report finishes the job ───────── */

it('closes the job when the technician files the completion report', function () {
    $task = job(['status' => TaskStatus::InProgress]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/reports", [
            'type' => 'completion',
            'findings' => 'تم الفحص',
            'actions_taken' => 'تم استبدال المروحة',
        ])
        ->assertCreated();

    $fresh = $task->fresh();

    expect($fresh->status)->toBe(TaskStatus::Completed)
        ->and($fresh->completed_at)->not->toBeNull();
});

it('records who closed it in the status log', function () {
    $task = job(['status' => TaskStatus::InProgress]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/reports", ['type' => 'completion'])
        ->assertCreated();

    $log = $task->statusLogs()->latest('id')->first();

    expect($log->to_status)->toBe('completed')
        ->and($log->user_id)->toBe($this->technician->id);
});

it('leaves the job alone when a diagnosis report is filed', function () {
    $task = job(['status' => TaskStatus::InProgress]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/reports", ['type' => 'diagnosis'])
        ->assertCreated();

    expect($task->fresh()->status)->toBe(TaskStatus::InProgress);
});

it('does not close a job that has not started yet', function () {
    // Completion is only reachable from in_progress; filing the report early
    // must not smuggle the job past the states in between.
    $task = job(['status' => TaskStatus::Accepted]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/reports", ['type' => 'completion'])
        ->assertCreated();

    expect($task->fresh()->status)->toBe(TaskStatus::Accepted);
});

it('does not close the job when a manager files the report', function () {
    $task = job(['status' => TaskStatus::InProgress]);

    actingAs($this->manager)
        ->postJson("/api/tasks/{$task->id}/reports", ['type' => 'completion'])
        ->assertCreated();

    expect($task->fresh()->status)->toBe(TaskStatus::InProgress);
});

it('is idempotent when the report is refiled on a closed job', function () {
    $task = job(['status' => TaskStatus::InProgress]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/reports", ['type' => 'completion'])
        ->assertCreated();

    // Editing the report afterwards must not error on an already-final status.
    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/reports", [
            'type' => 'completion',
            'findings' => 'تصحيح القراءات',
        ])
        ->assertCreated();

    expect($task->fresh()->status)->toBe(TaskStatus::Completed);
});

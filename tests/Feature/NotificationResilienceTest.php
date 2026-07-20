<?php

use App\Enums\TaskStatus;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;

/**
 * This deployment runs the queue on `sync`, so notifications are delivered
 * inside the web request. A push endpoint that has gone stale or an SMTP host
 * that is briefly unreachable must never cost the technician the status change
 * they just made — the work happened whether or not anyone got told.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();

    $this->task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'assigned_to' => $this->technician->id,
        'created_by' => $this->manager->id,
        'status' => TaskStatus::InProgress,
    ]);
});

it('still records the status change when notifying blows up', function () {
    // Log::spy proves the failure actually happened and was swallowed. Without
    // it this test would pass just as happily if the mock never fired at all.
    Log::spy();

    Notification::shouldReceive('send')
        ->andThrow(new RuntimeException('SMTP timed out'));

    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/reports", ['type' => 'completion'])
        ->assertCreated();

    expect($this->task->fresh()->status)->toBe(TaskStatus::Completed);

    Log::shouldHaveReceived('warning')
        ->withArgs(fn ($message) => $message === 'Notification delivery failed');
});

it('still cancels when notifying blows up', function () {
    Notification::shouldReceive('send')
        ->andThrow(new RuntimeException('push endpoint gone'));

    actingAs($this->manager)
        ->postJson("/api/tasks/{$this->task->id}/status", [
            'status' => 'cancelled',
            'cancel_reason' => 'العميل أجّل',
        ])
        ->assertOk();

    expect($this->task->fresh()->status)->toBe(TaskStatus::Cancelled);
});

it('keeps the status log even when notifying blows up', function () {
    // The audit trail is the part that matters legally; it must not be the
    // thing that disappears when an unrelated integration is down.
    Notification::shouldReceive('send')
        ->andThrow(new RuntimeException('down'));

    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/status", ['status' => 'completed'])
        ->assertOk();

    expect($this->task->statusLogs()->where('to_status', 'completed')->exists())->toBeTrue();
});

it('still assigns the job when notifying the technician blows up', function () {
    $other = User::factory()->technician()->create();

    Notification::shouldReceive('send')
        ->andThrow(new RuntimeException('down'));

    actingAs($this->manager)
        ->postJson("/api/tasks/{$this->task->id}/assign", ['assigned_to' => $other->id])
        ->assertOk();

    expect($this->task->fresh()->assigned_to)->toBe($other->id);
});

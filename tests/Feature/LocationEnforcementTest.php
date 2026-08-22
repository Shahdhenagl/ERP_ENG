<?php

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Task;
use App\Models\User;
use App\Enums\TaskStatus;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->technician = User::factory()->technician()->create();
    $this->task = Task::factory()->assignedTo($this->technician)->create();
});

it('refuses technician check-in without a GPS fix', function () {
    actingAs($this->technician)
        ->postJson('/api/attendance/check-in')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['lat', 'lng']);

    expect(Attendance::count())->toBe(0);
});

it('refuses technician check-out without a GPS fix', function () {
    $employee = Employee::forUser($this->technician);
    Attendance::create([
        'employee_id' => $employee->id,
        'date' => today()->toDateString(),
        'status' => 'present',
        'check_in' => '08:00',
        'check_in_lat' => 30.0444,
        'check_in_lng' => 31.2357,
    ]);

    actingAs($this->technician)
        ->postJson('/api/attendance/check-out')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['lat', 'lng']);

    expect(Attendance::first()->check_out)->toBeNull();
});

it('requires and records a GPS fix for a technician status transition', function () {
    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/status", ['status' => 'accepted'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('location');

    expect($this->task->fresh()->status)->toBe(TaskStatus::Pending);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/status", [
            'status' => 'accepted',
            'lat' => 30.0444,
            'lng' => 31.2357,
        ])
        ->assertOk();

    $log = $this->task->statusLogs()->latest('id')->first();

    expect($log->lat)->toBe(30.0444)
        ->and($log->lng)->toBe(31.2357);
});

it('requires a GPS fix when a completion report closes an in-progress task', function () {
    $this->task->update(['status' => TaskStatus::InProgress]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/reports", ['type' => 'completion'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('location');

    expect($this->task->fresh()->status)->toBe(TaskStatus::InProgress)
        ->and($this->task->completionReport)->toBeNull();

    actingAs($this->technician)
        ->postJson("/api/tasks/{$this->task->id}/reports", [
            'type' => 'completion',
            'lat' => 30.0444,
            'lng' => 31.2357,
        ])
        ->assertCreated();

    expect($this->task->fresh()->status)->toBe(TaskStatus::Completed)
        ->and($this->task->statusLogs()->latest('id')->first()->lat)->toBe(30.0444);
});

it('accepts a manager dispatch decision without a technician GPS fix', function () {
    actingAs(User::factory()->manager()->create())
        ->postJson("/api/tasks/{$this->task->id}/status", [
            'status' => 'cancelled',
            'cancel_reason' => 'اختبار',
        ])
        ->assertOk();

    expect($this->task->fresh()->status)->toBe(TaskStatus::Cancelled);
});

it('stores GPS coordinates on a technician attendance punch', function () {
    actingAs($this->technician)
        ->postJson('/api/attendance/check-in', [
            'lat' => 30.0444,
            'lng' => 31.2357,
        ])
        ->assertCreated();

    expect((float) Attendance::first()->check_in_lat)->toBe(30.0444)
        ->and((float) Attendance::first()->check_in_lng)->toBe(31.2357);
});

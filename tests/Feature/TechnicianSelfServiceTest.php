<?php

use App\Enums\TaskStatus;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\travelTo;

/**
 * A field technician runs their own leave and attendance from the app, on top of
 * the HR models a manager already owns. Filing leave lands it pending for a
 * manager to decide; a punch stamps where it was made and surfaces on the
 * dashboard; and the manager reads the whole month per technician in one place.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create(['name' => 'محمود الفني']);
});

/* ── Leave self-service ──────────────────────────────────── */

it('lets a technician file leave, opening their HR file on first use', function () {
    expect(Employee::where('user_id', $this->technician->id)->exists())->toBeFalse();

    actingAs($this->technician)->postJson('/api/leave/mine', [
        'type' => 'annual',
        'from_date' => '2026-09-06',   // a Sunday
        'to_date' => '2026-09-08',
        'reason' => 'ظروف عائلية',
    ])->assertCreated()->assertJsonPath('data.status', 'pending');

    $employee = Employee::where('user_id', $this->technician->id)->first();

    expect($employee)->not->toBeNull()
        ->and($employee->leaveRequests()->count())->toBe(1);
});

it('shows a technician only their own leave requests', function () {
    $leaveFor = fn (Employee $e) => LeaveRequest::create([
        'employee_id' => $e->id, 'type' => 'annual',
        'from_date' => '2026-09-06', 'to_date' => '2026-09-06', 'days' => 1,
    ]);

    $leaveFor(Employee::forUser($this->technician));
    $leaveFor(Employee::factory()->create());   // somebody else

    actingAs($this->technician)->getJson('/api/leave/mine')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('lets a manager approve the leave a technician filed', function () {
    actingAs($this->technician)->postJson('/api/leave/mine', [
        'type' => 'sick', 'from_date' => '2026-09-06', 'to_date' => '2026-09-06',
    ])->assertCreated();

    $leave = LeaveRequest::first();

    actingAs($this->manager)->postJson("/api/leave/{$leave->id}/decide", ['action' => 'approve'])
        ->assertOk()
        ->assertJsonPath('data.status', 'approved');
});

it('keeps a technician from approving leave', function () {
    $leave = LeaveRequest::create([
        'employee_id' => Employee::forUser($this->technician)->id, 'type' => 'annual',
        'from_date' => '2026-09-06', 'to_date' => '2026-09-06', 'days' => 1,
    ]);

    actingAs($this->technician)->postJson("/api/leave/{$leave->id}/decide", ['action' => 'approve'])
        ->assertForbidden();
});

/* ── Attendance self check-in / out ──────────────────────── */

it('records a self check-in with its location and opens the HR file', function () {
    travelTo('2026-09-06 08:30:00');

    actingAs($this->technician)->postJson('/api/attendance/check-in', [
        'lat' => 30.0444, 'lng' => 31.2357,
    ])->assertCreated()
        ->assertJsonPath('data.status', 'present')
        ->assertJsonPath('data.check_in', '08:30');

    $record = Attendance::first();

    expect((float) $record->check_in_lat)->toBe(30.0444)
        ->and($record->employee->user_id)->toBe($this->technician->id);
});

it('refuses a second check-in on the same day', function () {
    actingAs($this->technician)->postJson('/api/attendance/check-in')->assertCreated();
    actingAs($this->technician)->postJson('/api/attendance/check-in')
        ->assertStatus(422)
        ->assertJsonValidationErrors('check_in');
});

it('checks out and works out the hours from the two stamps', function () {
    travelTo('2026-09-06 08:00:00');
    actingAs($this->technician)->postJson('/api/attendance/check-in')->assertCreated();

    travelTo('2026-09-06 16:00:00');
    actingAs($this->technician)->postJson('/api/attendance/check-out', ['lat' => 30.05, 'lng' => 31.24])
        ->assertOk()
        ->assertJsonPath('data.check_out', '16:00')
        ->assertJsonPath('data.worked_hours', 8);
});

it('refuses a check-out before any check-in', function () {
    actingAs($this->technician)->postJson('/api/attendance/check-out')
        ->assertStatus(422)
        ->assertJsonValidationErrors('check_out');
});

it('serves the technician their own record for today', function () {
    actingAs($this->technician)->getJson('/api/attendance/mine/today')
        ->assertOk()
        ->assertJsonPath('data', null);

    actingAs($this->technician)->postJson('/api/attendance/check-in')->assertCreated();

    actingAs($this->technician)->getJson('/api/attendance/mine/today')
        ->assertOk()
        ->assertJsonPath('data.status', 'present');
});

/* ── Dashboard widget ────────────────────────────────────── */

it('surfaces today attendance on the manager dashboard', function () {
    actingAs($this->technician)->postJson('/api/attendance/check-in', ['lat' => 30.0, 'lng' => 31.0])
        ->assertCreated();

    $data = actingAs($this->manager)->getJson('/api/dashboard')->assertOk()->json();

    expect($data['stats']['checked_in_today'])->toBe(1)
        ->and($data['stats']['on_site_now'])->toBe(1)
        ->and($data['attendance_today'][0]['employee'])->toBe('محمود الفني')
        ->and($data['attendance_today'][0]['check_in_location'])->not->toBeNull();
});

it('does not leak attendance to a technician dashboard', function () {
    actingAs($this->technician)->getJson('/api/dashboard')
        ->assertOk()
        ->assertJsonMissingPath('attendance_today');
});

/* ── Manager per-technician profile ──────────────────────── */

it('gives a manager the monthly profile of a technician', function () {
    $employee = Employee::forUser($this->technician);
    $employee->update(['basic_salary' => 6000]);

    Task::factory()->create([
        'assigned_to' => $this->technician->id,
        'status' => TaskStatus::Completed,
        'scheduled_at' => '2026-09-10 09:00',
    ]);
    Attendance::create([
        'employee_id' => $employee->id, 'date' => '2026-09-06', 'status' => 'present',
        'check_in' => '08:00', 'check_out' => '16:00', 'recorded_by' => $this->technician->id,
    ]);

    $data = actingAs($this->manager)
        ->getJson("/api/technicians/{$this->technician->id}/profile?year=2026&month=9")
        ->assertOk()
        ->json('data');

    expect($data['technician']['name'])->toBe('محمود الفني')
        ->and($data['employee']['basic_salary'])->toEqual(6000)
        ->and($data['tasks']['total'])->toBe(1)
        ->and($data['tasks']['completed'])->toBe(1)
        ->and($data['attendance']['present_days'])->toBe(1)
        ->and($data['attendance']['worked_hours'])->toEqual(8);
});

it('reports a technician with no HR file rather than failing', function () {
    $data = actingAs($this->manager)
        ->getJson("/api/technicians/{$this->technician->id}/profile")
        ->assertOk()
        ->json('data');

    expect($data['employee'])->toBeNull()
        ->and($data['leave'])->toBe([]);
});

it('keeps a technician out of the profile screen', function () {
    actingAs($this->technician)
        ->getJson("/api/technicians/{$this->technician->id}/profile")
        ->assertForbidden();
});

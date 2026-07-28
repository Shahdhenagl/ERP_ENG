<?php

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->employee = Employee::factory()->create(['name' => 'سيد عبد الله']);
});

it('records a day and derives the hours worked from the two stamps', function () {
    $response = actingAs($this->manager)->postJson('/api/attendance', [
        'employee_id' => $this->employee->id,
        'date' => '2026-08-03',
        'status' => 'present',
        'check_in' => '09:00',
        'check_out' => '17:00',
    ])->assertCreated();

    expect($response->json('data.worked_hours'))->toEqual(8.0)
        ->and($response->json('data.check_in'))->toBe('09:00')
        ->and($response->json('data.status'))->toBe('present');
});

it('corrects a day already recorded instead of duplicating it', function () {
    $payload = [
        'employee_id' => $this->employee->id,
        'date' => '2026-08-03',
        'status' => 'present',
    ];

    actingAs($this->manager)->postJson('/api/attendance', $payload)->assertCreated();
    actingAs($this->manager)->postJson('/api/attendance', [...$payload, 'status' => 'late', 'late_minutes' => 30])
        ->assertCreated();

    expect(Attendance::where('employee_id', $this->employee->id)->whereDate('date', '2026-08-03')->count())
        ->toBe(1);

    $record = Attendance::first();
    expect($record->status->value)->toBe('late')
        ->and($record->late_minutes)->toBe(30);
});

it('sums a month into a line per employee', function () {
    $days = [
        ['2026-08-01', 'present', '09:00', '17:00'],
        ['2026-08-02', 'late', '10:00', '17:00'],
        ['2026-08-03', 'absent', null, null],
        ['2026-08-04', 'leave', null, null],
    ];

    foreach ($days as [$date, $status, $in, $out]) {
        actingAs($this->manager)->postJson('/api/attendance', [
            'employee_id' => $this->employee->id,
            'date' => $date,
            'status' => $status,
            'check_in' => $in,
            'check_out' => $out,
            'late_minutes' => $status === 'late' ? 60 : 0,
        ])->assertCreated();
    }

    $row = actingAs($this->manager)
        ->getJson('/api/attendance/summary?year=2026&month=8')
        ->assertOk()
        ->json('data.0');

    expect($row['present_days'])->toBe(1)
        ->and($row['late_days'])->toBe(1)
        ->and($row['absent_days'])->toBe(1)
        ->and($row['leave_days'])->toBe(1)
        ->and($row['attended_days'])->toBe(2)          // present + late
        ->and($row['late_minutes'])->toBe(60)
        ->and($row['worked_hours'])->toEqual(15.0);    // 8 + 7
});

it('narrows the list to a month', function () {
    Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-08-10', 'status' => 'present']);
    Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-07-10', 'status' => 'present']);

    $rows = actingAs($this->manager)
        ->getJson('/api/attendance?year=2026&month=8')
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['date'])->toBe('2026-08-10');
});

it('narrows the list to a single day and carries the punch location', function () {
    Attendance::create([
        'employee_id' => $this->employee->id, 'date' => '2026-08-10', 'status' => 'present',
        'check_in' => '08:05', 'check_in_lat' => 30.0444, 'check_in_lng' => 31.2357,
    ]);
    Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-08-11', 'status' => 'present']);

    $rows = actingAs($this->manager)
        ->getJson('/api/attendance?year=2026&month=8&date=2026-08-10')
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['date'])->toBe('2026-08-10')
        ->and($rows[0]['check_in'])->toBe('08:05')
        ->and((float) $rows[0]['check_in_lat'])->toBe(30.0444);
});

it('bars a technician from attendance', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->postJson('/api/attendance', [
        'employee_id' => $this->employee->id,
        'date' => '2026-08-03',
        'status' => 'present',
    ])->assertForbidden();
});

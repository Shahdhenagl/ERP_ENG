<?php

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The HR profile gathers one employee's whole picture — personal data, this
 * month's attendance, their leave and their pay — in one read, so a manager
 * does not hop between screens to answer a question about one person.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->employee = Employee::factory()->create(['name' => 'سميرة']);
});

it('gathers the employee attendance onto the profile', function () {
    Attendance::create([
        'employee_id' => $this->employee->id,
        'date' => now()->toDateString(),
        'status' => 'present',
        'check_in' => '08:00',
        'check_out' => '16:00',
    ]);

    $data = actingAs($this->manager)
        ->getJson("/api/employees/{$this->employee->id}")
        ->assertOk()
        ->json('data');

    expect($data['attendance']['this_month']['present'])->toBe(1)
        ->and($data['attendance']['recent'])->toHaveCount(1)
        ->and($data['attendance']['recent'][0]['check_in'])->toBe('08:00')
        // The other sections a profile promises are present too.
        ->and($data)->toHaveKeys(['leave', 'payslips', 'advances', 'gross_salary']);
});

it('keeps the profile behind the HR permission', function () {
    actingAs(User::factory()->technician()->create())
        ->getJson("/api/employees/{$this->employee->id}")
        ->assertForbidden();
});

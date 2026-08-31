<?php

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EmployeeContract;
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
        ->and($data)->toHaveKeys(['leave', 'payslips', 'advances', 'contracts', 'gross_salary']);
});

it('manages employment contracts inside the employee profile', function () {
    $contract = actingAs($this->manager)
        ->postJson("/api/employees/{$this->employee->id}/contracts", [
            'title' => 'عقد سنوي',
            'type' => 'fixed_term',
            'starts_on' => '2026-01-01',
            'ends_on' => '2026-12-31',
            'agreed_salary' => 9000,
            'salary_basis_days' => 30,
            'status' => 'active',
        ])
        ->assertCreated()
        ->json('data');

    expect($contract['code'])->toStartWith('EC-')
        ->and($contract['agreed_salary'])->toBe(9000);

    actingAs($this->manager)
        ->putJson("/api/employees/{$this->employee->id}/contracts/{$contract['id']}", [
            'title' => 'عقد سنوي مجدد',
            'type' => 'fixed_term',
            'starts_on' => '2026-01-01',
            'ends_on' => '2026-12-31',
            'agreed_salary' => 9500,
            'salary_basis_days' => 30,
            'status' => 'active',
        ])
        ->assertOk()
        ->assertJsonPath('data.agreed_salary', 9500);

    $profile = actingAs($this->manager)->getJson("/api/employees/{$this->employee->id}")->json('data');
    expect($profile['contracts'])->toHaveCount(1)
        ->and($profile['contracts'][0]['title'])->toBe('عقد سنوي مجدد');
});

it('does not let a contract be updated through another employee', function () {
    $other = Employee::factory()->create();
    $contract = EmployeeContract::create([
        'employee_id' => $this->employee->id,
        'title' => 'عقد عمل',
        'type' => 'permanent',
        'starts_on' => '2026-01-01',
        'agreed_salary' => 5000,
        'salary_basis_days' => 30,
        'status' => 'active',
    ]);

    actingAs($this->manager)
        ->putJson("/api/employees/{$other->id}/contracts/{$contract->id}", [
            'title' => 'تلاعب', 'type' => 'permanent', 'starts_on' => '2026-01-01',
            'agreed_salary' => 1, 'salary_basis_days' => 30, 'status' => 'active',
        ])
        ->assertNotFound();
});

it('keeps the profile behind the HR permission', function () {
    actingAs(User::factory()->technician()->create())
        ->getJson("/api/employees/{$this->employee->id}")
        ->assertForbidden();
});

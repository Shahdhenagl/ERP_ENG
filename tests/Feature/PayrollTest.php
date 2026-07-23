<?php

use App\Models\Account;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Employee;
use App\Models\PayrollRun;
use App\Models\User;
use App\Services\ChartOfAccounts;
use App\Services\LeaveService;
use App\Services\PayrollService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->payroll = app(PayrollService::class);
    $this->leave = app(LeaveService::class);

    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    // A funded till, or paying a salary would be refused for want of cash.
    CashMovement::create([
        'cash_box_id' => CashBox::default()->id,
        'direction' => 'in', 'amount' => 100000, 'source' => 'opening',
    ]);
});

/** The account balance straight off the journal. */
function acct(string $key): float
{
    app(ChartOfAccounts::class)->ensure();

    return round(Account::key($key)->balance(), 2);
}

/* ── The payslip arithmetic ──────────────────────────────── */

it('adds a payslip up to its net', function () {
    // 6,000 basic + 1,000 allowance, 14% insurance, 10% tax.
    $employee = Employee::factory()->create([
        'basic_salary' => 6000,
        'allowances' => [['name' => 'انتقال', 'amount' => 1000]],
        'insurance_rate' => 14,
        'tax_rate' => 10,
    ]);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $slip = $run->payslips->first();

    // gross 7,000; insurance 14% = 980; tax 10% of (7,000-980)=602.
    expect((float) $slip->gross)->toBe(7000.0)
        ->and((float) $slip->insurance)->toBe(980.0)
        ->and((float) $slip->tax)->toBe(602.0)
        ->and((float) $slip->total_deductions)->toBe(1582.0)
        ->and((float) $slip->net)->toBe(5418.0)
        // The identity the whole module rests on.
        ->and((float) $slip->gross)
        ->toBe(round((float) $slip->net + (float) $slip->total_deductions, 2));
});

it('docks unpaid leave at the daily rate of the basic', function () {
    $employee = Employee::factory()->create(['basic_salary' => 6000, 'allowances' => null]);

    // Three unpaid days in August (31 days) → 6000/31 × 3.
    $leave = $this->leave->request([
        'employee_id' => $employee->id,
        'type' => 'unpaid',
        'from_date' => '2026-08-04',
        'to_date' => '2026-08-06',
    ], $this->manager);
    $this->leave->approve($leave, $this->manager);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $slip = $run->payslips->first();

    expect($slip->unpaid_days)->toBe(3)
        ->and((float) $slip->unpaid_deduction)->toBe(round(6000 / 31 * 3, 2))
        ->and((float) $slip->net)->toBe(round(6000 - (6000 / 31 * 3), 2));
});

it('recovers an advance but never more than is owed', function () {
    $employee = Employee::factory()->create(['basic_salary' => 6000, 'allowances' => null]);

    // A 900 advance, recovered 300 a month.
    $this->payroll->advance([
        'employee_id' => $employee->id,
        'amount' => 900,
        'installment' => 300,
    ], $this->manager);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $slip = $run->payslips->first();

    expect((float) $slip->advance_recovery)->toBe(300.0)
        ->and((float) $slip->net)->toBe(5700.0);
});

it('leaves an employee with nothing owed at zero recovery', function () {
    $employee = Employee::factory()->create(['basic_salary' => 6000, 'allowances' => null]);

    $run = $this->payroll->open(2026, 8, $this->manager);

    expect((float) $run->payslips->first()->advance_recovery)->toBe(0.0);
});

/* ── Advances move real money ────────────────────────────── */

it('takes an advance out of the treasury the day it is given', function () {
    $employee = Employee::factory()->create();
    $before = CashBox::default()->balance();

    $this->payroll->advance([
        'employee_id' => $employee->id, 'amount' => 2000,
    ], $this->manager);

    expect(CashBox::default()->fresh()->balance())->toBe(round($before - 2000, 2))
        // And lands as an asset — money owed back, not spent.
        ->and(acct('staff_advances'))->toBe(2000.0);
});

it('refuses an advance the box cannot cover', function () {
    $employee = Employee::factory()->create();
    $poor = CashBox::create(['name' => 'خزنة فارغة', 'type' => 'cash']);

    $this->payroll->advance([
        'employee_id' => $employee->id, 'amount' => 5000, 'cash_box_id' => $poor->id,
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── The run posts a balanced entry ──────────────────────── */

it('posts a balanced entry when the run is approved', function () {
    Employee::factory()->create([
        'basic_salary' => 6000,
        'allowances' => [['name' => 'انتقال', 'amount' => 1000]],
        'insurance_rate' => 14,
        'tax_rate' => 10,
    ]);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $this->payroll->approve($run, $this->manager);

    // Earned pay is the expense; the withholdings are liabilities; the net is
    // accrued. The trial balance is the proof they balance.
    expect(acct('salaries'))->toBe(7000.0)
        // A liability balance reads positive when credited.
        ->and(acct('accrued_salaries'))->toBe(5418.0)
        ->and(acct('insurance_payable'))->toBe(980.0)
        ->and(acct('payroll_tax_payable'))->toBe(602.0);
});

it('debits the expense with earned pay, not gross', function () {
    // A month with unpaid days costs the company less, and the expense must
    // show it.
    $employee = Employee::factory()->create([
        'basic_salary' => 6000, 'allowances' => null, 'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    $leave = $this->leave->request([
        'employee_id' => $employee->id, 'type' => 'unpaid',
        'from_date' => '2026-08-04', 'to_date' => '2026-08-06',
    ], $this->manager);
    $this->leave->approve($leave, $this->manager);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $this->payroll->approve($run, $this->manager);

    expect(acct('salaries'))->toBe(round(6000 - (6000 / 31 * 3), 2));
});

it('recovers the advance in the ledger when the run posts', function () {
    $employee = Employee::factory()->create([
        'basic_salary' => 6000, 'allowances' => null, 'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    $this->payroll->advance([
        'employee_id' => $employee->id, 'amount' => 900, 'installment' => 300,
    ], $this->manager);

    // 900 out, then a run recovers 300 of it.
    expect(acct('staff_advances'))->toBe(900.0);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $this->payroll->approve($run, $this->manager);

    expect(acct('staff_advances'))->toBe(600.0);
});

/* ── Paying clears the accrual ───────────────────────────── */

it('pays a slip out of the treasury and clears the accrual', function () {
    $employee = Employee::factory()->create([
        'basic_salary' => 6000, 'allowances' => null, 'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $this->payroll->approve($run, $this->manager);

    expect(acct('accrued_salaries'))->toBe(6000.0);  // owed

    $slip = $run->payslips->first();
    $before = CashBox::default()->balance();
    $this->payroll->paySlip($slip->fresh(), $this->manager);

    expect(CashBox::default()->fresh()->balance())->toBe(round($before - 6000, 2))
        ->and(acct('accrued_salaries'))->toBe(0.0)
        ->and($slip->fresh()->isPaid())->toBeTrue();
});

it('marks the run paid once its last slip is', function () {
    Employee::factory()->count(2)->create(['basic_salary' => 3000, 'allowances' => null]);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $this->payroll->approve($run, $this->manager);

    $this->payroll->payRun($run->fresh(), $this->manager);

    expect($run->fresh()->status)->toBe('paid');
});

it('refuses to pay a slip before the run is approved', function () {
    Employee::factory()->create();
    $run = $this->payroll->open(2026, 8, $this->manager);

    $this->payroll->paySlip($run->payslips->first(), $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to pay the same slip twice', function () {
    Employee::factory()->create(['basic_salary' => 3000, 'allowances' => null]);
    $run = $this->payroll->open(2026, 8, $this->manager);
    $this->payroll->approve($run, $this->manager);

    $slip = $run->payslips->first();
    $this->payroll->paySlip($slip->fresh(), $this->manager);
    $this->payroll->paySlip($slip->fresh(), $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Guards on the run ───────────────────────────────────── */

it('refuses two runs for the same month', function () {
    Employee::factory()->create();
    $this->payroll->open(2026, 8, $this->manager);
    $this->payroll->open(2026, 8, $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('only generates slips for active employees', function () {
    Employee::factory()->create(['status' => 'active']);
    Employee::factory()->create(['status' => 'terminated']);

    $run = $this->payroll->open(2026, 8, $this->manager);

    expect($run->payslips)->toHaveCount(1);
});

it('freezes the slip figures against a later raise', function () {
    $employee = Employee::factory()->create(['basic_salary' => 6000, 'allowances' => null]);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $employee->update(['basic_salary' => 9000]);

    expect((float) $run->payslips->first()->basic_salary)->toBe(6000.0);
});

/* ── Leave ───────────────────────────────────────────────── */

it('spends the annual balance on approved annual leave only', function () {
    $employee = Employee::factory()->create(['annual_leave_days' => 21]);

    $annual = $this->leave->request([
        'employee_id' => $employee->id, 'type' => 'annual',
        'from_date' => '2026-03-02', 'to_date' => '2026-03-06',
    ], $this->manager);
    $this->leave->approve($annual, $this->manager);

    // Sick leave takes nothing off the balance.
    $sick = $this->leave->request([
        'employee_id' => $employee->id, 'type' => 'sick',
        'from_date' => '2026-04-01', 'to_date' => '2026-04-03',
    ], $this->manager);
    $this->leave->approve($sick, $this->manager);

    // 5 working days taken (Mon–Fri minus the Friday) — the request counts them.
    expect($employee->fresh()->annualLeaveRemaining(2026))
        ->toBe(21 - $annual->fresh()->days);
});

it('refuses annual leave past the balance', function () {
    $employee = Employee::factory()->create(['annual_leave_days' => 3]);

    $leave = $this->leave->request([
        'employee_id' => $employee->id, 'type' => 'annual',
        'from_date' => '2026-03-02', 'to_date' => '2026-03-31',
    ], $this->manager);

    $this->leave->approve($leave, $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('excludes fridays from the days counted', function () {
    $employee = Employee::factory()->create();

    // 2026-08-02 is a Sunday; the week to Saturday 8th has one Friday in it.
    $leave = $this->leave->request([
        'employee_id' => $employee->id, 'type' => 'annual',
        'from_date' => '2026-08-02', 'to_date' => '2026-08-08',
    ], $this->manager);

    expect($leave->days)->toBe(6);
});

/* ── Through the API ─────────────────────────────────────── */

it('runs the payroll month end to end through the API', function () {
    $employee = Employee::factory()->create([
        'basic_salary' => 5000, 'allowances' => null, 'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    $runId = actingAs($this->manager)
        ->postJson('/api/payroll', ['year' => 2026, 'month' => 9])
        ->assertCreated()
        ->json('data.id');

    actingAs($this->manager)
        ->postJson("/api/payroll/{$runId}/approve")
        ->assertOk()
        ->assertJsonPath('data.status', 'approved');

    actingAs($this->manager)
        ->postJson("/api/payroll/{$runId}/pay")
        ->assertOk()
        ->assertJsonPath('data.status', 'paid');

    expect(acct('salaries'))->toBe(5000.0);
});

it('keeps someone without the payroll permission out', function () {
    // hr and payroll are separate permissions: seeing staff is not paying them.
    $hrOnly = User::factory()->manager()->create();
    \App\Models\UserPermission::create([
        'user_id' => $hrOnly->id, 'permission' => 'payroll.manage', 'granted' => false,
    ]);

    actingAs($hrOnly)->getJson('/api/payroll')->assertForbidden();
    // But the employee register is still theirs.
    actingAs($hrOnly)->getJson('/api/employees')->assertOk();
});

it('keeps a technician out of HR entirely', function () {
    actingAs($this->technician)->getJson('/api/employees')->assertForbidden();
    actingAs($this->technician)->getJson('/api/payroll')->assertForbidden();
});

<?php

use App\Models\Account;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Employee;
use App\Models\PayrollAdjustment;
use App\Models\User;
use App\Services\ChartOfAccounts;
use App\Services\PayrollService;

use function Pest\Laravel\actingAs;

/** An account's balance straight off the journal. */
function adjustmentAcct(string $key): float
{
    app(ChartOfAccounts::class)->ensure();

    return round(Account::key($key)->balance(), 2);
}

beforeEach(function () {
    $this->payroll = app(PayrollService::class);
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    CashMovement::create([
        'cash_box_id' => CashBox::default()->id,
        'direction' => 'in', 'amount' => 100000, 'source' => 'opening',
    ]);
});

/* ── The slip folds the month's adjustments in ───────────── */

it('lifts the net by a bonus booked for the month', function () {
    $employee = Employee::factory()->create([
        'basic_salary' => 6000, 'allowances' => null, 'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    PayrollAdjustment::create([
        'employee_id' => $employee->id, 'type' => 'bonus',
        'amount' => 500, 'reason' => 'تميّز', 'year' => 2026, 'month' => 8,
    ]);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $slip = $run->payslips->first();

    expect((float) $slip->additions_total)->toBe(500.0)
        ->and((float) $slip->net)->toBe(6500.0);
});

it('lowers the net by a deduction booked for the month', function () {
    $employee = Employee::factory()->create([
        'basic_salary' => 6000, 'allowances' => null, 'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    PayrollAdjustment::create([
        'employee_id' => $employee->id, 'type' => 'deduction',
        'amount' => 400, 'reason' => 'تأخير', 'year' => 2026, 'month' => 8,
    ]);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $slip = $run->payslips->first();

    expect((float) $slip->other_deductions)->toBe(400.0)
        ->and((float) $slip->net)->toBe(5600.0);
});

it('nets a bonus and a deduction together, and keeps the slip balanced', function () {
    $employee = Employee::factory()->create([
        'basic_salary' => 6000, 'allowances' => null, 'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    PayrollAdjustment::create(['employee_id' => $employee->id, 'type' => 'bonus', 'amount' => 700, 'year' => 2026, 'month' => 8]);
    PayrollAdjustment::create(['employee_id' => $employee->id, 'type' => 'deduction', 'amount' => 200, 'year' => 2026, 'month' => 8]);

    $slip = $this->payroll->open(2026, 8, $this->manager)->payslips->first();

    // gross 6,000 + 700 bonus − 200 deduction = 6,500
    expect((float) $slip->net)->toBe(6500.0)
        // The identity the module rests on still holds with a bonus in play.
        ->and((float) $slip->net)
        ->toBe(round((float) $slip->gross + (float) $slip->additions_total - (float) $slip->total_deductions, 2));
});

it('ignores an adjustment booked for another month', function () {
    $employee = Employee::factory()->create([
        'basic_salary' => 6000, 'allowances' => null, 'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    PayrollAdjustment::create(['employee_id' => $employee->id, 'type' => 'bonus', 'amount' => 500, 'year' => 2026, 'month' => 7]);

    $slip = $this->payroll->open(2026, 8, $this->manager)->payslips->first();

    expect((float) $slip->additions_total)->toBe(0.0)
        ->and((float) $slip->net)->toBe(6000.0);
});

/* ── The bonus must balance the run's journal entry ──────── */

it('posts a balanced entry when an approved run carries a bonus', function () {
    // The regression this guards: a bonus lifts the net (a credit) but must
    // also lift the salaries debit, or the entry will not balance and the
    // posting is silently swallowed — leaving the whole month off the books.
    $employee = Employee::factory()->create([
        'status' => 'active', 'basic_salary' => 6000, 'allowances' => null,
        'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    PayrollAdjustment::create(['employee_id' => $employee->id, 'type' => 'bonus', 'amount' => 700, 'year' => 2026, 'month' => 8]);
    PayrollAdjustment::create(['employee_id' => $employee->id, 'type' => 'deduction', 'amount' => 200, 'year' => 2026, 'month' => 8]);

    $run = $this->payroll->open(2026, 8, $this->manager);
    $this->payroll->approve($run, $this->manager);

    // Salaries expense carries earned pay plus the bonus; the net (6,500) is
    // accrued; the deduction (200) sits in accrued expenses. Debits = credits.
    expect(adjustmentAcct('salaries'))->toBe(6700.0)
        ->and(adjustmentAcct('accrued_salaries'))->toBe(6500.0)
        ->and(adjustmentAcct('accrued_expenses'))->toBe(200.0);
});

/* ── Through the API ─────────────────────────────────────── */

it('records and lists an adjustment through the API', function () {
    $employee = Employee::factory()->create();

    actingAs($this->manager)->postJson('/api/payroll-adjustments', [
        'employee_id' => $employee->id, 'type' => 'bonus',
        'amount' => 250, 'reason' => 'حافز', 'year' => 2026, 'month' => 8,
    ])->assertCreated();

    actingAs($this->manager)->getJson('/api/payroll-adjustments?employee_id='.$employee->id)
        ->assertOk()
        ->assertJsonPath('data.0.amount', 250)
        ->assertJsonPath('data.0.type', 'bonus');
});

it('deletes an adjustment through the API', function () {
    $employee = Employee::factory()->create();
    $adjustment = PayrollAdjustment::create([
        'employee_id' => $employee->id, 'type' => 'deduction', 'amount' => 100, 'year' => 2026, 'month' => 8,
    ]);

    actingAs($this->manager)->deleteJson('/api/payroll-adjustments/'.$adjustment->id)->assertOk();

    expect(PayrollAdjustment::find($adjustment->id))->toBeNull();
});

it('keeps someone without the payroll permission out of adjustments', function () {
    actingAs($this->technician)->getJson('/api/payroll-adjustments')->assertForbidden();
    actingAs($this->technician)->postJson('/api/payroll-adjustments', [])->assertForbidden();
});

<?php

namespace App\Services;

use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Employee;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\SalaryAdvance;
use App\Models\User;
use App\Support\Terms;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The single writer for advances and the monthly payroll.
 *
 * Money only ever moves through the treasury the rest of the system uses: an
 * advance and a paid payslip are both a cash movement out, and nothing here
 * writes a balance of its own. What this owns is the arithmetic of a payslip,
 * and the one rule that keeps it honest — every figure on the slip adds up to
 * the net, and the net plus what was withheld adds up to what the company
 * actually spent, so the journal entry behind it always balances.
 */
class PayrollService
{
    /* ── Advances ────────────────────────────────────────── */

    /**
     * Hand an employee money now, to be recovered from later payslips.
     *
     * The cash leaves the box today — this is real money out, not a promise —
     * so it is refused if the box cannot cover it.
     *
     * @param  array<string, mixed>  $data
     */
    public function advance(array $data, User $actor): SalaryAdvance
    {
        $employee = Employee::findOrFail($data['employee_id']);
        $amount = round((float) $data['amount'], 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount' => Terms::get('قيمة السلفة يجب أن تكون أكبر من صفر.'),
            ]);
        }

        $box = ! empty($data['cash_box_id'])
            ? CashBox::findOrFail($data['cash_box_id'])
            : CashBox::default();

        if ($amount > $box->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => Terms::get('رصيد «').$box->name.'» لا يكفي ('.number_format($box->balance(), 2).').',
            ]);
        }

        return DB::transaction(function () use ($data, $employee, $amount, $box, $actor) {
            $advance = SalaryAdvance::create([
                'employee_id' => $employee->id,
                'advance_date' => $data['advance_date'] ?? now()->toDateString(),
                'amount' => $amount,
                'installment' => round((float) ($data['installment'] ?? $amount), 2),
                'cash_box_id' => $box->id,
                'notes' => $data['notes'] ?? null,
                'created_by' => $actor->id,
            ]);

            $movement = CashMovement::create([
                'cash_box_id' => $box->id,
                'direction' => 'out',
                'amount' => $amount,
                'transaction_date' => $advance->advance_date,
                'source' => 'advance',
                'note' => "سلفة {$advance->code} — {$employee->name}",
                'user_id' => $actor->id,
            ]);

            $advance->forceFill(['cash_movement_id' => $movement->id])->save();

            return $advance->fresh(['employee', 'box']);
        });
    }

    /* ── The monthly run ─────────────────────────────────── */

    /**
     * Open a draft run for a month, and generate a slip for every active
     * employee.
     *
     * The month is unique: two runs for August is how a salary gets paid
     * twice. Everything on a slip is copied off the employee now, so a raise
     * next month cannot rewrite this one.
     */
    public function open(int $year, int $month, User $actor): PayrollRun
    {
        if ($month < 1 || $month > 12) {
            throw ValidationException::withMessages(['month' => Terms::get('شهر غير صحيح.')]);
        }

        if (PayrollRun::where('year', $year)->where('month', $month)->exists()) {
            throw ValidationException::withMessages([
                'month' => Terms::get('يوجد كشف رواتب لهذا الشهر بالفعل.'),
            ]);
        }

        $daysInMonth = (int) now()->create($year, $month, 1)->daysInMonth;

        return DB::transaction(function () use ($year, $month, $daysInMonth, $actor) {
            $run = PayrollRun::create([
                'year' => $year,
                'month' => $month,
                'days_in_month' => $daysInMonth,
                'created_by' => $actor->id,
            ]);

            Employee::query()->active()->get()->each(
                fn (Employee $employee) => $this->generateSlip($run, $employee),
            );

            return $run->fresh('payslips');
        });
    }

    /**
     * Build one slip, computing every figure and freezing it.
     *
     * @return Payslip
     */
    public function generateSlip(PayrollRun $run, Employee $employee): Payslip
    {
        $leave = app(LeaveService::class);

        $basic = (float) $employee->basic_salary;
        $allowances = $employee->allowancesTotal();
        $gross = round($basic + $allowances, 2);
        $basisDays = max(1, (int) ($employee->salary_basis_days ?: 30));

        // The employee's agreed salary period, not the calendar's length, is
        // the denominator. It can then be corrected on the draft slip.
        $unpaidDays = min($basisDays, $leave->unpaidDaysIn($employee, $run->year, $run->month));
        $workedDays = max(0, $basisDays - $unpaidDays);
        $earnedGross = round($gross * $workedDays / $basisDays, 2);
        $unpaidDeduction = round($gross - $earnedGross, 2);

        // Statutory: insurance on the gross, tax on what is left after it —
        // the order the law applies them in.
        $insurance = round($earnedGross * ((float) $employee->insurance_rate / 100), 2);
        $tax = round(($earnedGross - $insurance) * ((float) $employee->tax_rate / 100), 2);

        // Recover what is owed, but never more than is outstanding, and never
        // more than the month's earned pay could bear.
        $outstanding = max(0.0, $employee->outstandingAdvances());
        $installment = round((float) $employee->advances()->sum('installment'), 2);
        $earnedBeforeAdvance = $gross - $unpaidDeduction - $insurance - $tax;
        $advanceRecovery = round(min($installment, $outstanding, max(0.0, $earnedBeforeAdvance)), 2);

        // One-off deductions and bonuses booked for this month. Bonuses lift the
        // net; penalties join the other deductions. With none booked, both are
        // zero and the slip is exactly what it was before adjustments existed.
        [$bonuses, $otherDeductions, $adjustmentNote] = $this->monthlyAdjustments($employee, $run);

        $deductions = round(
            $unpaidDeduction + $advanceRecovery + $insurance + $tax + $otherDeductions,
            2,
        );

        return Payslip::updateOrCreate(
            ['payroll_run_id' => $run->id, 'employee_id' => $employee->id],
            [
                'basic_salary' => $basic,
                'salary_basis_days' => $basisDays,
                'worked_days' => $workedDays,
                'insurance_rate' => (float) $employee->insurance_rate,
                'tax_rate' => (float) $employee->tax_rate,
                'allowances_total' => $allowances,
                'additions_total' => $bonuses,
                'allowances' => $employee->allowances,
                'unpaid_days' => $unpaidDays,
                'unpaid_deduction' => $unpaidDeduction,
                'advance_recovery' => $advanceRecovery,
                'insurance' => $insurance,
                'tax' => $tax,
                'other_deductions' => $otherDeductions,
                'other_note' => $adjustmentNote,
                'gross' => $gross,
                'total_deductions' => $deductions,
                'net' => round($gross + $bonuses - $deductions, 2),
            ],
        );
    }

    /**
     * Sum the deductions and bonuses booked for an employee in a run's month.
     *
     * @return array{0: float, 1: float, 2: ?string} bonuses, deductions, note
     */
    private function monthlyAdjustments(Employee $employee, PayrollRun $run): array
    {
        $adjustments = $employee->payrollAdjustments()
            ->where('year', $run->year)
            ->where('month', $run->month)
            ->get();

        if ($adjustments->isEmpty()) {
            return [0.0, 0.0, null];
        }

        $bonuses = round((float) $adjustments->where('type', 'bonus')->sum('amount'), 2);
        $deductions = round((float) $adjustments->where('type', 'deduction')->sum('amount'), 2);

        $note = $adjustments
            ->map(fn ($a) => ($a->type === 'bonus' ? 'مكافأة' : 'خصم').' '.number_format((float) $a->amount, 2)
                .($a->reason ? " — {$a->reason}" : ''))
            ->implode('، ');

        return [$bonuses, $deductions, $note ?: null];
    }

    /**
     * Edit a single slip while the run is a draft — an extra deduction, a
     * correction. Recomputes the totals so they cannot fall out of step.
     *
     * @param  array<string, mixed>  $data
     */
    public function adjustSlip(Payslip $slip, array $data): Payslip
    {
        if (! $slip->run->isDraft()) {
            throw ValidationException::withMessages([
                'status' => Terms::get('لا يمكن تعديل قسيمة بعد اعتماد كشف الرواتب.'),
            ]);
        }

        $other = round((float) ($data['other_deductions'] ?? $slip->other_deductions), 2);
        $advance = round((float) ($data['advance_recovery'] ?? $slip->advance_recovery), 2);
        $basisDays = max(1, (int) $slip->salary_basis_days);
        $workedDays = array_key_exists('worked_days', $data)
            ? max(0, min($basisDays, (int) $data['worked_days']))
            : (int) $slip->worked_days;
        $earnedGross = round((float) $slip->gross * $workedDays / $basisDays, 2);
        $unpaidDeduction = round((float) $slip->gross - $earnedGross, 2);
        $insurance = round($earnedGross * ((float) $slip->insurance_rate / 100), 2);
        $tax = round(($earnedGross - $insurance) * ((float) $slip->tax_rate / 100), 2);

        $deductions = round(
            $unpaidDeduction + $advance + $insurance + $tax + $other,
            2,
        );
        $net = round((float) $slip->gross + (float) $slip->additions_total - $deductions, 2);

        if ($net < 0) {
            throw ValidationException::withMessages([
                'other_deductions' => Terms::get('إجمالي الخصومات أكبر من الراتب المستحق.'),
            ]);
        }

        $slip->forceFill([
            'worked_days' => $workedDays,
            'unpaid_days' => $basisDays - $workedDays,
            'unpaid_deduction' => $unpaidDeduction,
            'insurance' => $insurance,
            'tax' => $tax,
            'advance_recovery' => $advance,
            'other_deductions' => $other,
            'other_note' => $data['other_note'] ?? $slip->other_note,
            'total_deductions' => $deductions,
            'net' => $net,
        ])->save();

        return $slip->fresh();
    }

    /**
     * Approve the run. Past this the slips are frozen and the whole month
     * becomes a liability the company owes — posted in one balanced entry by
     * the observer that watches the status change.
     */
    public function approve(PayrollRun $run, User $actor): PayrollRun
    {
        if (! $run->isDraft()) {
            throw ValidationException::withMessages([
                'status' => Terms::get('تم اعتماد كشف الرواتب بالفعل.'),
            ]);
        }

        if ($run->payslips()->count() === 0) {
            throw ValidationException::withMessages([
                'payslips' => Terms::get('لا يمكن اعتماد كشف رواتب بلا قسائم.'),
            ]);
        }

        $run->forceFill([
            'status' => 'approved',
            'approved_by' => $actor->id,
            'approved_at' => now(),
        ])->save();

        return $run->fresh(['payslips', 'approver']);
    }

    /**
     * Pay one slip. Money out of a box clears the accrual raised on approval,
     * so paying is the second half of an entry the run already made.
     */
    public function paySlip(Payslip $slip, User $actor, ?CashBox $box = null, ?string $on = null): Payslip
    {
        if ($slip->run->status === 'draft') {
            throw ValidationException::withMessages([
                'status' => Terms::get('لا يمكن صرف قسيمة قبل اعتماد كشف الرواتب.'),
            ]);
        }

        if ($slip->isPaid()) {
            throw ValidationException::withMessages([
                'status' => Terms::get('تم صرف هذه القسيمة بالفعل.'),
            ]);
        }

        $target = $box ?? CashBox::default();
        $net = (float) $slip->net;

        if ($net > $target->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => Terms::get('رصيد «').$target->name.'» لا يكفي لصرف صافي الراتب.',
            ]);
        }

        return DB::transaction(function () use ($slip, $target, $net, $actor, $on) {
            $movement = CashMovement::create([
                'cash_box_id' => $target->id,
                'direction' => 'out',
                'amount' => $net,
                'source' => 'payroll',
                'note' => "صرف راتب {$slip->run->code} — {$slip->employee->name}",
                'user_id' => $actor->id,
            ]);

            $slip->forceFill([
                'cash_box_id' => $target->id,
                'cash_movement_id' => $movement->id,
                'paid_on' => $on ?? now()->toDateString(),
            ])->save();

            // The run is paid once its last slip is.
            if (! $slip->run->payslips()->whereNull('paid_on')->exists()) {
                $slip->run->forceFill(['status' => 'paid'])->save();
            }

            return $slip->fresh(['employee', 'box', 'run']);
        });
    }

    /** Pay every unpaid slip on an approved run, in one go. */
    public function payRun(PayrollRun $run, User $actor, ?CashBox $box = null): int
    {
        if ($run->status !== 'approved') {
            throw ValidationException::withMessages([
                'status' => Terms::get('لا يمكن الصرف إلا من كشف رواتب معتمد.'),
            ]);
        }

        $unpaid = $run->payslips()->whereNull('paid_on')->get();

        foreach ($unpaid as $slip) {
            $this->paySlip($slip, $actor, $box);
        }

        return $unpaid->count();
    }
}

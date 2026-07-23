<?php

namespace App\Services;

use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Employee;
use App\Models\Payslip;
use App\Models\PayrollRun;
use App\Models\SalaryAdvance;
use App\Models\User;
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
                'amount' => 'قيمة السلفة يجب أن تكون أكبر من صفر.',
            ]);
        }

        $box = ! empty($data['cash_box_id'])
            ? CashBox::findOrFail($data['cash_box_id'])
            : CashBox::default();

        if ($amount > $box->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => 'رصيد «'.$box->name.'» لا يكفي ('.number_format($box->balance(), 2).').',
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
            throw ValidationException::withMessages(['month' => 'شهر غير صحيح.']);
        }

        if (PayrollRun::where('year', $year)->where('month', $month)->exists()) {
            throw ValidationException::withMessages([
                'month' => 'يوجد مسير رواتب لهذا الشهر بالفعل.',
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

        // Days not worked come off at the daily rate of the basic pay.
        $unpaidDays = $leave->unpaidDaysIn($employee, $run->year, $run->month);
        $dailyRate = $run->days_in_month > 0 ? $basic / $run->days_in_month : 0;
        $unpaidDeduction = round($dailyRate * $unpaidDays, 2);

        // Statutory: insurance on the gross, tax on what is left after it —
        // the order the law applies them in.
        $insurance = round($gross * ((float) $employee->insurance_rate / 100), 2);
        $tax = round(($gross - $insurance) * ((float) $employee->tax_rate / 100), 2);

        // Recover what is owed, but never more than is outstanding, and never
        // more than the month's earned pay could bear.
        $outstanding = max(0.0, $employee->outstandingAdvances());
        $installment = round((float) $employee->advances()->sum('installment'), 2);
        $earnedBeforeAdvance = $gross - $unpaidDeduction - $insurance - $tax;
        $advanceRecovery = round(min($installment, $outstanding, max(0.0, $earnedBeforeAdvance)), 2);

        $deductions = round(
            $unpaidDeduction + $advanceRecovery + $insurance + $tax,
            2,
        );

        return Payslip::updateOrCreate(
            ['payroll_run_id' => $run->id, 'employee_id' => $employee->id],
            [
                'basic_salary' => $basic,
                'allowances_total' => $allowances,
                'allowances' => $employee->allowances,
                'unpaid_days' => $unpaidDays,
                'unpaid_deduction' => $unpaidDeduction,
                'advance_recovery' => $advanceRecovery,
                'insurance' => $insurance,
                'tax' => $tax,
                'other_deductions' => 0,
                'gross' => $gross,
                'total_deductions' => $deductions,
                'net' => round($gross - $deductions, 2),
            ],
        );
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
                'status' => 'لا يمكن تعديل قسيمة بعد اعتماد المسير.',
            ]);
        }

        $other = round((float) ($data['other_deductions'] ?? $slip->other_deductions), 2);
        $advance = round((float) ($data['advance_recovery'] ?? $slip->advance_recovery), 2);

        $deductions = round(
            (float) $slip->unpaid_deduction + $advance
            + (float) $slip->insurance + (float) $slip->tax + $other,
            2,
        );

        $slip->forceFill([
            'advance_recovery' => $advance,
            'other_deductions' => $other,
            'other_note' => $data['other_note'] ?? $slip->other_note,
            'total_deductions' => $deductions,
            'net' => round((float) $slip->gross - $deductions, 2),
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
                'status' => 'تم اعتماد هذا المسير بالفعل.',
            ]);
        }

        if ($run->payslips()->count() === 0) {
            throw ValidationException::withMessages([
                'payslips' => 'لا يمكن اعتماد مسير بلا قسائم.',
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
                'status' => 'لا يمكن صرف قسيمة قبل اعتماد المسير.',
            ]);
        }

        if ($slip->isPaid()) {
            throw ValidationException::withMessages([
                'status' => 'تم صرف هذه القسيمة بالفعل.',
            ]);
        }

        $target = $box ?? CashBox::default();
        $net = (float) $slip->net;

        if ($net > $target->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => 'رصيد «'.$target->name.'» لا يكفي لصرف صافي الراتب.',
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
                'status' => 'لا يمكن الصرف إلا من مسير معتمد.',
            ]);
        }

        $unpaid = $run->payslips()->whereNull('paid_on')->get();

        foreach ($unpaid as $slip) {
            $this->paySlip($slip, $actor, $box);
        }

        return $unpaid->count();
    }
}

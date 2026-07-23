<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One employee's slip for one month. Every figure is copied off the employee
 * when the run is generated, so a raise next month cannot rewrite this one.
 */
class Payslip extends Model
{
    use HasFactory;

    protected $fillable = [
        'payroll_run_id', 'employee_id',
        'basic_salary', 'allowances_total', 'allowances',
        'unpaid_days', 'unpaid_deduction', 'advance_recovery',
        'insurance', 'tax', 'other_deductions', 'other_note',
        'gross', 'total_deductions', 'net',
        'cash_box_id', 'cash_movement_id', 'paid_on',
    ];

    protected function casts(): array
    {
        return [
            'allowances' => 'array',
            'basic_salary' => 'decimal:2',
            'allowances_total' => 'decimal:2',
            'unpaid_deduction' => 'decimal:2',
            'advance_recovery' => 'decimal:2',
            'insurance' => 'decimal:2',
            'tax' => 'decimal:2',
            'other_deductions' => 'decimal:2',
            'gross' => 'decimal:2',
            'total_deductions' => 'decimal:2',
            'net' => 'decimal:2',
            'paid_on' => 'date',
        ];
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class, 'payroll_run_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
    }

    public function isPaid(): bool
    {
        return $this->paid_on !== null;
    }

    /**
     * Earned pay: the gross less the days not worked. This — not the gross — is
     * what the company actually spent on this person, and what the salaries
     * expense is debited with.
     */
    public function earnedPay(): float
    {
        return round((float) $this->gross - (float) $this->unpaid_deduction, 2);
    }
}

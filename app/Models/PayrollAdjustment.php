<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A one-off deduction or bonus an operator adds for an employee in a given
 * month. The payslip for that month folds it in: bonuses lift the net, penalties
 * lower it. Distinct from an advance, which is a loan recovered over months.
 */
class PayrollAdjustment extends Model
{
    protected $fillable = [
        'employee_id',
        'type',
        'amount',
        'reason',
        'year',
        'month',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'year' => 'integer',
        'month' => 'integer',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Money handed to an employee now, recovered from later payslips.
 *
 * The cash leaves the treasury the day it is given — this is not a promise like
 * a cheque. What is owed back is derived from the payslips that have recovered
 * against it, never stored, so it cannot disagree with them.
 */
class SalaryAdvance extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'employee_id', 'advance_date', 'amount', 'installment',
        'cash_box_id', 'cash_movement_id', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'advance_date' => 'date',
            'amount' => 'decimal:2',
            'installment' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $advance) {
            $advance->code ??= static::nextCode();
            $advance->advance_date ??= now()->toDateString();
        });
    }

    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "AV-{$year}-%")->count();

        return sprintf('AV-%d-%04d', $year, $count + 1);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

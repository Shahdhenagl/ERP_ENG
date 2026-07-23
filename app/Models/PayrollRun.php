<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One month's payroll. The document; its totals are re-derivable from the
 * payslips under it, exactly as an invoice's total is from its lines.
 */
class PayrollRun extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'year', 'month', 'status', 'days_in_month',
        'approved_by', 'approved_at', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return ['approved_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $run) {
            $run->code ??= sprintf('PR-%d-%02d', $run->year, $run->month);
            $run->status ??= 'draft';
        });
    }

    public function payslips(): HasMany
    {
        return $this->hasMany(Payslip::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isDraft(): bool
    {
        return $this->status === 'draft';
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'draft' => 'مسودة',
            'approved' => 'معتمد',
            'paid' => 'مدفوع',
            default => $this->status,
        };
    }

    public function monthLabel(): string
    {
        $names = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

        return ($names[$this->month] ?? $this->month).' '.$this->year;
    }

    /** Net still unpaid across the run's slips. */
    public function unpaidNet(): float
    {
        return round((float) $this->payslips()->whereNull('paid_on')->sum('net'), 2);
    }
}

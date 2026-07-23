<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A person on the payroll.
 *
 * Not the same as a user. A field technician who logs in is one employee with a
 * login attached; a driver who never touches the app is an employee with none.
 * The link points from here to `users` and is optional, so nobody has to be
 * given a password to be paid.
 */
class Employee extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'user_id', 'name', 'national_id', 'phone', 'job_title', 'department',
        'hired_on', 'left_on', 'employment_type',
        'basic_salary', 'allowances', 'insurance_rate', 'tax_rate', 'annual_leave_days',
        'bank_name', 'bank_account', 'status', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'hired_on' => 'date',
            'left_on' => 'date',
            'basic_salary' => 'decimal:2',
            'allowances' => 'array',
            'insurance_rate' => 'decimal:2',
            'tax_rate' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $employee) {
            $employee->code ??= static::nextCode();
            $employee->hired_on ??= now()->toDateString();
        });
    }

    /** Sequential: EMP-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return 'EMP-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    // ── Relations ────────────────────────────────────────────

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function leaveRequests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }

    public function advances(): HasMany
    {
        return $this->hasMany(SalaryAdvance::class);
    }

    public function payslips(): HasMany
    {
        return $this->hasMany(Payslip::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Pay ──────────────────────────────────────────────────

    /** Basic plus every named allowance — what a full month earns before cuts. */
    public function allowancesTotal(): float
    {
        return round(collect($this->allowances ?? [])
            ->sum(fn ($row) => (float) ($row['amount'] ?? 0)), 2);
    }

    public function grossSalary(): float
    {
        return round((float) $this->basic_salary + $this->allowancesTotal(), 2);
    }

    // ── Leave ────────────────────────────────────────────────

    /**
     * Annual days already approved this year. Only annual leave spends the
     * balance — sick and unpaid do not touch it.
     */
    public function annualLeaveTaken(?int $year = null): int
    {
        return (int) $this->leaveRequests()
            ->where('type', 'annual')
            ->where('status', 'approved')
            ->whereYear('from_date', $year ?? now()->year)
            ->sum('days');
    }

    /** What is left of the year's entitlement — derived, never stored. */
    public function annualLeaveRemaining(?int $year = null): int
    {
        return (int) $this->annual_leave_days - $this->annualLeaveTaken($year);
    }

    /**
     * What the employee still owes against advances — the sum of what was
     * advanced, less what payslips have already recovered.
     */
    public function outstandingAdvances(): float
    {
        $advanced = (float) $this->advances()->sum('amount');
        $recovered = (float) $this->payslips()->sum('advance_recovery');

        return round($advanced - $recovered, 2);
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'active' => 'على رأس العمل',
            'suspended' => 'موقوف',
            'terminated' => 'انتهت خدمته',
            default => $this->status,
        };
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(fn (Builder $q) => $q
            ->where('name', 'like', "%{$term}%")
            ->orWhere('code', 'like', "%{$term}%")
            ->orWhere('phone', 'like', "%{$term}%")
            ->orWhere('national_id', 'like', "%{$term}%")
            ->orWhere('job_title', 'like', "%{$term}%"));
    }
}

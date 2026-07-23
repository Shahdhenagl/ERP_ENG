<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A request for time off.
 *
 * The type decides everything downstream: annual spends the balance, sick does
 * not, and unpaid deducts from the month's pay. Getting that wrong is how
 * someone is docked for sick leave or paid for unpaid.
 */
class LeaveRequest extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'employee_id', 'type', 'from_date', 'to_date', 'days',
        'status', 'reason', 'decided_by', 'decided_at', 'decision_note',
    ];

    protected function casts(): array
    {
        return [
            'from_date' => 'date',
            'to_date' => 'date',
            'decided_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $leave) {
            $leave->code ??= static::nextCode();
            $leave->status ??= 'pending';
        });
    }

    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "LV-{$year}-%")->count();

        return sprintf('LV-%d-%04d', $year, $count + 1);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function typeLabel(): string
    {
        return match ($this->type) {
            'annual' => 'اعتيادية',
            'sick' => 'مرضية',
            'unpaid' => 'بدون أجر',
            default => $this->type,
        };
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'pending' => 'بانتظار الاعتماد',
            'approved' => 'معتمدة',
            'rejected' => 'مرفوضة',
            'cancelled' => 'ملغاة',
            default => $this->status,
        };
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending');
    }
}

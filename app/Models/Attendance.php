<?php

namespace App\Models;

use App\Enums\AttendanceStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One employee's day.
 *
 * Hours worked are derived from the two stamps and frozen on save, so the
 * monthly report adds up figures that were true when the day was recorded — a
 * later edit to the times rewrites them deliberately, through the same path.
 */
class Attendance extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id', 'date', 'status',
        'check_in', 'check_out', 'late_minutes', 'worked_hours',
        'note', 'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'status' => AttendanceStatus::class,
            'late_minutes' => 'integer',
            'worked_hours' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        // The hours are the two stamps' difference, never entered by hand. A day
        // with only one stamp, or none, worked no measurable hours.
        static::saving(function (self $attendance) {
            $attendance->worked_hours = static::hoursBetween(
                $attendance->check_in,
                $attendance->check_out,
            );
        });
    }

    /** Hours between two `HH:MM` stamps, floored at zero, to two places. */
    public static function hoursBetween(?string $in, ?string $out): float
    {
        if (! $in || ! $out) {
            return 0.0;
        }

        $minutes = Carbon::parse($out)->diffInMinutes(Carbon::parse($in), absolute: true);

        return round($minutes / 60, 2);
    }

    // ── Relations ────────────────────────────────────────────

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeForMonth(Builder $query, int $year, int $month): Builder
    {
        return $query->whereYear('date', $year)->whereMonth('date', $month);
    }

    // ── Presentation ─────────────────────────────────────────

    public function statusLabel(): string
    {
        return $this->status->label();
    }
}

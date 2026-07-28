<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A fixed expense that comes round on a cycle — rent, a line, a licence. The
 * template lives here; each actual payment is an ordinary treasury movement, so
 * the money still passes through the one ledger the boxes are summed from.
 */
class RecurringExpense extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'amount',
        'category',
        'cash_box_id',
        'cycle_days',
        'start_on',
        'next_due_on',
        'last_paid_on',
        'is_active',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'cycle_days' => 'integer',
            'start_on' => 'date',
            'next_due_on' => 'date',
            'last_paid_on' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
    }

    // ── Due dates ────────────────────────────────────────────

    /** How many days until it is due — negative once it is overdue. */
    public function daysUntilDue(): int
    {
        return (int) round(now()->startOfDay()->diffInDays($this->next_due_on->startOfDay(), false));
    }

    /** Within the reminder window (or already past it) and still live. */
    public function isDueSoon(int $withinDays = 3): bool
    {
        return $this->is_active && $this->daysUntilDue() <= $withinDays;
    }

    /** Advance the schedule by one whole cycle from the date that was due. */
    public function advanceCycle(): void
    {
        $this->forceFill([
            'last_paid_on' => now()->toDateString(),
            // From the due date, not today, so a late payment does not push the
            // whole series later — the next one still lands on its own day.
            'next_due_on' => $this->next_due_on->copy()->addDays($this->cycle_days)->toDateString(),
        ])->save();
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** Live templates due within the reminder window, or already overdue. */
    public function scopeDueWithin(Builder $query, int $days): Builder
    {
        return $query->where('is_active', true)
            ->whereDate('next_due_on', '<=', now()->addDays($days)->toDateString());
    }
}

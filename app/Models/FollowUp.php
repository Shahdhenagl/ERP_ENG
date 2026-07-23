<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A promise to get back to someone by a date.
 *
 * Its state is never stored — a follow-up is done, overdue, or still owed, and
 * which one it is falls out of two timestamps and the clock. Storing it would
 * mean a nightly job to flip "pending" to "overdue"; deriving it means the
 * answer is always right the moment it is asked.
 */
class FollowUp extends Model
{
    protected $fillable = [
        'subject_type',
        'subject_id',
        'type',
        'due_at',
        'done_at',
        'note',
        'outcome',
        'owner_id',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
            'done_at' => 'datetime',
        ];
    }

    // ── Relations ────────────────────────────────────────────

    public function subject(): MorphTo
    {
        return $this->morphTo();
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Derived state ────────────────────────────────────────

    public function isDone(): bool
    {
        return $this->done_at !== null;
    }

    public function isOverdue(): bool
    {
        return ! $this->isDone() && $this->due_at !== null && $this->due_at->isPast();
    }

    /** done · overdue · pending — the only three a follow-up can be. */
    public function status(): string
    {
        if ($this->isDone()) {
            return 'done';
        }

        return $this->isOverdue() ? 'overdue' : 'pending';
    }

    public function statusLabel(): string
    {
        return match ($this->status()) {
            'done' => 'تم',
            'overdue' => 'متأخّر',
            default => 'قادم',
        };
    }

    public function typeLabel(): string
    {
        return match ($this->type) {
            'call' => 'اتصال',
            'visit' => 'زيارة',
            'whatsapp' => 'واتساب',
            'email' => 'بريد',
            'note' => 'ملاحظة',
            default => $this->type,
        };
    }

    /** The subject's display name, whichever kind it is. */
    public function subjectName(): ?string
    {
        return $this->subject?->name;
    }

    // ── Scopes ───────────────────────────────────────────────

    /** Still owed — not completed. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('done_at');
    }

    /** Open and already due — what a chase list is made of. */
    public function scopeDue(Builder $query): Builder
    {
        return $query->whereNull('done_at')->where('due_at', '<=', now());
    }
}

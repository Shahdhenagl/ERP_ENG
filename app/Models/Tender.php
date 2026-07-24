<?php

namespace App\Models;

use App\Enums\TenderStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One bid to a deadline, won or lost.
 *
 * The win rate a report shows is counted off the settled ones — a stored rate
 * would be a second copy of a number the statuses already hold.
 */
class Tender extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'reference_no', 'entity', 'title', 'customer_id',
        'announced_on', 'submission_deadline', 'opening_date',
        'estimated_value', 'bid_bond', 'status',
        'awarded_value', 'result_note', 'decided_on',
        'owner_id', 'description', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'announced_on' => 'date',
            'submission_deadline' => 'date',
            'opening_date' => 'date',
            'decided_on' => 'date',
            'estimated_value' => 'decimal:2',
            'bid_bond' => 'decimal:2',
            'awarded_value' => 'decimal:2',
            'status' => TenderStatus::class,
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $tender) {
            $tender->code ??= static::nextCode();
            $tender->status ??= TenderStatus::Registered;
        });
    }

    /** Sequential per-year: TN-2026-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('TN-%d-%04d', now()->year, $last + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Helpers ──────────────────────────────────────────────

    /** Days until submission is due — negative once the deadline has passed. */
    public function daysToDeadline(): ?int
    {
        if (! $this->submission_deadline) {
            return null;
        }

        return (int) round(now()->startOfDay()->diffInDays($this->submission_deadline->startOfDay(), false));
    }

    public function statusLabel(): string
    {
        return $this->status->label();
    }

    public function scopeStatus(Builder $query, ?string $status): Builder
    {
        return $status ? $query->where('status', $status) : $query;
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('title', 'like', "%{$term}%")
                ->orWhere('entity', 'like', "%{$term}%")
                ->orWhere('code', 'like', "%{$term}%")
                ->orWhere('reference_no', 'like', "%{$term}%");
        });
    }
}

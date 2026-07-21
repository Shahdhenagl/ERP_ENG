<?php

namespace App\Models;

use App\Enums\QuotationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Quotation extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'customer_id', 'asset_id', 'task_id', 'title',
        'issue_date', 'valid_until', 'status',
        'subtotal', 'discount', 'tax_rate', 'tax_amount', 'total', 'currency',
        'terms', 'notes', 'reject_reason', 'sent_at', 'decided_at', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => QuotationStatus::class,
            'issue_date' => 'date',
            'valid_until' => 'date',
            'sent_at' => 'datetime',
            'decided_at' => 'datetime',
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $quotation) {
            $quotation->code ??= static::nextCode();
            $quotation->status ??= QuotationStatus::Draft;
            $quotation->issue_date ??= now()->toDateString();
        });
    }

    /** Sequential per-year number: QT-2026-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('QT-%d-%04d', now()->year, $last + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(QuotationLine::class)->orderBy('sort');
    }

    /** The order it turned into, if the customer accepted. */
    public function salesOrder(): HasOne
    {
        return $this->hasOne(SalesOrder::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── State ────────────────────────────────────────────────

    /**
     * A sent quote past its validity date has lapsed. Derived rather than
     * stored: nothing on this host runs on a timer to flip a column, and a
     * stale flag is worse than no flag.
     */
    public function hasLapsed(): bool
    {
        return $this->status === QuotationStatus::Sent
            && $this->valid_until !== null
            && $this->valid_until->endOfDay()->isPast();
    }

    public function effectiveStatus(): string
    {
        return $this->hasLapsed() ? 'expired' : $this->status->value;
    }

    public function effectiveStatusLabel(): string
    {
        return $this->hasLapsed() ? 'انتهت صلاحيته' : $this->status->label();
    }

    /** Days left to decide; negative once the offer has lapsed. */
    public function daysRemaining(): ?int
    {
        if (! $this->valid_until) {
            return null;
        }

        return (int) now()->startOfDay()->diffInDays($this->valid_until->startOfDay(), false);
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeAwaitingDecision(Builder $query): Builder
    {
        return $query->where('status', QuotationStatus::Sent->value);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('code', 'like', "%{$term}%")
                ->orWhere('title', 'like', "%{$term}%")
                ->orWhereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$term}%"));
        });
    }
}

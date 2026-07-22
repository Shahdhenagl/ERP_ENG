<?php

namespace App\Models;

use App\Enums\JournalSource;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One balanced entry. Append-only by convention, exactly like the treasury
 * ledger it sits beside: a mistake is corrected by a reversing entry, never by
 * editing what was posted.
 */
class JournalEntry extends Model
{
    use HasFactory;

    protected $fillable = [
        'code', 'entry_date', 'memo', 'source',
        'sourceable_type', 'sourceable_id', 'event',
        'total', 'is_void', 'reverses_id', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'entry_date' => 'date',
            'source' => JournalSource::class,
            'total' => 'decimal:2',
            'is_void' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $entry) {
            $entry->code ??= static::nextCode();
            $entry->entry_date ??= now()->toDateString();
        });
    }

    /** Sequential per-year number: JV-2026-0001. */
    public static function nextCode(): string
    {
        return sprintf('JV-%d-%04d', now()->year, (static::max('id') ?? 0) + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class)->orderBy('sort');
    }

    /** The invoice, receipt or movement this entry was written for. */
    public function sourceable(): MorphTo
    {
        return $this->morphTo();
    }

    public function reverses(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reverses_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeLive(Builder $query): Builder
    {
        return $query->where('is_void', false);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(fn (Builder $q) => $q
            ->where('code', 'like', "%{$term}%")
            ->orWhere('memo', 'like', "%{$term}%"));
    }
}

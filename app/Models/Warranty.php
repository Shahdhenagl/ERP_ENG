<?php

namespace App\Models;

use App\Enums\WarrantyKind;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Warranty extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'warranties';

    protected $fillable = [
        'code',
        'asset_id',
        'customer_id',
        'kind',
        'covers',
        'starts_on',
        'ends_on',
        'parent_id',
        'invoice_id',
        'supplier_id',
        'supplier_reference',
        'status',
        'void_reason',
        'terms',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'kind' => WarrantyKind::class,
            'starts_on' => 'date',
            'ends_on' => 'date',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $warranty) {
            $warranty->code ??= static::nextCode();
        });
    }

    /** Sequential per-year: WR-2026-0001. */
    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "WR-{$year}-%")->count();

        return sprintf('WR-%d-%04d', $year, $count + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /** The warranty this one extends, if any. */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function extensions(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function claims(): HasMany
    {
        return $this->hasMany(WarrantyClaim::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Derived state ────────────────────────────────────────

    /**
     * Whether this warranty answers for a fault that happened on `$on`.
     *
     * Judged against the fault date rather than today, so a claim filed the
     * Monday after a Friday failure is still covered by a warranty that lapsed
     * over the weekend. Voiding is the one thing that ignores dates: a warranty
     * torn up for tampering never covered anything.
     */
    public function coversDate(?string $on = null): bool
    {
        if ($this->status !== 'active') {
            return false;
        }

        $date = now()->parse($on ?? now()->toDateString())->startOfDay();

        return $date->gte($this->starts_on->startOfDay())
            && $date->lte($this->ends_on->startOfDay());
    }

    /** What to show, which is never just what was stored. */
    public function effectiveStatus(): string
    {
        if ($this->status === 'void') {
            return 'void';
        }

        if ($this->starts_on->isFuture()) {
            return 'scheduled';
        }

        if ($this->ends_on->endOfDay()->isPast()) {
            return 'expired';
        }

        // A month's notice is what makes an extension sellable rather than a
        // renewal nobody remembered to offer.
        return $this->ends_on->diffInDays(now()->startOfDay()) >= -30 ? 'expiring' : 'active';
    }

    public function effectiveStatusLabel(): string
    {
        return match ($this->effectiveStatus()) {
            'void' => 'ملغي',
            'scheduled' => 'لم يبدأ',
            'expired' => 'منتهي',
            'expiring' => 'قارب على الانتهاء',
            default => 'ساري',
        };
    }

    /** Negative once the term has elapsed, which is the number worth showing. */
    public function daysRemaining(): int
    {
        return (int) round(now()->startOfDay()->diffInDays($this->ends_on->startOfDay(), false));
    }

    public function coversLabel(): string
    {
        return match ($this->covers) {
            'parts' => 'قطع الغيار فقط',
            'labour' => 'المصنعية فقط',
            default => 'قطع غيار ومصنعية',
        };
    }

    // ── Scopes ───────────────────────────────────────────────

    /** Live cover: not voided, and today falls inside the term. */
    public function scopeEffective(Builder $query, ?string $on = null): Builder
    {
        $date = $on ?? now()->toDateString();

        return $query->where('status', 'active')
            ->whereDate('starts_on', '<=', $date)
            ->whereDate('ends_on', '>=', $date);
    }

    public function scopeExpiringWithin(Builder $query, int $days): Builder
    {
        return $query->where('status', 'active')
            ->whereDate('ends_on', '>=', now()->toDateString())
            ->whereDate('ends_on', '<=', now()->addDays($days)->toDateString());
    }
}

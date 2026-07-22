<?php

namespace App\Models;

use App\Enums\ContractStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contract extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'customer_id',
        'renewed_from_id',
        'title',
        'starts_on',
        'ends_on',
        'visits_per_year',
        'status',
        'value',
        'currency',
        'sla_response_hours',
        'sla_resolution_hours',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => ContractStatus::class,
            'starts_on' => 'date',
            'ends_on' => 'date',
            'visits_per_year' => 'integer',
            'value' => 'decimal:2',
            'sla_response_hours' => 'integer',
            'sla_resolution_hours' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $contract) {
            $contract->code ??= static::nextCode();
            // The column default only applies inside the database, so a freshly
            // created model would carry a null status back to the resource.
            $contract->status ??= ContractStatus::Draft;
        });
    }

    /**
     * Sequential per-year contract number: CT-2026-0001.
     *
     * Keyed off max(id) rather than a filtered count — a count would drift the
     * moment a contract is soft-deleted, and the unique index is the backstop
     * if two managers ever race.
     */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('CT-%d-%04d', now()->year, $last + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Empty means the contract covers everything the customer owns. */
    /** The contract this one renewed, and the one that renewed it. */
    public function renewedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'renewed_from_id');
    }

    public function renewal(): HasOne
    {
        return $this->hasOne(self::class, 'renewed_from_id');
    }

    public function assets(): BelongsToMany
    {
        return $this->belongsToMany(Asset::class);
    }

    public function visits(): HasMany
    {
        return $this->hasMany(ContractVisit::class)->orderBy('sequence');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Term ─────────────────────────────────────────────────

    /**
     * The status worth showing. Only draft/active/cancelled are stored;
     * "expired" and "scheduled" are facts about today's date, and deriving
     * them is what lets this work on a host with no scheduler.
     */
    public function effectiveStatus(): string
    {
        if ($this->status === ContractStatus::Cancelled) {
            return 'cancelled';
        }

        if ($this->status === ContractStatus::Draft) {
            return 'draft';
        }

        if ($this->ends_on->endOfDay()->isPast()) {
            return 'expired';
        }

        if ($this->starts_on->startOfDay()->isFuture()) {
            return 'scheduled';
        }

        return 'active';
    }

    public function effectiveStatusLabel(): string
    {
        return match ($this->effectiveStatus()) {
            'draft' => 'مسودة',
            'scheduled' => 'لم يبدأ',
            'active' => 'ساري',
            'expired' => 'منتهي',
            'cancelled' => 'ملغي',
        };
    }

    public function isRunning(): bool
    {
        return $this->effectiveStatus() === 'active';
    }

    /** Days left in the term; negative once it has elapsed. */
    public function daysRemaining(): int
    {
        return (int) now()->startOfDay()->diffInDays($this->ends_on->startOfDay(), false);
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeActiveOn(Builder $query, mixed $date): Builder
    {
        return $query->where('status', ContractStatus::Active->value)
            ->whereDate('starts_on', '<=', $date)
            ->whereDate('ends_on', '>=', $date);
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

    /** Running contracts whose term ends within the given number of days. */
    public function scopeExpiringWithin(Builder $query, int $days): Builder
    {
        return $query->where('status', ContractStatus::Active->value)
            ->whereBetween('ends_on', [now()->toDateString(), now()->addDays($days)->toDateString()]);
    }
}

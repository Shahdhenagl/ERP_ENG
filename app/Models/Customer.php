<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'name',
        'company',
        'type',
        'phone',
        'whatsapp',
        'email',
        'address',
        'city',
        'lat',
        'lng',
        'map_url',
        'notes',
        'is_active',
        'created_by',
    ];

    /**
     * The kinds of account a standby-power company serves, in the vernacular
     * its sales desk actually uses. Value stored, label shown.
     *
     * @var array<string, string>
     */
    public const TYPES = [
        'factory' => 'مصنع',
        'hospital' => 'مستشفى',
        'hotel' => 'فندق',
        'bank' => 'بنك',
        'data_center' => 'مركز بيانات',
        'government' => 'جهة حكومية',
        'company' => 'شركة / مؤسسة',
        'tower' => 'برج / عقار',
        'education' => 'مؤسسة تعليمية',
        'retail' => 'محل تجاري',
        'other' => 'أخرى',
    ];

    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $customer) {
            $customer->code ??= static::nextCode();
        });
    }

    /** Sequential human-readable code: CU-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return 'CU-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    // ── Relations ────────────────────────────────────────────

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    public function contracts(): HasMany
    {
        return $this->hasMany(Contract::class);
    }

    public function quotations(): HasMany
    {
        return $this->hasMany(Quotation::class);
    }

    public function assets(): HasMany
    {
        return $this->hasMany(Asset::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function followUps(): MorphMany
    {
        return $this->morphMany(FollowUp::class, 'subject');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Helpers ──────────────────────────────────────────────

    public function whatsappNumber(): ?string
    {
        return $this->whatsapp ?: $this->phone;
    }

    public function typeLabel(): ?string
    {
        return $this->type ? (self::TYPES[$this->type] ?? $this->type) : null;
    }

    /**
     * Where the account stands on cover, in one word.
     *
     * Expiring wins over active because it is the one that needs a call; active
     * over expired because a live contract is the headline. Reads the counts the
     * list query attaches when they are there, and falls back to its own tally
     * on a lone model so the answer is the same either way.
     */
    public function contractStanding(): string
    {
        $expiring = $this->expiring_contracts_count
            ?? $this->contracts()->expiringWithin(60)->count();
        $active = $this->active_contracts_count
            ?? $this->contracts()->activeOn(now()->toDateString())->count();
        $total = $this->contracts_count
            ?? $this->contracts()->count();

        return match (true) {
            $expiring > 0 => 'expiring',
            $active > 0 => 'active',
            $total > 0 => 'expired',
            default => 'none',
        };
    }

    public function contractStandingLabel(): string
    {
        return match ($this->contractStanding()) {
            'active' => 'عقد ساري',
            'expiring' => 'قارب على الانتهاء',
            'expired' => 'عقد منتهي',
            default => 'بلا عقد',
        };
    }

    /**
     * Prefer precise coordinates; fall back to whatever share link was pasted,
     * then to a plain address search.
     */
    public function mapsUrl(): ?string
    {
        if ($this->lat !== null && $this->lng !== null) {
            return "https://www.google.com/maps/search/?api=1&query={$this->lat},{$this->lng}";
        }

        if ($this->map_url) {
            return $this->map_url;
        }

        return $this->address
            ? 'https://www.google.com/maps/search/?api=1&query='.urlencode($this->address)
            : null;
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('name', 'like', "%{$term}%")
                ->orWhere('company', 'like', "%{$term}%")
                ->orWhere('phone', 'like', "%{$term}%")
                ->orWhere('code', 'like', "%{$term}%");
        });
    }

    public function scopeOfType(Builder $query, ?string $type): Builder
    {
        return $type ? $query->where('type', $type) : $query;
    }

    /**
     * Filter by where the account stands on cover. `active` deliberately
     * excludes the ones already inside the expiry window, so the two buckets do
     * not overlap and «ساري» means «ساري ومطمئن».
     */
    public function scopeContractStanding(Builder $query, ?string $standing): Builder
    {
        $today = now()->toDateString();

        return match ($standing) {
            'active' => $query
                ->whereHas('contracts', fn (Builder $c) => $c->activeOn($today))
                ->whereDoesntHave('contracts', fn (Builder $c) => $c->expiringWithin(60)),
            'expiring' => $query->whereHas('contracts', fn (Builder $c) => $c->expiringWithin(60)),
            'expired' => $query
                ->has('contracts')
                ->whereDoesntHave('contracts', fn (Builder $c) => $c->activeOn($today)),
            'none' => $query->doesntHave('contracts'),
            default => $query,
        };
    }
}

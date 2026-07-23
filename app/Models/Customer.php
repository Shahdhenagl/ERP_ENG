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
}

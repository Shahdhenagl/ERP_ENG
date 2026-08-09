<?php

namespace App\Models;

use App\Enums\TaskStatus;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A customer site. Devices sit at one, jobs are dispatched to one, and the
 * person the technician actually meets works at one.
 */
class Branch extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'customer_id', 'name', 'customer_ref',
        'address', 'governorate', 'city', 'lat', 'lng', 'map_url',
        'contact_name', 'contact_phone', 'contact_whatsapp',
        'working_hours', 'route', 'notes', 'is_active', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'route' => 'array',
            'is_active' => 'boolean',
        ];
    }

    /**
     * The expected float for a trip to this site: every leg's fare, plus the
     * allowance and any lodging. Zero when no route has been set.
     */
    public function routeTotal(): float
    {
        $route = $this->route ?? [];

        $legs = collect($route['legs'] ?? [])->sum(fn ($leg) => (float) ($leg['cost'] ?? 0));

        return round($legs + (float) ($route['allowance'] ?? 0) + (float) ($route['lodging'] ?? 0), 2);
    }

    protected static function booted(): void
    {
        static::creating(fn (self $branch) => $branch->code ??= static::nextCode());
    }

    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return 'BR-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function assets(): HasMany
    {
        return $this->hasMany(Asset::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    // ── Helpers ──────────────────────────────────────────────

    /** Whoever the technician rings on arrival, falling back to head office. */
    public function contactNumber(): ?string
    {
        return $this->contact_whatsapp ?: ($this->contact_phone ?: $this->customer?->whatsappNumber());
    }

    /**
     * Turn-by-turn link. Precise coordinates win; a pasted share link is the
     * next best thing; an address search is the last resort.
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

    /** "فرع المعادي — بنك القاهرة", for a picker that lists every branch. */
    public function lastVisitCompletedAt(?int $ignoreTaskId = null): ?CarbonInterface
    {
        if ($ignoreTaskId === null && array_key_exists('last_visit_completed_at', $this->attributes)) {
            return $this->last_visit_completed_at
                ? $this->asDateTime($this->last_visit_completed_at)
                : null;
        }

        $completedAt = $this->tasks()
            ->where('status', TaskStatus::Completed->value)
            ->whereNotNull('completed_at')
            ->when($ignoreTaskId, fn ($q, $id) => $q->whereKeyNot($id))
            ->latest('completed_at')
            ->value('completed_at');

        return $completedAt ? $this->asDateTime($completedAt) : null;
    }

    public function nextVisitAvailableAt(?int $ignoreTaskId = null): ?CarbonInterface
    {
        return $this->lastVisitCompletedAt($ignoreTaskId)?->copy()->addDays(22);
    }

    public function daysSinceLastVisit(?int $ignoreTaskId = null): ?int
    {
        $last = $this->lastVisitCompletedAt($ignoreTaskId);

        return $last ? (int) $last->diffInDays(now()) : null;
    }

    public function label(): string
    {
        return $this->customer
            ? "{$this->name} — {$this->customer->name}"
            : $this->name;
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
                ->orWhere('code', 'like', "%{$term}%")
                ->orWhere('customer_ref', 'like', "%{$term}%")
                ->orWhere('address', 'like', "%{$term}%");
        });
    }
}

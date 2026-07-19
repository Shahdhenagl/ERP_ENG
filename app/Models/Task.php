<?php

namespace App\Models;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'customer_id',
        'asset_id',
        'assigned_to',
        'created_by',
        'title',
        'description',
        'type',
        'priority',
        'status',
        'site_address',
        'site_lat',
        'site_lng',
        'site_map_url',
        'scheduled_at',
        'accepted_at',
        'on_the_way_at',
        'started_at',
        'completed_at',
        'cancelled_at',
        'cancel_reason',
    ];

    protected function casts(): array
    {
        return [
            'type' => TaskType::class,
            'priority' => TaskPriority::class,
            'status' => TaskStatus::class,
            'site_lat' => 'float',
            'site_lng' => 'float',
            'scheduled_at' => 'datetime',
            'accepted_at' => 'datetime',
            'on_the_way_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $task) {
            $task->code ??= static::nextCode();
        });
    }

    /**
     * Sequential per-year job number: WO-2026-0001.
     * The unique index on `code` is the backstop if two managers ever race.
     */
    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()
            ->where('code', 'like', "WO-{$year}-%")
            ->count();

        return sprintf('WO-%d-%04d', $year, $count + 1);
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

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(TaskStatusLog::class)->orderBy('created_at');
    }

    public function reports(): HasMany
    {
        return $this->hasMany(TaskReport::class);
    }

    public function diagnosisReport(): HasOne
    {
        return $this->hasOne(TaskReport::class)->where('type', 'diagnosis');
    }

    public function completionReport(): HasOne
    {
        return $this->hasOne(TaskReport::class)->where('type', 'completion');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(TaskAttachment::class);
    }

    // ── Location helpers ─────────────────────────────────────

    /**
     * Site coordinates fall back to the customer's registered location, so a
     * manager who does not re-enter the address still sends the technician
     * somewhere real.
     */
    public function effectiveLat(): ?float
    {
        return $this->site_lat ?? $this->customer?->lat;
    }

    public function effectiveLng(): ?float
    {
        return $this->site_lng ?? $this->customer?->lng;
    }

    public function effectiveAddress(): ?string
    {
        return $this->site_address ?: $this->customer?->address;
    }

    /** Turn-by-turn navigation link for the technician's phone. */
    public function navigationUrl(): ?string
    {
        $lat = $this->effectiveLat();
        $lng = $this->effectiveLng();

        if ($lat !== null && $lng !== null) {
            return "https://www.google.com/maps/dir/?api=1&destination={$lat},{$lng}";
        }

        if ($this->site_map_url) {
            return $this->site_map_url;
        }

        if ($this->customer?->map_url) {
            return $this->customer->map_url;
        }

        $address = $this->effectiveAddress();

        return $address
            ? 'https://www.google.com/maps/dir/?api=1&destination='.urlencode($address)
            : null;
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNotIn('status', [
            TaskStatus::Completed->value,
            TaskStatus::Cancelled->value,
        ]);
    }

    public function scopeForTechnician(Builder $query, int $userId): Builder
    {
        return $query->where('assigned_to', $userId);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('title', 'like', "%{$term}%")
                ->orWhere('code', 'like', "%{$term}%")
                ->orWhereHas('asset', fn (Builder $a) => $a->where('serial', 'like', "%{$term}%"))
                ->orWhereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$term}%"));
        });
    }
}

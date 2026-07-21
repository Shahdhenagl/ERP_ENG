<?php

namespace App\Models;

use App\Enums\AssetStatus;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Asset extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'serial',
        'customer_id',
        'branch_id',
        'brand',
        'model',
        'capacity',
        'site_address',
        'site_lat',
        'site_lng',
        'sold_at',
        'warranty_months',
        'installed_at',
        'status',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => AssetStatus::class,
            'sold_at' => 'date',
            'installed_at' => 'date',
            'site_lat' => 'float',
            'site_lng' => 'float',
            'warranty_months' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $asset) {
            $asset->code ??= static::nextCode();
            // The column default only applies inside the database, so a freshly
            // created model would carry a null status back to the resource.
            $asset->status ??= AssetStatus::Active;
        });
    }

    /** Sequential human-readable code: AS-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return 'AS-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Warranty ─────────────────────────────────────────────

    /**
     * Warranty runs from the sale date — not delivery, not commissioning.
     * Without both a sale date and a term there is nothing to compute, which
     * is different from "expired" and has to stay distinguishable.
     */
    public function warrantyEndsAt(): ?CarbonInterface
    {
        if (! $this->sold_at || ! $this->warranty_months) {
            return null;
        }

        return $this->sold_at->copy()->addMonths($this->warranty_months);
    }

    public function isUnderWarranty(): ?bool
    {
        $end = $this->warrantyEndsAt();

        return $end === null ? null : $end->isFuture();
    }

    /** Best available human name: brand+model, else the serial, else the code. */
    public function label(): string
    {
        $model = trim("{$this->brand} {$this->model}");

        return $model !== '' ? $model : ($this->serial ?: $this->code);
    }

    public function warrantyLabel(): string
    {
        return match ($this->isUnderWarranty()) {
            true => 'ساري',
            false => 'منتهي',
            null => 'غير محدد',
        };
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('serial', 'like', "%{$term}%")
                ->orWhere('code', 'like', "%{$term}%")
                ->orWhere('brand', 'like', "%{$term}%")
                ->orWhere('model', 'like', "%{$term}%");
        });
    }

    public function scopeUnderWarranty(Builder $query): Builder
    {
        return $query
            ->whereNotNull('sold_at')
            ->whereNotNull('warranty_months')
            ->whereRaw('DATE_ADD(sold_at, INTERVAL warranty_months MONTH) > ?', [now()->toDateString()]);
    }
}

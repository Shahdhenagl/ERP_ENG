<?php

namespace App\Models;

use App\Enums\ItemCategory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Item extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'sku',
        'barcode',
        'name',
        'category',
        'item_category_id',
        'unit',
        'tracks_serials',
        'avg_cost',
        'reorder_level',
        'notes',
        'is_active',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'category' => ItemCategory::class,
            'tracks_serials' => 'boolean',
            'avg_cost' => 'decimal:2',
            'reorder_level' => 'decimal:3',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $item) {
            $item->code ??= static::nextCode();
            $item->category ??= ItemCategory::SparePart;
        });
    }

    /** Sequential human-readable code: IT-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return 'IT-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    // ── Relations ────────────────────────────────────────────

    public function levels(): HasMany
    {
        return $this->hasMany(StockLevel::class);
    }

    /** The editable grouping. `category` is the old fixed enum beside it. */
    public function group(): BelongsTo
    {
        return $this->belongsTo(ItemCategory::class, 'item_category_id');
    }

    public function serials(): HasMany
    {
        return $this->hasMany(ItemSerial::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Stock ────────────────────────────────────────────────

    /** Everything the company holds, wherever it is sitting. */
    public function totalQty(): float
    {
        return (float) ($this->relationLoaded('levels')
            ? $this->levels->sum('qty')
            : $this->levels()->sum('qty'));
    }

    public function qtyIn(Warehouse $warehouse): float
    {
        return (float) ($this->levels()
            ->where('warehouse_id', $warehouse->id)
            ->value('qty') ?? 0);
    }

    /** Value on hand at the current average — what the accountant asks for. */
    public function stockValue(): float
    {
        return round($this->totalQty() * (float) $this->avg_cost, 2);
    }

    public function isBelowReorderLevel(): bool
    {
        return (float) $this->reorder_level > 0
            && $this->totalQty() < (float) $this->reorder_level;
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
                ->orWhere('sku', 'like', "%{$term}%")
                ->orWhere('barcode', 'like', "%{$term}%")
                // A scan on the search box should land on the item whether the
                // code is on the item or on one of its units.
                ->orWhereHas('serials', fn (Builder $s) => $s->where('serial', 'like', "%{$term}%"));
        });
    }

    /**
     * Items whose total on-hand has fallen under the reorder level. Done in SQL
     * so the list can be paginated rather than filtered in PHP after the fact.
     */
    public function scopeBelowReorderLevel(Builder $query): Builder
    {
        return $query
            ->where('reorder_level', '>', 0)
            ->whereRaw(
                '(select coalesce(sum(qty), 0) from stock_levels where stock_levels.item_id = items.id) < items.reorder_level',
            );
    }
}

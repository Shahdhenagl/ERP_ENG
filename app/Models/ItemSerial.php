<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One physical unit of a serial-tracked item.
 *
 * The quantity ledger stays the authority on how many there are; this answers
 * which ones, and where each has been.
 */
class ItemSerial extends Model
{
    use HasFactory;

    protected $fillable = [
        'item_id',
        'serial',
        'status',
        'warehouse_id',
        'received_movement_id',
        'issued_movement_id',
        'asset_id',
        'note',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function receivedOn(): BelongsTo
    {
        return $this->belongsTo(StockMovement::class, 'received_movement_id');
    }

    public function issuedOn(): BelongsTo
    {
        return $this->belongsTo(StockMovement::class, 'issued_movement_id');
    }

    /** The device this unit ended up inside, once it is installed. */
    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'in_stock' => 'في المخزن',
            'issued' => 'مصروف',
            'returned' => 'مرتجع',
            'scrapped' => 'مستبعد',
            default => $this->status,
        };
    }

    public function isAvailable(): bool
    {
        return in_array($this->status, ['in_stock', 'returned'], true);
    }

    // ── Scopes ───────────────────────────────────────────────

    /** On a shelf and sellable — what an issue may draw from. */
    public function scopeAvailable(Builder $query): Builder
    {
        return $query->whereIn('status', ['in_stock', 'returned']);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        return $term ? $query->where('serial', 'like', "%{$term}%") : $query;
    }
}

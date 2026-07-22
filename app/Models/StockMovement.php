<?php

namespace App\Models;

use App\Enums\MovementType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of the stock ledger. Append-only by convention: a mistake is
 * corrected with an opposing adjustment, never by editing history.
 */
class StockMovement extends Model
{
    use HasFactory;

    protected $fillable = [
        'item_id',
        'from_warehouse_id',
        'to_warehouse_id',
        'type',
        'qty',
        'unit_cost',
        'task_id',
        'supplier_id',
        'purchase_order_id',
        'supplier',
        'reference',
        'note',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'type' => MovementType::class,
            'qty' => 'decimal:3',
            'unit_cost' => 'decimal:2',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function from(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'from_warehouse_id');
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'to_warehouse_id');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** What this line was worth when it happened. */
    public function value(): float
    {
        return round((float) $this->qty * (float) $this->unit_cost, 2);
    }

    /**
     * The effect on one warehouse's balance. Quantity is always stored
     * positive; the sign lives in which end of the move this place is.
     */
    public function signedQtyFor(int $warehouseId): float
    {
        $qty = (float) $this->qty;

        return match ($warehouseId) {
            $this->to_warehouse_id => $qty,
            $this->from_warehouse_id => -$qty,
            default => 0.0,
        };
    }
}

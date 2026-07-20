<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseOrder extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'supplier_id', 'order_date', 'expected_date',
        'status', 'tax_rate', 'currency', 'notes', 'cancel_reason', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'order_date' => 'date',
            'expected_date' => 'date',
            'tax_rate' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $order) {
            $order->code ??= static::nextCode();
            $order->order_date ??= now()->toDateString();
            $order->status ??= 'draft';
        });
    }

    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('PO-%d-%04d', now()->year, $last + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseOrderLine::class)->orderBy('sort');
    }

    /** Receipts booked against this order. */
    public function receipts(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Money ────────────────────────────────────────────────

    public function subtotal(): float
    {
        return round((float) $this->lines()
            ->selectRaw('coalesce(sum(qty * unit_price), 0) as total')
            ->value('total'), 2);
    }

    public function total(): float
    {
        $subtotal = $this->subtotal();

        return round($subtotal + $subtotal * ((float) $this->tax_rate / 100), 2);
    }

    // ── Fulfilment ───────────────────────────────────────────

    /** Quantity received per item, from the stock ledger. */
    public function receivedByItem(): array
    {
        return $this->receipts()
            ->where('type', 'receipt')
            ->selectRaw('item_id, coalesce(sum(qty), 0) as received')
            ->groupBy('item_id')
            ->pluck('received', 'item_id')
            ->map(fn ($qty) => (float) $qty)
            ->all();
    }

    /** How much of each line is still outstanding. */
    public function outstandingFor(int $itemId): float
    {
        $ordered = (float) $this->lines()->where('item_id', $itemId)->sum('qty');

        return round($ordered - ($this->receivedByItem()[$itemId] ?? 0), 3);
    }

    /**
     * Derived, never stored — a status column would go stale the moment a
     * receipt was booked, and nothing here runs on a timer to correct it.
     */
    public function fulfilment(): string
    {
        if ($this->status === 'cancelled') {
            return 'cancelled';
        }

        if ($this->status === 'draft') {
            return 'draft';
        }

        $received = $this->receivedByItem();
        $anyReceived = false;
        $allComplete = true;

        foreach ($this->lines as $line) {
            $got = $received[$line->item_id] ?? 0;

            if ($got > 0) {
                $anyReceived = true;
            }

            if ($got + 0.0005 < (float) $line->qty) {
                $allComplete = false;
            }
        }

        if ($allComplete && $this->lines->isNotEmpty()) {
            return 'received';
        }

        return $anyReceived ? 'partly_received' : 'awaiting';
    }

    public function fulfilmentLabel(): string
    {
        return match ($this->fulfilment()) {
            'draft' => 'مسودة',
            'cancelled' => 'ملغي',
            'awaiting' => 'بانتظار الاستلام',
            'partly_received' => 'استلام جزئي',
            default => 'تم الاستلام',
        };
    }

    public function isOpen(): bool
    {
        return in_array($this->fulfilment(), ['awaiting', 'partly_received'], true);
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('code', 'like', "%{$term}%")
                ->orWhereHas('supplier', fn (Builder $s) => $s->where('name', 'like', "%{$term}%"));
        });
    }
}

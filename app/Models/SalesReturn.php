<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A credit note: goods or services handed back, and the invoice reduced by
 * what they were sold for.
 *
 * The mirror of PurchaseReturn on the customer side. Posting one does two
 * things at once, which is why it is a document and not a bare adjustment: the
 * customer owes less, and — for the lines worth putting back — the store holds
 * more.
 */
class SalesReturn extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'customer_id',
        'invoice_id',
        'warehouse_id',
        'return_date',
        'reason',
        'status',
        'subtotal',
        'tax_rate',
        'tax_amount',
        'total',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'return_date' => 'date',
            'subtotal' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $return) {
            $return->code ??= static::nextCode();
            $return->return_date ??= now()->toDateString();
            $return->status ??= 'draft';
        });
    }

    /** Sequential per-year credit note: CN-2026-0001. */
    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "CN-{$year}-%")->count();

        return sprintf('CN-%d-%04d', $year, $count + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SalesReturnLine::class)->orderBy('sort')->orderBy('id');
    }

    /** The stock that came back when this was posted. */
    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── State ────────────────────────────────────────────────

    public function isPosted(): bool
    {
        return $this->status === 'posted';
    }

    /** What the returned goods cost, for the lines going back on the shelf. */
    public function restockedCost(): float
    {
        return round((float) $this->lines()
            ->where('restock', true)
            ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
            ->value('total'), 2);
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopePosted(Builder $query): Builder
    {
        return $query->where('status', 'posted');
    }
}

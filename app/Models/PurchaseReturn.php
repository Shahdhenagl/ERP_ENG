<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Goods going back out to the supplier — a faulty batch, a wrong model, an
 * over-delivery.
 *
 * Posting one does two things at once, which is why it is a document and not
 * a bare stock movement: the goods leave the store, and the debt to the
 * supplier drops by what they cost. A debit note the supplier can be shown.
 */
class PurchaseReturn extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'supplier_id',
        'supplier_invoice_id',
        'warehouse_id',
        'return_date',
        'reason',
        'status',
        'total',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'return_date' => 'date',
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

    /** Sequential per-year: PR-2026-0001. */
    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "PR-{$year}-%")->count();

        return sprintf('PR-%d-%04d', $year, $count + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(SupplierInvoice::class, 'supplier_invoice_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseReturnLine::class)->orderBy('sort')->orderBy('id');
    }

    /** The stock that left when this was posted. */
    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isPosted(): bool
    {
        return $this->status === 'posted';
    }
}

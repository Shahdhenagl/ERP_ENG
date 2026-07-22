<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'name', 'company', 'phone', 'whatsapp', 'email',
        'address', 'tax_id', 'notes', 'is_active', 'created_by',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::creating(fn (self $supplier) => $supplier->code ??= static::nextCode());
    }

    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return 'SP-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    // ── Relations ────────────────────────────────────────────

    public function orders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(SupplierInvoice::class);
    }

    public function returns(): HasMany
    {
        return $this->hasMany(PurchaseReturn::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Money ────────────────────────────────────────────────

    /** Value of everything received from them, at the price it came in at. */
    public function purchasedTotal(): float
    {
        return round((float) $this->receipts()
            ->where('type', 'receipt')
            ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
            ->value('total'), 2);
    }

    /** Value of everything sent back, at the cost it was received at. */
    public function returnedTotal(): float
    {
        return round((float) $this->receipts()
            ->where('type', 'purchase_return')
            ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
            ->value('total'), 2);
    }

    /**
     * What the bills add beyond the goods themselves: tax, price differences,
     * and bills with no delivery behind them at all.
     *
     * Adding bill totals in full would double every purchase — the cost was
     * already owed the moment the goods arrived.
     */
    public function billedExtras(): float
    {
        return round($this->invoices()
            ->where('status', 'posted')
            ->get()
            ->sum(fn (SupplierInvoice $invoice) => $invoice->accrual()), 2);
    }

    public function paidTotal(): float
    {
        return round((float) $this->payments()->sum('amount'), 2);
    }

    /**
     * What the company still owes.
     *
     * Derived, never stored, and deliberately built from the same four facts
     * the payable account is built from — goods in, what the bill added, goods
     * back out, money out. A test asserts the two agree; if they ever diverge,
     * one of them is lying to the person deciding who to pay.
     */
    public function balance(): float
    {
        return round(
            $this->purchasedTotal()
            + $this->billedExtras()
            - $this->returnedTotal()
            - $this->paidTotal(),
            2,
        );
    }

    /** Goods received that no bill covers yet — the supplier's invoice is late. */
    public function uninvoicedTotal(): float
    {
        return round((float) $this->receipts()
            ->where('type', 'receipt')
            ->whereNull('supplier_invoice_id')
            ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
            ->value('total'), 2);
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
                ->orWhere('code', 'like', "%{$term}%")
                ->orWhere('phone', 'like', "%{$term}%");
        });
    }
}

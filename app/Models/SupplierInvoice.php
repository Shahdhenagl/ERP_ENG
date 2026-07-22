<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A supplier's claim on the company. The mirror of Invoice on the sales side.
 *
 * Its value is not the whole debt it creates — the goods receipt behind it
 * already put the cost into payables. What the bill adds is `accrual()`: the
 * tax, the price difference, or the entire amount when nothing was received.
 */
class SupplierInvoice extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'supplier_id',
        'supplier_ref',
        'purchase_order_id',
        'invoice_date',
        'due_date',
        'subtotal',
        'discount',
        'tax_rate',
        'tax_amount',
        'total',
        'currency',
        'status',
        'void_reason',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'invoice_date' => 'date',
            'due_date' => 'date',
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $invoice) {
            $invoice->code ??= static::nextCode();
            $invoice->invoice_date ??= now()->toDateString();
            $invoice->status ??= 'draft';
        });
    }

    /** Sequential per-year: SB-2026-0001. */
    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "SB-{$year}-%")->count();

        return sprintf('SB-%d-%04d', $year, $count + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SupplierInvoiceLine::class)->orderBy('sort')->orderBy('id');
    }

    /** The goods receipts this bill covers. */
    public function receipts(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class);
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

    /** Cost of the goods already booked into payables by their receipt. */
    public function coveredValue(): float
    {
        return round((float) $this->receipts()
            ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
            ->value('total'), 2);
    }

    /**
     * What this bill adds to the payable, over and above the receipts.
     *
     * A bill matching its goods exactly and carrying no tax adds nothing: the
     * debt was already recorded when the goods arrived. Counting the bill in
     * full there would double it.
     */
    public function accrual(): float
    {
        return $this->status === 'void' ? 0.0 : round((float) $this->total - $this->coveredValue(), 2);
    }

    public function paidTotal(): float
    {
        return round((float) $this->payments()->sum('amount'), 2);
    }

    public function returnedTotal(): float
    {
        return round((float) $this->returns()->where('status', 'posted')->sum('total'), 2);
    }

    /** Still outstanding on this bill, after returns and payments against it. */
    public function balance(): float
    {
        if ($this->status !== 'posted') {
            return 0.0;
        }

        return round((float) $this->total - $this->returnedTotal() - $this->paidTotal(), 2);
    }

    /**
     * Derived on every read. Nothing here flips a stored flag when a due date
     * passes, and a reversed payment has to be able to reopen a paid bill.
     */
    public function paymentState(): string
    {
        if ($this->status === 'draft') {
            return 'draft';
        }

        if ($this->status === 'void') {
            return 'void';
        }

        $balance = $this->balance();

        if ($balance <= 0.005) {
            return 'paid';
        }

        if ($this->due_date && $this->due_date->endOfDay()->isPast()) {
            return 'overdue';
        }

        return $this->paidTotal() > 0 ? 'partly_paid' : 'unpaid';
    }

    public function paymentStateLabel(): string
    {
        return match ($this->paymentState()) {
            'draft' => 'مسودة',
            'void' => 'ملغاة',
            'paid' => 'مسددة',
            'partly_paid' => 'مسددة جزئيًا',
            'overdue' => 'متأخرة',
            default => 'غير مسددة',
        };
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->where('status', 'posted');
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->where('status', 'posted')
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', now()->toDateString());
    }
}

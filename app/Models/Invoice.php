<?php

namespace App\Models;

use App\Enums\InvoiceStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'customer_id',
        'task_id',
        'contract_id',
        'sales_order_id',
        'warehouse_id',
        'issue_date',
        'due_date',
        'status',
        'subtotal',
        'discount',
        'tax_rate',
        'tax_amount',
        'total',
        'currency',
        'customer_tax_id',
        'notes',
        'void_reason',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => InvoiceStatus::class,
            'issue_date' => 'date',
            'due_date' => 'date',
            'eta_submitted_at' => 'datetime',
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
            $invoice->status ??= InvoiceStatus::Draft;
            $invoice->issue_date ??= now()->toDateString();
        });
    }

    /** Sequential per-year number: INV-2026-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('INV-%d-%04d', now()->year, $last + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class);
    }

    /** The store the goods leave from. Null falls back to the default store. */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class)->orderBy('sort');
    }

    /** Every stock movement this invoice caused — the issue and any reversal. */
    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function salesReturns(): HasMany
    {
        return $this->hasMany(SalesReturn::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Money ────────────────────────────────────────────────

    public function paidTotal(): float
    {
        return round((float) ($this->relationLoaded('payments')
            ? $this->payments->sum('amount')
            : $this->payments()->sum('amount')), 2);
    }

    /**
     * Credited back by posted returns. Drafts are excluded — a return that has
     * not been posted has not happened, and letting it reduce the debt would
     * let anyone forgive an invoice by typing one and leaving it.
     */
    public function creditedTotal(): float
    {
        return round((float) $this->salesReturns()->posted()->sum('total'), 2);
    }

    public function balance(): float
    {
        if (! $this->status->countsAsReceivable()) {
            return 0.0;
        }

        return round((float) $this->total - $this->creditedTotal() - $this->paidTotal(), 2);
    }

    /**
     * Derived, never stored. A stored flag would go stale the moment a receipt
     * was edited or deleted, and there is no scheduler here to correct it.
     */
    public function paymentState(): string
    {
        if ($this->status === InvoiceStatus::Void) {
            return 'void';
        }

        if ($this->status === InvoiceStatus::Draft) {
            return 'draft';
        }

        $paid = $this->paidTotal();
        $credited = $this->creditedTotal();

        // An invoice fully credited was never collected and is not "paid" —
        // saying so would hide a returned sale inside the collection figures.
        // Guarded on a positive total: without it a zero invoice satisfies
        // "credited >= total" with no credit note in sight and reads as
        // returned.
        if ($credited > 0.005 && $credited + 0.005 >= (float) $this->total) {
            return 'credited';
        }

        // Compare with a cent of tolerance: decimal arithmetic on money should
        // not leave an invoice reading "unpaid" over a rounding crumb.
        if ($paid + $credited + 0.005 >= (float) $this->total) {
            return 'paid';
        }

        if ($paid > 0) {
            return 'partly_paid';
        }

        return $this->isOverdue() ? 'overdue' : 'unpaid';
    }

    public function paymentStateLabel(): string
    {
        return match ($this->paymentState()) {
            'draft' => 'مسودة',
            'void' => 'ملغاة',
            'paid' => 'مدفوعة',
            'credited' => 'مرتجعة',
            'partly_paid' => 'مدفوعة جزئيًا',
            'overdue' => 'متأخرة',
            default => 'غير مدفوعة',
        };
    }

    public function isOverdue(): bool
    {
        return $this->status->countsAsReceivable()
            && $this->due_date !== null
            && $this->due_date->endOfDay()->isPast()
            && $this->balance() > 0.005;
    }

    // ── Where the money came from ────────────────────────────

    /**
     * What this invoice is for, derived from what it hangs off rather than a
     * column anyone has to remember to set. Order is deliberate: an order is a
     * sale whatever else is attached, and warranty work is warranty work even
     * though it reaches here as a job.
     */
    public function source(): string
    {
        if ($this->sales_order_id) {
            return 'sales';
        }

        if ($this->task_id && $this->task?->warrantyClaim) {
            return 'warranty';
        }

        if ($this->contract_id) {
            return 'contract';
        }

        return $this->task_id ? 'service' : 'manual';
    }

    public function sourceLabel(): string
    {
        return static::SOURCES[$this->source()];
    }

    public const SOURCES = [
        'sales' => 'مبيعات',
        'contract' => 'عقود صيانة',
        'warranty' => 'ضمان',
        'service' => 'أوامر شغل',
        'manual' => 'يدوية',
    ];

    // ── Scopes ───────────────────────────────────────────────

    /**
     * The same buckets as source(), expressed in SQL so the list paginates.
     * Each arm restates the ones above it as exclusions — the buckets have to
     * partition the table, or a filtered total would not add up to the whole.
     */
    public function scopeOfSource(Builder $query, ?string $source): Builder
    {
        return match ($source) {
            'sales' => $query->whereNotNull('sales_order_id'),
            'warranty' => $query->whereNull('sales_order_id')
                ->whereHas('task.warrantyClaim'),
            'contract' => $query->whereNull('sales_order_id')
                ->whereNotNull('contract_id')
                ->whereDoesntHave('task.warrantyClaim'),
            'service' => $query->whereNull('sales_order_id')
                ->whereNull('contract_id')
                ->whereNotNull('task_id')
                ->whereDoesntHave('task.warrantyClaim'),
            'manual' => $query->whereNull('sales_order_id')
                ->whereNull('contract_id')
                ->whereNull('task_id'),
            default => $query,
        };
    }

    public function scopeReceivable(Builder $query): Builder
    {
        return $query->where('status', InvoiceStatus::Issued->value);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('code', 'like', "%{$term}%")
                ->orWhereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$term}%"));
        });
    }

    /**
     * Issued invoices not settled in full. Done in SQL so the list paginates
     * rather than being filtered in PHP after the fact.
     */
    public function scopeOutstanding(Builder $query): Builder
    {
        // Credits count alongside receipts. Without them a fully returned
        // invoice keeps appearing on the chase list and inside the receivable
        // total, which is the same figure the treasury screen reports.
        return $query->receivable()->whereRaw(
            'invoices.total > ('
            .'(select coalesce(sum(amount), 0) from payments'
            .' where payments.invoice_id = invoices.id and payments.deleted_at is null)'
            .' + (select coalesce(sum(total), 0) from sales_returns'
            .' where sales_returns.invoice_id = invoices.id'
            ." and sales_returns.status = 'posted' and sales_returns.deleted_at is null)"
            .') + 0.005',
        );
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->outstanding()
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', now()->toDateString());
    }
}

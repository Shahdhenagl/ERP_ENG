<?php

namespace App\Models;

use App\Enums\SalesOrderStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class SalesOrder extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'customer_id', 'quotation_id', 'order_date', 'delivery_date', 'status',
        'subtotal', 'discount', 'tax_rate', 'tax_amount', 'total', 'currency',
        'notes', 'cancel_reason', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => SalesOrderStatus::class,
            'order_date' => 'date',
            'delivery_date' => 'date',
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $order) {
            $order->code ??= static::nextCode();
            $order->status ??= SalesOrderStatus::Open;
            $order->order_date ??= now()->toDateString();
        });
    }

    /** Sequential per-year number: SO-2026-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('SO-%d-%04d', now()->year, $last + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SalesOrderLine::class)->orderBy('sort');
    }

    /** Invoices raised off this order — usually one, but staged billing happens. */
    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    /** Installation or delivery jobs raised from this order. */
    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Billing ──────────────────────────────────────────────

    /** Value already invoiced, ignoring anything voided. */
    public function invoicedTotal(): float
    {
        return round((float) $this->invoices()
            ->whereNot('status', 'void')
            ->sum('total'), 2);
    }

    public function uninvoicedTotal(): float
    {
        return round((float) $this->total - $this->invoicedTotal(), 2);
    }

    /**
     * Derived from the invoices against it, so it cannot go stale when one is
     * voided — the same reason an invoice does not store whether it is paid.
     */
    public function billingState(): string
    {
        if ($this->status === SalesOrderStatus::Cancelled) {
            return 'cancelled';
        }

        $invoiced = $this->invoicedTotal();

        if ($invoiced + 0.005 >= (float) $this->total && $invoiced > 0) {
            return 'invoiced';
        }

        return $invoiced > 0 ? 'partly_invoiced' : 'not_invoiced';
    }

    public function billingStateLabel(): string
    {
        return match ($this->billingState()) {
            'cancelled' => 'ملغي',
            'invoiced' => 'تمت فوترته',
            'partly_invoiced' => 'فوترة جزئية',
            default => 'لم تتم فوترته',
        };
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', SalesOrderStatus::Open->value);
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
}

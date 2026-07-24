<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One supplier's price against a request.
 *
 * It is paperwork, not a commitment: nothing moves until it is selected and an
 * order is raised from it. The total is the sum of the lines, so it can never
 * disagree with them.
 */
class SupplierQuote extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'supplier_id', 'purchase_request_id',
        'quote_date', 'valid_until', 'status', 'lead_days', 'tax_rate',
        'purchase_order_id', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'quote_date' => 'date',
            'valid_until' => 'date',
            'tax_rate' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $quote) {
            $quote->code ??= static::nextCode();
            $quote->quote_date ??= now()->toDateString();
            $quote->status ??= 'received';
        });
    }

    /** Sequential per-year: SQ-2026-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('SQ-%d-%04d', now()->year, $last + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'purchase_request_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SupplierQuoteLine::class);
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

    // ── State ────────────────────────────────────────────────

    public function statusLabel(): string
    {
        return match ($this->status) {
            'received' => 'مستلَم',
            'selected' => 'مُعتمد',
            'rejected' => 'مرفوض',
            default => $this->status,
        };
    }

    public function scopeStatus(Builder $query, ?string $status): Builder
    {
        return $status ? $query->where('status', $status) : $query;
    }
}

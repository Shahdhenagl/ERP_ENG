<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Money handed to a supplier. The mirror of Payment on the sales side. */
class SupplierPayment extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'supplier_id', 'supplier_invoice_id', 'cash_box_id', 'amount',
        'method', 'paid_at', 'reference', 'note', 'user_id',
    ];

    protected function casts(): array
    {
        return [
            'method' => PaymentMethod::class,
            'paid_at' => 'date',
            'amount' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $payment) {
            $payment->code ??= static::nextCode();
            $payment->paid_at ??= now()->toDateString();
        });
    }

    /** Sequential per-year voucher number: PV-2026-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('PV-%d-%04d', now()->year, $last + 1);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** The bill this was against. Null is a payment on account. */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(SupplierInvoice::class, 'supplier_invoice_id');
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}

<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'customer_id',
        'invoice_id',
        'cash_box_id',
        'amount',
        'method',
        'paid_at',
        'reference',
        'note',
        'user_id',
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

    /** Sequential per-year receipt number: RC-2026-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('RC-%d-%04d', now()->year, $last + 1);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Money taken in without naming an invoice — sits against the customer. */
    public function scopeOnAccount(Builder $query): Builder
    {
        return $query->whereNull('invoice_id');
    }
}

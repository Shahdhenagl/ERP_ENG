<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Schema;

/**
 * One line of the treasury ledger. Append-only by convention: a mistake is
 * corrected with an opposing movement, never by editing history.
 */
class CashMovement extends Model
{
    use HasFactory;

    protected $fillable = [
        'cash_box_id',
        'task_id',
        'direction',
        'amount',
        'transaction_date',
        'payment_method',
        'source',
        'payment_id',
        // Present since purchasing landed but never fillable, so every voucher
        // written before this was saved with a null link back to itself.
        'supplier_payment_id',
        'counterpart_box_id',
        'category',
        // Which expense heading it belongs under, and which part of the
        // business wore it. Only ever set on a payment out.
        'account_id',
        // The employee the expense was incurred for.
        'responsible_user_id',
        'cost_center_id',
        'note',
        'receipt_path',
        'reconciled_at',
        'reconciled_by',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'transaction_date' => 'date',
            'reconciled_at' => 'datetime',
        ];
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
    }

    /** The job a custody expense was spent on, when it names one. */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function supplierPayment(): BelongsTo
    {
        return $this->belongsTo(SupplierPayment::class);
    }

    /** The box on the other end of a transfer, or of a float advanced. */
    public function counterpartBox(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'counterpart_box_id');
    }

    /** The expense heading chosen when this was recorded, if any. */
    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    /** Branches covered by an informational transport-custody expense. */
    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'cash_movement_branches')
            ->withTimestamps();
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Who the money was spent for, when that is somebody else. */
    public function responsible(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsible_user_id');
    }

    public const PAYMENT_METHOD_LABELS = [
        'cash' => 'كاش',
        'bank_transfer' => 'تحويل بنكي',
        'instapay' => 'إنستا باي',
        'vodafone_cash' => 'فودافون كاش',
    ];

    public function scopeTransactionDateBetween(Builder $query, ?string $from, ?string $to): Builder
    {
        if (! Schema::hasColumn('cash_movements', 'transaction_date')) {
            return $query
                ->when($from, fn (Builder $q) => $q->whereDate('created_at', '>=', $from))
                ->when($to, fn (Builder $q) => $q->whereDate('created_at', '<=', $to));
        }

        if ($from) {
            $query->where(fn (Builder $q) => $q
                ->whereDate('transaction_date', '>=', $from)
                ->orWhere(fn (Builder $legacy) => $legacy
                    ->whereNull('transaction_date')
                    ->whereDate('created_at', '>=', $from)));
        }

        if ($to) {
            $query->where(fn (Builder $q) => $q
                ->whereDate('transaction_date', '<=', $to)
                ->orWhere(fn (Builder $legacy) => $legacy
                    ->whereNull('transaction_date')
                    ->whereDate('created_at', '<=', $to)));
        }

        return $query;
    }

    public function scopeOrderByTransactionDate(Builder $query, string $direction = 'asc'): Builder
    {
        $direction = strtolower($direction) === 'asc' ? 'asc' : 'desc';

        if (! Schema::hasColumn('cash_movements', 'transaction_date')) {
            return $query->orderBy('created_at', $direction)->orderBy('id', $direction);
        }

        return $query
            ->orderByRaw("COALESCE(transaction_date, DATE(created_at)) {$direction}")
            ->orderBy('created_at', $direction)
            ->orderBy('id', $direction);
    }

    public function paymentMethodLabel(): ?string
    {
        return $this->payment_method
            ? (self::PAYMENT_METHOD_LABELS[$this->payment_method] ?? $this->payment_method)
            : null;
    }

    /** Effect on the box's balance. Amounts are always stored positive. */
    public function signedAmount(): float
    {
        return $this->direction === 'in' ? (float) $this->amount : -(float) $this->amount;
    }

    /** Public URL of the receipt photo, when one was attached. */
    public function receiptUrl(): ?string
    {
        return $this->receipt_path
            ? \Illuminate\Support\Facades\Storage::disk('public')->url($this->receipt_path)
            : null;
    }
}

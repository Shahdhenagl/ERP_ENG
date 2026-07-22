<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of the treasury ledger. Append-only by convention: a mistake is
 * corrected with an opposing movement, never by editing history.
 */
class CashMovement extends Model
{
    use HasFactory;

    protected $fillable = [
        'cash_box_id',
        'direction',
        'amount',
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
        'cost_center_id',
        'note',
        'user_id',
    ];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
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

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Effect on the box's balance. Amounts are always stored positive. */
    public function signedAmount(): float
    {
        return $this->direction === 'in' ? (float) $this->amount : -(float) $this->amount;
    }
}

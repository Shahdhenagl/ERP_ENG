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
        'counterpart_box_id',
        'category',
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

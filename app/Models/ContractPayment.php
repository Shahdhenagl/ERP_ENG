<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One instalment on a maintenance contract.
 *
 * The first falls due with activation; every later one is tied to a visit and
 * holds that visit's work order until it is collected. Collecting raises a real
 * invoice and receipt through the treasury and stamps them here.
 */
class ContractPayment extends Model
{
    use HasFactory;

    protected $fillable = [
        'contract_id', 'sequence', 'amount', 'due_visit_sequence',
        'status', 'invoice_id', 'payment_id', 'collected_at', 'collected_by', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'sequence' => 'integer',
            'due_visit_sequence' => 'integer',
            'collected_at' => 'datetime',
        ];
    }

    // ── Relations ────────────────────────────────────────────

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function collector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'collected_by');
    }

    // ── State ────────────────────────────────────────────────

    public function isCollected(): bool
    {
        return $this->status === 'collected';
    }

    /** The one taken with activation, before any visit. */
    public function isUpfront(): bool
    {
        return $this->due_visit_sequence === null;
    }

    public function statusLabel(): string
    {
        return $this->isCollected() ? 'محصّلة' : 'مستحقة';
    }
}

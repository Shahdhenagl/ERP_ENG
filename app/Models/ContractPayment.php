<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

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
        'contract_id', 'sequence', 'amount', 'service_year', 'period_number',
        'due_visit_sequence', 'service_from_visit_sequence', 'service_to_visit_sequence', 'due_on',
        'status', 'invoice_id', 'payment_id', 'collected_at', 'collected_by', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'sequence' => 'integer',
            'service_year' => 'integer',
            'period_number' => 'integer',
            'due_visit_sequence' => 'integer',
            'service_from_visit_sequence' => 'integer',
            'service_to_visit_sequence' => 'integer',
            'due_on' => 'date',
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

    public function installmentWorkflow(): HasOne
    {
        return $this->hasOne(InstallmentWorkflow::class);
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

    public function isArrears(): bool
    {
        return $this->contract?->isArrears() === true;
    }

    public function serviceLabel(): string
    {
        if ($this->service_from_visit_sequence && $this->service_to_visit_sequence) {
            return "بعد الزيارات {$this->service_from_visit_sequence}–{$this->service_to_visit_sequence}";
        }

        return $this->isArrears() ? 'بعد تنفيذ الخدمة' : 'مع اعتماد العقد';
    }

    public function statusLabel(): string
    {
        return $this->isCollected() ? 'محصّلة' : 'مستحقة';
    }
}

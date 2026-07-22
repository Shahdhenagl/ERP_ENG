<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A cheque held or written.
 *
 * It is a promise about money, not money. Nothing here touches the treasury or
 * an invoice until it clears — see the migration for why that separation is the
 * whole point of the document.
 */
class Cheque extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'direction', 'customer_id', 'supplier_id',
        'invoice_id', 'supplier_invoice_id',
        'cheque_number', 'bank_name', 'party_name',
        'issue_date', 'due_date', 'amount', 'status', 'cash_box_id',
        'payment_id', 'supplier_payment_id',
        'deposited_on', 'settled_on', 'bounce_reason', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'issue_date' => 'date',
            'due_date' => 'date',
            'deposited_on' => 'date',
            'settled_on' => 'date',
            'amount' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $cheque) {
            $cheque->code ??= static::nextCode();
            $cheque->issue_date ??= now()->toDateString();
            $cheque->status ??= 'held';
        });
    }

    /** Sequential per-year: CHQ-2026-0001. */
    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "CHQ-{$year}-%")->count();

        return sprintf('CHQ-%d-%04d', $year, $count + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function supplierInvoice(): BelongsTo
    {
        return $this->belongsTo(SupplierInvoice::class);
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

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── State ────────────────────────────────────────────────

    public function isIncoming(): bool
    {
        return $this->direction === 'incoming';
    }

    /** Still in play — neither settled nor torn up. */
    public function isOpen(): bool
    {
        return in_array($this->status, ['held', 'deposited'], true);
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'held' => $this->isIncoming() ? 'في الخزنة' : 'صادر',
            'deposited' => $this->isIncoming() ? 'أُودع بالبنك' : 'قُدِّم للبنك',
            'cleared' => 'تم التحصيل',
            'bounced' => 'مرتد',
            'cancelled' => 'ملغي',
            default => $this->status,
        };
    }

    public function directionLabel(): string
    {
        return $this->isIncoming() ? 'وارد' : 'صادر';
    }

    /**
     * Derived on read. A cheque whose date has passed and which has not been
     * banked is the one worth chasing, and nothing here runs on a timer to
     * flip a stored flag.
     */
    public function isDue(): bool
    {
        return $this->isOpen() && $this->due_date->startOfDay()->isPast();
    }

    public function daysToDue(): int
    {
        return (int) round(now()->startOfDay()->diffInDays($this->due_date->startOfDay(), false));
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeIncoming(Builder $query): Builder
    {
        return $query->where('direction', 'incoming');
    }

    public function scopeOutgoing(Builder $query): Builder
    {
        return $query->where('direction', 'outgoing');
    }

    /** Neither settled nor torn up — what the company still has to act on. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['held', 'deposited']);
    }

    public function scopeDueWithin(Builder $query, int $days): Builder
    {
        return $query->open()->whereDate('due_date', '<=', now()->addDays($days)->toDateString());
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('code', 'like', "%{$term}%")
                ->orWhere('cheque_number', 'like', "%{$term}%")
                ->orWhere('party_name', 'like', "%{$term}%")
                ->orWhere('bank_name', 'like', "%{$term}%");
        });
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A request to buy something, raised by whoever discovered the need.
 *
 * Deliberately separate from the purchase order: the person who asks and the
 * person who agrees are different people, and a document its own author can
 * approve records nothing a phone call did not.
 */
class PurchaseRequest extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'requested_by', 'task_id', 'warehouse_id', 'needed_by', 'reason',
        'status', 'priority', 'decided_by', 'decided_at', 'decision_note',
        'purchase_order_id',
    ];

    protected function casts(): array
    {
        return [
            'needed_by' => 'date',
            'decided_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $request) {
            $request->code ??= static::nextCode();
            $request->status ??= 'draft';
        });
    }

    /** Sequential per-year: RQ-2026-0001. */
    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "RQ-{$year}-%")->count();

        return sprintf('RQ-%d-%04d', $year, $count + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseRequestLine::class)->orderBy('sort')->orderBy('id');
    }

    // ── State ────────────────────────────────────────────────

    public function statusLabel(): string
    {
        return match ($this->status) {
            'draft' => 'مسودة',
            'submitted' => 'بانتظار الاعتماد',
            'approved' => 'معتمد',
            'rejected' => 'مرفوض',
            'ordered' => 'تم الشراء',
            default => $this->status,
        };
    }

    /** Still the requester's to edit. */
    public function isEditable(): bool
    {
        return $this->status === 'draft';
    }

    public function isPending(): bool
    {
        return $this->status === 'submitted';
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeAwaiting(Builder $query): Builder
    {
        return $query->where('status', 'submitted');
    }

    public function scopeRaisedBy(Builder $query, int $userId): Builder
    {
        return $query->where('requested_by', $userId);
    }
}

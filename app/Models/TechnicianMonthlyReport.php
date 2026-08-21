<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A technician's monthly report, and the fact that somebody took it.
 *
 * A month may contain more than one report from the same technician: each
 * handover is its own record so it can carry its own customer, branch and scan.
 */
class TechnicianMonthlyReport extends Model
{
    protected $fillable = [
        'technician_id',
        'period',
        'customer_id',
        'branch_id',
        'received_by_user_id',
        'received_on',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return ['received_on' => 'date'];
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /** Whoever took the paperwork. */
    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable')->latest('id');
    }

    public function scopeForPeriod(Builder $query, string $period): Builder
    {
        return $query->where('period', $period);
    }

    /** The month a report is being asked about, as the column stores it. */
    public static function periodFor(?string $raw = null): string
    {
        return $raw && preg_match('/^\d{4}-\d{2}$/', $raw)
            ? $raw
            : now()->format('Y-m');
    }
}

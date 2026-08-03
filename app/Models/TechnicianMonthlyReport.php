<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A technician's monthly report, and the fact that somebody took it.
 *
 * Deliberately inert: it posts nothing, settles nothing, and changes no
 * balance. The month it covers owes exactly what it owed before this row
 * existed. It is a record of a handover — who handed in, who received, on what
 * day, with whatever paperwork came attached.
 */
class TechnicianMonthlyReport extends Model
{
    protected $fillable = [
        'technician_id',
        'period',
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

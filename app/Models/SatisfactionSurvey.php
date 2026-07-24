<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A customer's rating of one closed job.
 *
 * Pending until answered; the score and the response rate that a report shows
 * are counted off these rows, never stored on the task.
 */
class SatisfactionSurvey extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id', 'customer_id', 'status', 'rating', 'comment',
        'sent_at', 'responded_at', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'rating' => 'integer',
            'sent_at' => 'datetime',
            'responded_at' => 'datetime',
        ];
    }

    // ── Relations ────────────────────────────────────────────

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending');
    }

    public function scopeResponded(Builder $query): Builder
    {
        return $query->where('status', 'responded');
    }

    public function statusLabel(): string
    {
        return $this->status === 'responded' ? 'تم التقييم' : 'بانتظار الرد';
    }
}

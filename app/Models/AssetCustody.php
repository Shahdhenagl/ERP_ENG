<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A device in someone's hands: taken from a customer for workshop repair, or
 * drawn from stock to be installed. Open until it is handed back.
 */
class AssetCustody extends Model
{
    use HasFactory;

    protected $fillable = [
        'asset_id', 'user_id', 'reason', 'taken_from', 'task_id',
        'taken_at', 'returned_at', 'returned_to', 'note', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'taken_at' => 'datetime',
            'returned_at' => 'datetime',
        ];
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function holder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function isOpen(): bool
    {
        return $this->returned_at === null;
    }

    /** How long it has been out — the number that turns into a question. */
    public function daysHeld(): int
    {
        return (int) $this->taken_at->diffInDays($this->returned_at ?? now());
    }

    public function reasonLabel(): string
    {
        return match ($this->reason) {
            'workshop_repair' => 'إصلاح بالورشة',
            'installation' => 'للتركيب',
            'inspection' => 'للفحص',
            default => 'أخرى',
        };
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('returned_at');
    }
}

<?php

namespace App\Models;

use App\Enums\ClaimStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class WarrantyClaim extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'warranty_id',
        'asset_id',
        'reported_on',
        'fault',
        'status',
        'decision_note',
        'task_id',
        'replacement_asset_id',
        'resolved_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => ClaimStatus::class,
            'reported_on' => 'date',
            'resolved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $claim) {
            $claim->code ??= static::nextCode();
            $claim->status ??= ClaimStatus::Open;
        });
    }

    /** Sequential per-year: CL-2026-0001. */
    public static function nextCode(): string
    {
        $year = now()->year;
        $count = static::withTrashed()->where('code', 'like', "CL-{$year}-%")->count();

        return sprintf('CL-%d-%04d', $year, $count + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class);
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    /** The repair order raised for this claim, if it got that far. */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function replacement(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'replacement_asset_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Derived state ────────────────────────────────────────

    /** How long it has been open, which is the number that embarrasses. */
    public function ageInDays(): int
    {
        $end = $this->resolved_at ?? now();

        return (int) round($this->reported_on->startOfDay()->diffInDays($end, false));
    }
}

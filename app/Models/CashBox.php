<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashBox extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'type', 'user_id', 'account_id', 'account_number', 'currency', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function movements(): HasMany
    {
        return $this->hasMany(CashMovement::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /**
     * This box's own line in the chart of accounts, opened the first time money
     * moves through it. Null until then, which is why nothing may assume it.
     */
    public function account(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    /**
     * Balance is the sum of the ledger, never a stored column. Keeping a
     * running total in a field is how a treasury quietly stops matching the
     * receipts that made it.
     */
    public function balance(): float
    {
        return $this->balanceAsOf(null);
    }

    /**
     * The balance at the end of a given day, or now when none is given.
     *
     * A statement for a period is meaningless without the figure it opened
     * with, and that figure is everything that happened before it.
     */
    public function balanceAsOf(?string $date): float
    {
        $movements = $this->movements();

        if ($date !== null) {
            $movements->whereDate('created_at', '<=', $date);
        }

        $rows = $movements->selectRaw('direction, coalesce(sum(amount), 0) as total')
            ->groupBy('direction')
            ->pluck('total', 'direction');

        return round((float) ($rows['in'] ?? 0) - (float) ($rows['out'] ?? 0), 2);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** The default box money lands in when nobody picked one. */
    public static function default(): self
    {
        // A technician's float is also a box, so the company till is the one
        // with nobody's name on it — not simply the first `cash` row.
        return static::firstOrCreate(
            ['type' => 'cash', 'user_id' => null],
            ['name' => 'الخزينة الرئيسية'],
        );
    }

    /** The technician this box belongs to; null for a company box. */
    public function holder(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function isCustody(): bool
    {
        return $this->user_id !== null;
    }
}

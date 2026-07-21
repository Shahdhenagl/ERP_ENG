<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashBox extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'type', 'user_id', 'account_number', 'currency', 'is_active'];

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
     * Balance is the sum of the ledger, never a stored column. Keeping a
     * running total in a field is how a treasury quietly stops matching the
     * receipts that made it.
     */
    public function balance(): float
    {
        $in = (float) $this->movements()->where('direction', 'in')->sum('amount');
        $out = (float) $this->movements()->where('direction', 'out')->sum('amount');

        return round($in - $out, 2);
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

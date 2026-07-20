<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashBox extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'type', 'account_number', 'currency', 'is_active'];

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
        return static::firstOrCreate(
            ['type' => 'cash'],
            ['name' => 'الخزينة الرئيسية'],
        );
    }
}

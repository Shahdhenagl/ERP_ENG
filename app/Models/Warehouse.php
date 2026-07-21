<?php

namespace App\Models;

use App\Enums\WarehouseType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Warehouse extends Model
{
    use HasFactory;

    protected $fillable = [
        'name', 'type', 'user_id', 'is_active', 'is_default', 'address', 'keeper',
    ];

    protected function casts(): array
    {
        return [
            'type' => WarehouseType::class,
            'is_active' => 'boolean',
            'is_default' => 'boolean',
        ];
    }

    // ── Relations ────────────────────────────────────────────

    /** The technician answerable for a van's contents. Null for the store. */
    public function holder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function levels(): HasMany
    {
        return $this->hasMany(StockLevel::class);
    }

    // ── Lookups ──────────────────────────────────────────────

    /**
     * The store operations fall back to — where goods are received and where
     * custody is drawn from.
     *
     * A company can have several stores now, so this is the one flagged
     * default rather than the only one. Created on first use, so a fresh
     * install has one without anyone having to remember to make it.
     */
    public static function main(): self
    {
        $default = static::where('type', WarehouseType::Store)
            ->where('is_default', true)
            ->first();

        if ($default) {
            return $default;
        }

        // No flag set: adopt the oldest store rather than opening a second one
        // beside it, which would split the balances.
        $existing = static::where('type', WarehouseType::Store)->orderBy('id')->first();

        if ($existing) {
            $existing->forceFill(['is_default' => true])->save();

            return $existing;
        }

        return static::create([
            'name' => 'المخزن الرئيسي',
            'type' => WarehouseType::Store,
            'is_default' => true,
        ]);
    }

    /** Make this the store operations fall back to; only one may hold the flag. */
    public function makeDefault(): void
    {
        static::where('is_default', true)->update(['is_default' => false]);

        $this->forceFill(['is_default' => true])->save();
    }

    /** A technician's custody, opened the first time anything is sent to them. */
    public static function forTechnician(User $technician): self
    {
        return static::firstOrCreate(
            ['user_id' => $technician->id],
            ['type' => WarehouseType::Van, 'name' => "عهدة {$technician->name}"],
        );
    }

    public function isVan(): bool
    {
        return $this->type === WarehouseType::Van;
    }
}

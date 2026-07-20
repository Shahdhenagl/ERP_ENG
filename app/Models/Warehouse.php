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

    protected $fillable = ['name', 'type', 'user_id', 'is_active'];

    protected function casts(): array
    {
        return [
            'type' => WarehouseType::class,
            'is_active' => 'boolean',
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
     * The company store. Created on first use rather than seeded, so a fresh
     * install has one without anyone having to remember to make it.
     */
    public static function main(): self
    {
        return static::firstOrCreate(
            ['type' => WarehouseType::Main],
            ['name' => 'المخزن الرئيسي'],
        );
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

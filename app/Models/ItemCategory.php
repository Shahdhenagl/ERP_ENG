<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A grouping of stock items, editable by whoever runs the store.
 *
 * `slug` is set only on the three that were once hard-coded, so anything still
 * filtering on `battery` keeps working. Categories added afterwards have none,
 * and need none.
 */
class ItemCategory extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'slug', 'colour', 'sort', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class);
    }

    /** Tailwind chip classes, keyed by the colour the operator picked. */
    public function chip(): string
    {
        return match ($this->colour) {
            'amber' => 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
            'blue' => 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
            'emerald' => 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
            'violet' => 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
            'red' => 'bg-red-50 text-red-700 ring-1 ring-red-200',
            default => 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
        };
    }

    /** Refused while anything still points at it — see the controller. */
    public function isInUse(): bool
    {
        return $this->items()->exists();
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}

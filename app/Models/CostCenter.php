<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Where a cost landed, as opposed to what it was.
 *
 * The account says «fuel»; the cost centre says which branch, contract or van
 * burnt it. Optional on every line — a company that does not care about the
 * question never has to answer it.
 */
class CostCenter extends Model
{
    use HasFactory;

    protected $fillable = ['code', 'name', 'is_active', 'notes'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::creating(fn (self $centre) => $centre->code ??= static::nextCode());
    }

    public static function nextCode(): string
    {
        return 'CC-'.str_pad((string) ((static::max('id') ?? 0) + 1), 3, '0', STR_PAD_LEFT);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class);
    }

    /** Net spend against this centre over a window. */
    public function total(?string $from = null, ?string $to = null): float
    {
        $row = Account::movementQuery($from, $to)
            ->where('journal_lines.cost_center_id', $this->id)
            ->selectRaw('coalesce(sum(debit), 0) as d, coalesce(sum(credit), 0) as c')
            ->first();

        return round((float) $row->d - (float) $row->c, 2);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}

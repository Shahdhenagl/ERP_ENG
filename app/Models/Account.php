<?php

namespace App\Models;

use App\Enums\AccountType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Validation\ValidationException;

/**
 * One line of the chart of accounts.
 *
 * Balances are never stored. An account's balance is the sum of the journal
 * lines that landed on it, the same way a cash box's balance is the sum of its
 * movements — a stored total is a number that can quietly stop agreeing with
 * the entries behind it, and then there is nothing to appeal to.
 */
class Account extends Model
{
    use HasFactory;

    protected $fillable = [
        'code', 'name', 'type', 'parent_id', 'is_group',
        'key', 'is_system', 'is_active', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'type' => AccountType::class,
            'is_group' => 'boolean',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    // ── Relations ────────────────────────────────────────────

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('code');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class);
    }

    // ── Lookup ───────────────────────────────────────────────

    /**
     * The account a posting rule means, by its machine key.
     *
     * Throws rather than returning null: a rule that cannot find its account
     * has no sensible fallback, and posting half an entry would be worse than
     * refusing the operation.
     */
    public static function key(string $key): self
    {
        $account = static::where('key', $key)->first();

        if (! $account) {
            throw ValidationException::withMessages([
                'accounting' => "الحساب «{$key}» غير موجود في دليل الحسابات. أعد تهيئة الدليل.",
            ]);
        }

        return $account;
    }

    // ── Balances ─────────────────────────────────────────────

    /**
     * Debits less credits over a window, signed so the figure reads the way the
     * account is meant to be read: a positive revenue balance is revenue
     * earned, not a negative asset.
     *
     * Voided entries are excluded everywhere, which is why this is the only
     * place that knows how to ask.
     */
    public function balance(?string $from = null, ?string $to = null): float
    {
        $sums = $this->movement($from, $to);

        return round(($sums['debit'] - $sums['credit']) * $this->type->sign(), 2);
    }

    /**
     * The raw two sides over a window, unsigned — what a trial balance prints.
     *
     * @return array{debit: float, credit: float}
     */
    public function movement(?string $from = null, ?string $to = null): array
    {
        $row = static::movementQuery($from, $to)
            ->where('journal_lines.account_id', $this->id)
            ->selectRaw('coalesce(sum(debit), 0) as d, coalesce(sum(credit), 0) as c')
            ->first();

        return ['debit' => round((float) $row->d, 2), 'credit' => round((float) $row->c, 2)];
    }

    /**
     * Journal lines that count, joined to the entry that dates them.
     *
     * Shared with the report service so «what counts» is decided once: posted,
     * not voided, inside the window.
     */
    public static function movementQuery(?string $from = null, ?string $to = null): Builder
    {
        return JournalLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->where('journal_entries.is_void', false)
            ->when($from, fn (Builder $q) => $q->whereDate('journal_entries.entry_date', '>=', $from))
            ->when($to, fn (Builder $q) => $q->whereDate('journal_entries.entry_date', '<=', $to));
    }

    // ── Scopes ───────────────────────────────────────────────

    /** Accounts an entry may actually land on. */
    public function scopePostable(Builder $query): Builder
    {
        return $query->where('is_group', false);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeOfType(Builder $query, AccountType|string $type): Builder
    {
        return $query->where('type', $type instanceof AccountType ? $type->value : $type);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(fn (Builder $q) => $q
            ->where('name', 'like', "%{$term}%")
            ->orWhere('code', 'like', "%{$term}%"));
    }
}

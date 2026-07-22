<?php

namespace App\Services;

use App\Models\Account;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that writes the journal.
 *
 * Two rules are enforced here and nowhere else, because an exception to either
 * one makes every report downstream a guess:
 *
 *  · an entry balances, or it is refused;
 *  · a document event posts once, however many times it is asked for.
 *
 * The second is what makes posting safe to call from anywhere — a retried
 * request, a re-run backfill and a double-clicked button all converge on the
 * same single entry rather than doubling the company's revenue.
 */
class Ledger
{
    /** A cent, which is as close as decimal money is ever asked to come. */
    protected const TOLERANCE = 0.005;

    /**
     * Write one balanced entry.
     *
     * `$lines` take an account as a model, an id, or a machine key — the rules
     * read better as `['account' => 'receivable']` than as a lookup on every
     * line.
     *
     * @param  array<int, array{account: Account|int|string, debit?: float, credit?: float, memo?: ?string, cost_center_id?: ?int}>  $lines
     * @param  array<string, mixed>  $attributes
     */
    public function post(array $lines, array $attributes = [], ?User $actor = null): JournalEntry
    {
        $resolved = $this->resolve($lines);

        $debit = round(array_sum(array_column($resolved, 'debit')), 2);
        $credit = round(array_sum(array_column($resolved, 'credit')), 2);

        if (count($resolved) < 2) {
            throw ValidationException::withMessages([
                'lines' => 'القيد يحتاج طرفين على الأقل.',
            ]);
        }

        if (abs($debit - $credit) > self::TOLERANCE) {
            throw ValidationException::withMessages([
                'lines' => 'القيد غير متوازن: مدين '.number_format($debit, 2)
                    .' مقابل دائن '.number_format($credit, 2).'.',
            ]);
        }

        if ($debit <= 0) {
            throw ValidationException::withMessages([
                'lines' => 'لا يمكن ترحيل قيد بقيمة صفر.',
            ]);
        }

        return DB::transaction(function () use ($resolved, $attributes, $actor, $debit) {
            $entry = JournalEntry::create([
                ...$attributes,
                'total' => $debit,
                'created_by' => $actor?->id ?? ($attributes['created_by'] ?? null),
            ]);

            foreach ($resolved as $sort => $line) {
                $entry->lines()->create([
                    'account_id' => $line['account_id'],
                    'cost_center_id' => $line['cost_center_id'],
                    'debit' => $line['debit'],
                    'credit' => $line['credit'],
                    'memo' => $line['memo'],
                    'sort' => $sort,
                ]);
            }

            // Loaded rather than re-fetched: callers distinguish an entry they
            // just wrote from one that was already there, and `fresh()` would
            // hand back a model that has forgotten it was ever new.
            return $entry->load('lines');
        });
    }

    /**
     * Post an entry for one moment of a document's life, at most once.
     *
     * The lines come from a closure so a rule that turns out to have nothing to
     * say — a transfer's second leg, a zero-value adjustment — costs nothing to
     * ask. Returning an empty array means «no entry belongs here», which is a
     * legitimate answer and not an error.
     *
     * @param  callable(): array<int, array<string, mixed>>  $lines
     * @param  array<string, mixed>  $attributes
     */
    public function postFor(
        Model $source,
        string $event,
        callable $lines,
        array $attributes = [],
        ?User $actor = null,
    ): ?JournalEntry {
        if ($existing = $this->entryFor($source, $event)) {
            return $existing;
        }

        $prepared = $lines();

        if (empty($prepared)) {
            return null;
        }

        try {
            return $this->post($prepared, [
                ...$attributes,
                'sourceable_type' => $source->getMorphClass(),
                'sourceable_id' => $source->getKey(),
                'event' => $event,
            ], $actor);
        } catch (QueryException $exception) {
            // Two requests raced past the check above. The unique index is the
            // thing that actually guarantees one entry; this just turns the
            // collision back into the answer the caller wanted.
            if (! $this->isDuplicate($exception)) {
                throw $exception;
            }

            return $this->entryFor($source, $event);
        }
    }

    /** The entry already written for this document event, if there is one. */
    public function entryFor(Model $source, string $event): ?JournalEntry
    {
        return JournalEntry::where('sourceable_type', $source->getMorphClass())
            ->where('sourceable_id', $source->getKey())
            ->where('event', $event)
            ->first();
    }

    /**
     * Undo an entry by writing its mirror image, never by deleting it.
     *
     * Both halves stay live and both count: something happened, and then it was
     * taken back, and the two net to nothing. Voiding the original instead
     * would reach back and change what a closed month reported, which is the
     * one thing a ledger exists to prevent.
     *
     * @param  string|null  $on  The date to book the reversal on; today by default.
     */
    public function reverse(
        JournalEntry $entry,
        ?string $memo = null,
        ?User $actor = null,
        ?string $on = null,
        array $attributes = [],
    ): JournalEntry {
        if ($entry->is_void) {
            throw ValidationException::withMessages([
                'entry' => "القيد {$entry->code} ملغى بالفعل.",
            ]);
        }

        if ($entry->relationLoaded('lines') === false) {
            $entry->load('lines');
        }

        return $this->post(
            $entry->lines->map(fn ($line) => [
                'account' => $line->account_id,
                // Swapped, which is the whole of what a reversal is.
                'debit' => (float) $line->credit,
                'credit' => (float) $line->debit,
                'cost_center_id' => $line->cost_center_id,
                'memo' => $line->memo,
            ])->all(),
            [
                'entry_date' => $on ?? now()->toDateString(),
                'source' => $entry->source,
                'memo' => $memo ?? "عكس القيد {$entry->code}",
                'reverses_id' => $entry->id,
                ...$attributes,
            ],
            $actor,
        );
    }

    /**
     * Strike out an entry that should never have existed.
     *
     * Reserved for hand-written entries corrected on the day: anything with a
     * document behind it is undone by {@see reverse()}, so the document and the
     * ledger keep telling the same story.
     */
    public function void(JournalEntry $entry): JournalEntry
    {
        if (! $entry->source->isManual()) {
            throw ValidationException::withMessages([
                'entry' => 'القيود الآلية تُعكَس ولا تُلغى — عدّل المستند نفسه.',
            ]);
        }

        $entry->forceFill(['is_void' => true])->save();

        return $entry->fresh();
    }

    // ── Internals ────────────────────────────────────────────

    /**
     * Turn loose line definitions into rows, dropping the empty ones.
     *
     * A rule that computes a zero tax line should not have to remember to leave
     * it out — a zero line adds nothing to an entry and clutters the statement
     * it appears on.
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @return array<int, array{account_id: int, debit: float, credit: float, memo: ?string, cost_center_id: ?int}>
     */
    protected function resolve(array $lines): array
    {
        $resolved = [];

        foreach ($lines as $line) {
            $debit = round((float) ($line['debit'] ?? 0), 2);
            $credit = round((float) ($line['credit'] ?? 0), 2);

            if ($debit <= 0 && $credit <= 0) {
                continue;
            }

            // A line that is both is an ambiguity, not a shortcut: the net is
            // what was meant, so say the net.
            if ($debit > 0 && $credit > 0) {
                throw ValidationException::withMessages([
                    'lines' => 'السطر لا يمكن أن يكون مدينًا ودائنًا في نفس الوقت.',
                ]);
            }

            $account = $this->account($line['account']);

            if ($account->is_group) {
                throw ValidationException::withMessages([
                    'lines' => "«{$account->name}» حساب تجميعي، لا يُرحَّل عليه مباشرة.",
                ]);
            }

            $resolved[] = [
                'account_id' => $account->id,
                'cost_center_id' => $line['cost_center_id'] ?? null,
                'debit' => $debit,
                'credit' => $credit,
                'memo' => $line['memo'] ?? null,
            ];
        }

        return $resolved;
    }

    protected function account(Account|int|string $account): Account
    {
        if ($account instanceof Account) {
            return $account;
        }

        if (is_int($account) || ctype_digit((string) $account)) {
            $found = Account::find((int) $account);

            if (! $found) {
                throw ValidationException::withMessages(['lines' => 'حساب غير موجود.']);
            }

            return $found;
        }

        return Account::key($account);
    }

    protected function isDuplicate(QueryException $exception): bool
    {
        return ($exception->errorInfo[1] ?? null) === 1062;
    }
}

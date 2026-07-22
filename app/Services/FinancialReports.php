<?php

namespace App\Services;

use App\Enums\AccountType;
use App\Models\Account;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * The four statements, all read from the journal and nothing else.
 *
 * Every figure here is a sum of journal lines. Nothing is cached, nothing is
 * stored, and no report reaches around the ledger to a document — a total that
 * can be produced two ways is a total that will eventually be produced two
 * different ways, and then neither one is evidence.
 */
class FinancialReports
{
    /**
     * One account's movements over a window, with the balance carried down.
     *
     * @return array<string, mixed>
     */
    public function ledger(Account $account, ?string $from = null, ?string $to = null): array
    {
        // Whatever came before the window is the line the page opens on.
        $opening = $from
            ? $account->balance(null, now()->parse($from)->subDay()->toDateString())
            : 0.0;

        // Oldest first, so the running balance reads the way a statement does.
        $lines = Account::movementQuery($from, $to)
            ->where('journal_lines.account_id', $account->id)
            ->with(['entry', 'costCenter'])
            ->orderBy('journal_entries.entry_date')
            ->orderBy('journal_entries.id')
            ->select('journal_lines.*')
            ->get();

        $balance = $opening;
        $sign = $account->type->sign();

        $rows = $lines->map(function (JournalLine $line) use (&$balance, $sign) {
            $balance = round($balance + $line->net() * $sign, 2);

            return [
                'id' => $line->id,
                'date' => $line->entry?->entry_date?->toDateString(),
                'code' => $line->entry?->code,
                'entry_id' => $line->journal_entry_id,
                'source' => $line->entry?->source?->value,
                'source_label' => $line->entry?->source?->label(),
                'memo' => $line->memo ?: $line->entry?->memo,
                'cost_center' => $line->costCenter?->name,
                'debit' => (float) $line->debit,
                'credit' => (float) $line->credit,
                'balance' => $balance,
            ];
        });

        return [
            'account' => $this->stub($account),
            'period' => ['from' => $from, 'to' => $to],
            'opening_balance' => $opening,
            'rows' => $rows,
            'debit_total' => round($rows->sum('debit'), 2),
            'credit_total' => round($rows->sum('credit'), 2),
            'closing_balance' => $balance,
        ];
    }

    /**
     * Every account that moved, both sides, plus the balance it ended on.
     *
     * The two totals at the foot must agree. When they do not, the ledger has
     * been written by something other than {@see Ledger} — so the difference is
     * reported rather than quietly rounded away.
     *
     * @return array<string, mixed>
     */
    public function trialBalance(?string $from = null, ?string $to = null): array
    {
        $movements = $this->sumByAccount($from, $to);
        // Closing balances need everything up to the end of the window, not
        // just what happened inside it.
        $cumulative = $this->sumByAccount(null, $to);

        $rows = Account::query()
            ->postable()
            ->orderBy('code')
            ->get()
            ->map(function (Account $account) use ($movements, $cumulative) {
                $period = $movements[$account->id] ?? ['debit' => 0.0, 'credit' => 0.0];
                $total = $cumulative[$account->id] ?? ['debit' => 0.0, 'credit' => 0.0];
                $balance = round($total['debit'] - $total['credit'], 2);

                return [
                    ...$this->stub($account),
                    'debit' => $period['debit'],
                    'credit' => $period['credit'],
                    // Split into the column it naturally falls in, which is how
                    // a trial balance is read on paper.
                    'balance_debit' => $balance > 0 ? $balance : 0.0,
                    'balance_credit' => $balance < 0 ? abs($balance) : 0.0,
                ];
            })
            // An account nobody has touched and that holds nothing is noise.
            ->filter(fn (array $row) => $row['debit'] > 0 || $row['credit'] > 0
                || $row['balance_debit'] > 0 || $row['balance_credit'] > 0)
            ->values();

        $debit = round($rows->sum('debit'), 2);
        $credit = round($rows->sum('credit'), 2);

        return [
            'period' => ['from' => $from, 'to' => $to],
            'rows' => $rows,
            'debit_total' => $debit,
            'credit_total' => $credit,
            'balance_debit_total' => round($rows->sum('balance_debit'), 2),
            'balance_credit_total' => round($rows->sum('balance_credit'), 2),
            'difference' => round($debit - $credit, 2),
        ];
    }

    /**
     * Revenue less cost of sales less expenses, over a period.
     *
     * Grouped under the headings of the chart itself rather than a fixed list,
     * so an operator who adds an expense account sees it appear here without
     * anyone touching this file.
     *
     * @return array<string, mixed>
     */
    public function incomeStatement(?string $from = null, ?string $to = null): array
    {
        $revenue = $this->section(AccountType::Revenue, $from, $to);
        $expense = $this->section(AccountType::Expense, $from, $to);

        // Cost of sales is separated out so gross profit is a real number and
        // not something the reader has to assemble.
        $cogs = $expense['groups']->filter(fn (array $group) => $group['key'] === '51');
        $operating = $expense['groups']->reject(fn (array $group) => $group['key'] === '51');

        $revenueTotal = $revenue['total'];
        $cogsTotal = round($cogs->sum('total'), 2);
        $operatingTotal = round($operating->sum('total'), 2);

        return [
            'period' => ['from' => $from, 'to' => $to],
            'revenue' => $revenue['groups']->values(),
            'revenue_total' => $revenueTotal,
            'cost_of_sales' => $cogs->values(),
            'cost_of_sales_total' => $cogsTotal,
            'gross_profit' => round($revenueTotal - $cogsTotal, 2),
            'expenses' => $operating->values(),
            'expenses_total' => $operatingTotal,
            'net_profit' => round($revenueTotal - $cogsTotal - $operatingTotal, 2),
        ];
    }

    /**
     * What the company owns and owes on a date.
     *
     * The period's profit is folded into equity as it is earned rather than by
     * a closing entry someone has to run. A year that has not been closed is
     * the normal state of a small company's books, and a balance sheet that
     * only balances after a ritual is a balance sheet nobody trusts.
     *
     * @return array<string, mixed>
     */
    public function balanceSheet(?string $asOf = null): array
    {
        $assets = $this->section(AccountType::Asset, null, $asOf);
        $liabilities = $this->section(AccountType::Liability, null, $asOf);
        $equity = $this->section(AccountType::Equity, null, $asOf);

        $income = $this->incomeStatement(null, $asOf);
        $earnings = $income['net_profit'];

        $assetsTotal = $assets['total'];
        $liabilitiesTotal = $liabilities['total'];
        $equityTotal = round($equity['total'] + $earnings, 2);

        return [
            'as_of' => $asOf,
            'assets' => $assets['groups']->values(),
            'assets_total' => $assetsTotal,
            'liabilities' => $liabilities['groups']->values(),
            'liabilities_total' => $liabilitiesTotal,
            'equity' => $equity['groups']->values(),
            // Named for what it is: profit earned and not yet moved anywhere.
            'retained_earnings' => $earnings,
            'equity_total' => $equityTotal,
            'liabilities_and_equity_total' => round($liabilitiesTotal + $equityTotal, 2),
            // Zero when the ledger is sound. Shown rather than hidden, because
            // a balance sheet that silently does not balance is worse than one
            // that says so.
            'difference' => round($assetsTotal - $liabilitiesTotal - $equityTotal, 2),
        ];
    }

    /**
     * Spend per cost centre over a window, with the accounts behind each.
     *
     * @return array<int, array<string, mixed>>
     */
    public function costCentres(?string $from = null, ?string $to = null): array
    {
        return \App\Models\CostCenter::query()
            ->orderBy('code')
            ->get()
            ->map(function ($centre) use ($from, $to) {
                $rows = Account::movementQuery($from, $to)
                    ->where('journal_lines.cost_center_id', $centre->id)
                    ->join('accounts', 'accounts.id', '=', 'journal_lines.account_id')
                    ->groupBy('accounts.id', 'accounts.code', 'accounts.name')
                    ->selectRaw('accounts.id, accounts.code, accounts.name,
                                 coalesce(sum(journal_lines.debit), 0) - coalesce(sum(journal_lines.credit), 0) as total')
                    ->orderByDesc('total')
                    ->get()
                    ->map(fn ($row) => [
                        'id' => (int) $row->id,
                        'code' => $row->code,
                        'name' => $row->name,
                        'total' => round((float) $row->total, 2),
                    ]);

                return [
                    'id' => $centre->id,
                    'code' => $centre->code,
                    'name' => $centre->name,
                    'is_active' => $centre->is_active,
                    'total' => round($rows->sum('total'), 2),
                    'accounts' => $rows->values(),
                ];
            })
            ->all();
    }

    /**
     * Documents that moved money but never reached the journal.
     *
     * Posting is deliberately forgiving — a failure is logged rather than
     * thrown, so operations never stop. That trade is only honest if the gap it
     * can leave is visible, which is what this is for.
     *
     * @return array<string, int>
     */
    public function unposted(): array
    {
        return [
            'invoices' => \App\Models\Invoice::query()
                ->where('status', 'issued')
                ->whereNotIn('id', $this->postedIds(\App\Models\Invoice::class, 'issued'))
                ->count(),
            'cash_movements' => \App\Models\CashMovement::query()
                ->whereNotIn('id', $this->postedIds(\App\Models\CashMovement::class, 'posted'))
                // A transfer's receiving leg is posted by its paying leg, and a
                // leg with no counterpart has nowhere to post — both are
                // expected to have no entry of their own.
                ->where(fn (Builder $q) => $q
                    ->whereNotIn('source', ['transfer', 'custody_advance', 'custody_settle'])
                    ->orWhere(fn (Builder $paired) => $paired
                        ->where('direction', 'out')
                        ->whereNotNull('counterpart_box_id')))
                ->count(),
            'stock_movements' => \App\Models\StockMovement::query()
                ->whereNotIn('id', $this->postedIds(\App\Models\StockMovement::class, 'posted'))
                ->whereNot('type', 'transfer')
                ->whereRaw('qty * unit_cost > 0.005')
                ->count(),
        ];
    }

    // ── Internals ────────────────────────────────────────────

    /**
     * One side of the chart, grouped under its top-level headings.
     *
     * @return array{groups: Collection<int, array<string, mixed>>, total: float}
     */
    protected function section(AccountType $type, ?string $from, ?string $to): array
    {
        $sums = $this->sumByAccount($from, $to);

        $accounts = Account::query()
            ->postable()
            ->ofType($type)
            ->with('parent.parent')
            ->orderBy('code')
            ->get()
            ->map(function (Account $account) use ($sums, $type) {
                $row = $sums[$account->id] ?? ['debit' => 0.0, 'credit' => 0.0];

                return [
                    ...$this->stub($account),
                    'total' => round(($row['debit'] - $row['credit']) * $type->sign(), 2),
                ];
            })
            ->filter(fn (array $row) => abs($row['total']) > 0.005);

        $groups = $accounts
            ->groupBy(fn (array $row) => $this->headingCode($row['code']))
            ->map(fn (Collection $rows, string $code) => [
                'key' => $code,
                'name' => Account::where('code', $code)->value('name') ?? $type->label(),
                'accounts' => $rows->values(),
                'total' => round($rows->sum('total'), 2),
            ])
            ->sortBy('key');

        return ['groups' => $groups, 'total' => round($accounts->sum('total'), 2)];
    }

    /**
     * The heading a code belongs under: '5201' → '52', '4101' → '41'.
     *
     * Two digits is the level the default chart puts its headings at, and a
     * code shorter than that is its own heading.
     */
    protected function headingCode(string $code): string
    {
        return strlen($code) <= 2 ? $code : substr($code, 0, 2);
    }

    /**
     * Both sides for every account that moved, in one query.
     *
     * @return array<int, array{debit: float, credit: float}>
     */
    protected function sumByAccount(?string $from, ?string $to): array
    {
        return Account::movementQuery($from, $to)
            ->groupBy('journal_lines.account_id')
            ->selectRaw('journal_lines.account_id,
                         coalesce(sum(journal_lines.debit), 0) as d,
                         coalesce(sum(journal_lines.credit), 0) as c')
            ->get()
            ->mapWithKeys(fn ($row) => [
                (int) $row->account_id => [
                    'debit' => round((float) $row->d, 2),
                    'credit' => round((float) $row->c, 2),
                ],
            ])
            ->all();
    }

    /** @return \Illuminate\Database\Query\Builder */
    protected function postedIds(string $class, string $event)
    {
        return JournalEntry::query()
            ->where('sourceable_type', (new $class)->getMorphClass())
            ->where('event', $event)
            ->select('sourceable_id')
            ->toBase();
    }

    /** @return array<string, mixed> */
    protected function stub(Account $account): array
    {
        return [
            'id' => $account->id,
            'code' => $account->code,
            'name' => $account->name,
            'type' => $account->type->value,
            'type_label' => $account->type->label(),
        ];
    }
}

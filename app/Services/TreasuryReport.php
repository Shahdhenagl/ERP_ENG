<?php

namespace App\Services;

use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\JournalEntry;
use Illuminate\Database\Eloquent\Builder;

/**
 * What came in, what went out, and what is left — over a period, for one box
 * or all of them.
 *
 * Read entirely from `cash_movements`, which is the only thing that writes the
 * treasury. A figure computed any other way could disagree with the ledger it
 * claims to summarise.
 */
class TreasuryReport
{
    /** Headings a movement's `source` maps to, shared with the movement feed. */
    public const LABELS = [
        'payment' => 'تحصيل من العملاء',
        'external_deposit' => 'إيداع خارجي',
        'custody_settle' => 'رد عهدة',
        'opening' => 'رصيد افتتاحي',
        'expense' => 'مصروفات',
        'supplier_payment' => 'سداد موردين',
        'custody_advance' => 'صرف عهد',
        'transfer' => 'تحويل بين الخزائن',
    ];

    /**
     * @param  array{from?: string|null, to?: string|null, cash_box_id?: int|null}  $filters
     * @return array<string, mixed>
     */
    public function forPeriod(array $filters = []): array
    {
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;
        $boxId = $filters['cash_box_id'] ?? null;

        $boxes = CashBox::query()
            ->when($boxId, fn ($q) => $q->whereKey($boxId))
            ->with('holder')
            ->get();

        // The day before the period starts is where the opening balance is.
        $opening = $from
            ? round($boxes->sum(fn (CashBox $box) => $box->balanceAsOf(
                now()->parse($from)->subDay()->toDateString(),
            )), 2)
            : 0.0;

        $income = $this->breakdown('in', $from, $to, $boxId);
        $expense = $this->breakdown('out', $from, $to, $boxId);

        $incomeTotal = round(array_sum(array_column($income, 'total')), 2);
        $expenseTotal = round(array_sum(array_column($expense, 'total')), 2);

        return [
            'period' => ['from' => $from, 'to' => $to],
            'opening_balance' => $opening,
            'income' => $income,
            'expense' => $expense,
            'income_total' => $incomeTotal,
            'expense_total' => $expenseTotal,
            'net' => round($incomeTotal - $expenseTotal, 2),
            // What the boxes actually hold now, which only equals opening + net
            // when the period runs to today.
            'closing_balance' => round($boxes->sum(fn (CashBox $box) => $box->balanceAsOf($to)), 2),
            'boxes' => $boxes->map(fn (CashBox $box) => [
                'id' => $box->id,
                'name' => $box->name,
                'type' => $box->isCustody() ? 'custody' : $box->type,
                'holder' => $box->holder?->name,
                'balance' => $box->balanceAsOf($to),
            ])->values(),
        ];
    }

    /**
     * One direction, grouped by what caused it.
     *
     * A transfer appears on both sides — it left one box and entered another —
     * which is correct per box but would inflate a company-wide total. The
     * caller sees it as its own line rather than buried in the totals.
     *
     * @return array<int, array{source: string, label: string, total: float, count: int}>
     */
    protected function breakdown(string $direction, ?string $from, ?string $to, ?int $boxId): array
    {
        return CashMovement::query()
            ->where('direction', $direction)
            ->when($boxId, fn (Builder $q) => $q->where('cash_box_id', $boxId))
            ->when($from, fn (Builder $q) => $q->whereDate('created_at', '>=', $from))
            ->when($to, fn (Builder $q) => $q->whereDate('created_at', '<=', $to))
            // A company-wide view nets transfers out entirely: money moving
            // between our own boxes is neither income nor expense.
            ->when(! $boxId, fn (Builder $q) => $q->where('source', '!=', 'transfer'))
            ->selectRaw('source, coalesce(sum(amount), 0) as total, count(*) as movements')
            ->groupBy('source')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'source' => $row->source,
                'label' => self::LABELS[$row->source] ?? $row->source,
                'total' => round((float) $row->total, 2),
                'count' => (int) $row->movements,
            ])
            ->all();
    }

    /**
     * One box's movements over a period, with the balance carried down.
     *
     * Ordered oldest first so the running balance reads the way a bank
     * statement does; the opening figure is what came before the window.
     *
     * @return array<string, mixed>
     */
    public function statement(CashBox $box, ?string $from = null, ?string $to = null): array
    {
        $opening = $from
            ? $box->balanceAsOf(now()->parse($from)->subDay()->toDateString())
            : 0.0;

        // The cash book remains the source for its running balance, while the
        // posted journal supplies the accounting counterpart. Keeping these two
        // views together makes any movement that was not posted immediately
        // visible instead of silently inventing an account for it.
        $box->loadMissing('account');

        $movements = $box->movements()
            ->when($from, fn ($q) => $q->whereDate('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('created_at', '<=', $to))
            ->with([
                'payment.customer',
                'supplierPayment.supplier',
                'responsible',
                'actor',
                'account',
                'counterpartBox.account',
            ])
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $entries = JournalEntry::query()
            ->where('sourceable_type', (new CashMovement)->getMorphClass())
            ->whereIn('sourceable_id', $movements->modelKeys())
            ->where('event', 'posted')
            ->with('lines.account')
            ->get()
            ->keyBy('sourceable_id');

        $balance = $opening;

        $rows = $movements->map(function (CashMovement $movement) use (&$balance, $box, $entries) {
            $balance = round($balance + $movement->signedAmount(), 2);
            $entry = $entries->get($movement->id);
            $accounting = $this->accountingDetails($movement, $entry, $box);

            return [
                'id' => $movement->id,
                'date' => $movement->created_at?->toDateString(),
                'direction' => $movement->direction,
                'source' => $movement->source,
                'label' => self::LABELS[$movement->source] ?? $movement->source,
                'voucher_type' => $this->voucherType($movement),
                'voucher_number' => $this->voucherNumber($movement),
                'journal_code' => $entry?->code,
                'category' => $movement->category,
                'note' => $movement->note,
                'description' => $this->description($movement),
                'party' => $this->party($movement),
                'customer' => $movement->payment?->customer?->name,
                'actor' => $movement->actor?->name,
                'account_name' => $accounting['name'],
                'account_type' => $accounting['type'],
                // Debit and credit are from the cash account's point of view:
                // a receipt increases cash on the debit side; a payment reduces
                // it on the credit side. `in`/`out` stay for older consumers.
                'debit' => $movement->direction === 'in' ? (float) $movement->amount : 0.0,
                'credit' => $movement->direction === 'out' ? (float) $movement->amount : 0.0,
                'in' => $movement->direction === 'in' ? (float) $movement->amount : 0.0,
                'out' => $movement->direction === 'out' ? (float) $movement->amount : 0.0,
                'balance' => $balance,
            ];
        });

        return [
            'box' => [
                'id' => $box->id,
                'name' => $box->name,
                'type' => $box->isCustody() ? 'custody' : $box->type,
                'holder' => $box->holder?->name,
            ],
            'period' => ['from' => $from, 'to' => $to],
            'opening_balance' => $opening,
            'rows' => $rows,
            'in_total' => round($rows->sum('in'), 2),
            'out_total' => round($rows->sum('out'), 2),
            'closing_balance' => $balance,
        ];
    }

    /** @return array{name: string|null, type: string|null} */
    protected function accountingDetails(CashMovement $movement, ?JournalEntry $entry, CashBox $box): array
    {
        // A transfer's journal is intentionally posted only on its outgoing
        // leg. The other box is nevertheless its exact accounting counterpart.
        $account = $movement->counterpartBox?->account;

        if (! $account && $entry) {
            $account = $entry->lines
                ->pluck('account')
                ->filter()
                ->first(fn ($lineAccount) => $lineAccount->id !== $box->account?->id);
        }

        // A manual expense names its expense account on the movement itself;
        // use it as a useful fallback while a legacy row awaits backfill.
        $account ??= $movement->account;

        return [
            'name' => $account?->name,
            'type' => $account?->type?->label(),
        ];
    }

    protected function voucherType(CashMovement $movement): string
    {
        return match ($movement->source) {
            'payment' => $movement->direction === 'in' ? 'سند قبض' : 'عكس سند قبض',
            'external_deposit' => 'سند قبض',
            'expense' => 'سند صرف',
            'supplier_payment' => 'سند صرف مورد',
            'transfer' => 'سند تحويل',
            'custody_advance' => 'سند صرف عهدة',
            'custody_settle' => 'سند رد عهدة',
            'opening' => 'قيد افتتاحي',
            'advance' => 'سند سلفة',
            'payroll' => 'سند رواتب',
            default => 'حركة خزينة',
        };
    }

    protected function voucherNumber(CashMovement $movement): string
    {
        if ($movement->payment?->code) {
            return $movement->payment->code;
        }

        if ($movement->supplierPayment?->code) {
            return $movement->supplierPayment->code;
        }

        $prefix = match ($movement->source) {
            'external_deposit' => 'RC',
            'expense' => 'PV',
            'transfer' => 'TR',
            'opening' => 'OP',
            'custody_advance', 'advance' => 'AV',
            'custody_settle' => 'CS',
            'payroll' => 'PR',
            default => 'CM',
        };

        return sprintf('%s-%05d', $prefix, $movement->id);
    }

    protected function description(CashMovement $movement): string
    {
        return $movement->note
            ?: $movement->category
            ?: (self::LABELS[$movement->source] ?? 'حركة خزينة');
    }

    protected function party(CashMovement $movement): ?string
    {
        return $movement->payment?->customer?->name
            ?? $movement->supplierPayment?->supplier?->name
            ?? $movement->responsible?->name
            ?? $movement->counterpartBox?->name
            ?? $movement->category;
    }
}

<?php

namespace App\Services;

use App\Models\CashBox;
use App\Models\CashMovement;
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

        $movements = $box->movements()
            ->when($from, fn ($q) => $q->whereDate('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('created_at', '<=', $to))
            ->with(['payment.customer', 'actor'])
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $balance = $opening;

        $rows = $movements->map(function (CashMovement $movement) use (&$balance) {
            $balance = round($balance + $movement->signedAmount(), 2);

            return [
                'id' => $movement->id,
                'date' => $movement->created_at?->toDateString(),
                'direction' => $movement->direction,
                'source' => $movement->source,
                'label' => self::LABELS[$movement->source] ?? $movement->source,
                'category' => $movement->category,
                'note' => $movement->note,
                'customer' => $movement->payment?->customer?->name,
                'actor' => $movement->actor?->name,
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
}

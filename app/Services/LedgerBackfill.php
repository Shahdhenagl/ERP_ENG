<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\StockMovement;
use App\Models\User;

/**
 * Re-derive the journal from the documents that caused it.
 *
 * Two jobs, and they are the same job: catching up the business that happened
 * before this module existed, and closing a gap left by a posting that was
 * logged and swallowed. Both are «walk the documents, post what has not been
 * posted», and posting is idempotent, so running it twice costs a few queries
 * and changes nothing.
 *
 * Order matters only for readability of the result — every rule is independent
 * of every other, because each one reads its own document and nothing else.
 */
class LedgerBackfill
{
    public function __construct(
        protected LedgerPoster $poster,
        protected ChartOfAccounts $chart,
    ) {}

    /**
     * @return array{invoices: int, cash_movements: int, stock_movements: int}
     */
    public function run(?User $actor = null): array
    {
        $this->chart->ensure();

        $counts = ['invoices' => 0, 'cash_movements' => 0, 'stock_movements' => 0];

        // Oldest first, and chunked: a company with years of history behind it
        // should not need the whole of it in memory to catch up.
        Invoice::query()
            ->whereIn('status', [InvoiceStatus::Issued, InvoiceStatus::Void])
            ->with('customer')
            ->orderBy('id')
            ->chunkById(200, function ($invoices) use (&$counts, $actor) {
                foreach ($invoices as $invoice) {
                    $wasVoided = $invoice->status === InvoiceStatus::Void;

                    // A voided invoice still needs the entry it was issued with
                    // before the reversal has anything to mirror.
                    $issued = $this->poster->invoice($invoice, $actor, force: $wasVoided);

                    if ($issued?->wasRecentlyCreated) {
                        $counts['invoices']++;
                    }

                    if ($wasVoided) {
                        $this->poster->invoiceVoided($invoice, $actor);
                    }
                }
            });

        CashMovement::query()
            ->with(['box.holder', 'counterpartBox.holder', 'payment.customer'])
            ->orderBy('id')
            ->chunkById(500, function ($movements) use (&$counts, $actor) {
                foreach ($movements as $movement) {
                    if ($this->poster->cashMovement($movement, $actor)?->wasRecentlyCreated) {
                        $counts['cash_movements']++;
                    }
                }
            });

        StockMovement::query()
            ->with('item')
            ->orderBy('id')
            ->chunkById(500, function ($movements) use (&$counts, $actor) {
                foreach ($movements as $movement) {
                    if ($this->poster->stockMovement($movement, $actor)?->wasRecentlyCreated) {
                        $counts['stock_movements']++;
                    }
                }
            });

        return $counts;
    }
}

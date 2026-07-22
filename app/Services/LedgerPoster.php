<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Enums\MovementType;
use App\Models\Account;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\StockMovement;
use App\Models\SupplierInvoice;
use App\Models\User;

/**
 * What each document means in double entry.
 *
 * Every rule here is a translation, never a decision: the invoice already knows
 * its total, the movement already knows its direction, and this only says which
 * two accounts that lands on. Nothing in this class may change a document, and
 * nothing outside it may write the journal for one.
 *
 * Called from observers, so posting is a consequence of the operation rather
 * than a step someone has to remember. A document that predates the ledger is
 * caught by the same methods through `accounting:post`.
 */
class LedgerPoster
{
    /** The chart is checked once per request, not once per posting. */
    protected bool $charted = false;

    public function __construct(
        protected Ledger $ledger,
        protected ChartOfAccounts $chart,
    ) {}

    /* ── Sales ───────────────────────────────────────────── */

    /**
     * An invoice the customer has seen.
     *
     *   Dr  العملاء            الإجمالي
     *   Dr  خصم مسموح به        الخصم
     *       Cr  الإيراد             قيمة البنود قبل الخصم
     *       Cr  ض.ق.م المستحقة      الضريبة
     *
     * The discount is a debit against revenue rather than a smaller credit, so
     * a period's gross sales and what was given away are both readable instead
     * of only their difference.
     *
     * `$force` is for the backfill: an invoice that was issued and later voided
     * still needs the entry it was issued with before the reversal has anything
     * to mirror, and by then its status no longer says so.
     */
    public function invoice(Invoice $invoice, ?User $actor = null, bool $force = false): ?JournalEntry
    {
        if (! $force && $invoice->status !== InvoiceStatus::Issued) {
            return null;
        }

        $this->ready();

        return $this->ledger->postFor($invoice, 'issued', function () use ($invoice) {
            $revenue = $invoice->task_id || $invoice->contract_id
                ? 'service_revenue'
                : 'sales_revenue';

            return [
                ['account' => 'receivable', 'debit' => (float) $invoice->total, 'memo' => $invoice->code],
                ['account' => 'sales_discount', 'debit' => (float) $invoice->discount],
                ['account' => $revenue, 'credit' => (float) $invoice->subtotal],
                ['account' => 'vat_output', 'credit' => (float) $invoice->tax_amount],
            ];
        }, [
            'entry_date' => $invoice->issue_date?->toDateString() ?? now()->toDateString(),
            'source' => 'invoice',
            'memo' => "فاتورة {$invoice->code} — ".($invoice->customer?->name ?? ''),
        ], $actor);
    }

    /**
     * A supplier's bill — but only the part of it the goods receipt did not
     * already record.
     *
     *   Dr  ض.ق.م على المشتريات    الضريبة
     *   Dr  فروق أسعار الشراء      الفرق عن سعر الاستلام
     *       Cr  الموردون               مجموع الاثنين
     *
     * Posting the bill in full would double every purchase: `stockMovement()`
     * credits the payable the moment stock arrives with a supplier on it. So a
     * bill matching its delivery exactly and carrying no tax posts nothing at
     * all, which is correct and is why `accrual()` exists.
     *
     * A bill with no delivery behind it — carriage, a service call — has no
     * receipt to have recorded anything, so its whole net value is an expense.
     */
    public function supplierInvoice(SupplierInvoice $invoice, ?User $actor = null): ?JournalEntry
    {
        if ($invoice->status !== 'posted') {
            return null;
        }

        $this->ready();

        return $this->ledger->postFor($invoice, 'posted', function () use ($invoice) {
            $covered = $invoice->coveredValue();
            $tax = round((float) $invoice->tax_amount, 2);
            $difference = round((float) $invoice->total - $tax - $covered, 2);

            if (abs($tax) < 0.005 && abs($difference) < 0.005) {
                return [];
            }

            // Goods behind it → the gap is a price variance. Nothing behind it
            // → the whole value is a cost the company has just taken on.
            $account = $covered > 0 ? 'purchase_variance' : 'general_expense';

            return [
                ['account' => 'vat_input', 'debit' => $tax, 'memo' => $invoice->code],
                $difference >= 0
                    ? ['account' => $account, 'debit' => $difference, 'memo' => $invoice->supplier_ref]
                    : ['account' => $account, 'credit' => abs($difference), 'memo' => $invoice->supplier_ref],
                ['account' => 'payable', 'credit' => round($tax + $difference, 2)],
            ];
        }, [
            'entry_date' => $invoice->invoice_date?->toDateString() ?? now()->toDateString(),
            'source' => 'supplier_invoice',
            'memo' => "فاتورة مورّد {$invoice->code} — ".($invoice->supplier?->name ?? ''),
        ], $actor);
    }

    /** A supplier bill torn up. Undone by its mirror, like a sales invoice. */
    public function supplierInvoiceVoided(SupplierInvoice $invoice, ?User $actor = null): ?JournalEntry
    {
        $posted = $this->ledger->entryFor($invoice, 'posted');

        if (! $posted || $this->ledger->entryFor($invoice, 'voided')) {
            return null;
        }

        return $this->ledger->reverse(
            $posted,
            "إلغاء فاتورة المورّد {$invoice->code}",
            $actor,
            attributes: [
                'sourceable_type' => $invoice->getMorphClass(),
                'sourceable_id' => $invoice->getKey(),
                'event' => 'voided',
            ],
        );
    }

    /**
     * An invoice withdrawn. The original entry stays where it was and is undone
     * by its mirror, dated today — voiding a June invoice in August must not
     * change what June reported.
     */
    public function invoiceVoided(Invoice $invoice, ?User $actor = null): ?JournalEntry
    {
        $issued = $this->ledger->entryFor($invoice, 'issued');

        if (! $issued || $this->ledger->entryFor($invoice, 'voided')) {
            return null;
        }

        return $this->ledger->reverse(
            $issued,
            "إلغاء الفاتورة {$invoice->code}",
            $actor,
            attributes: [
                'sourceable_type' => $invoice->getMorphClass(),
                'sourceable_id' => $invoice->getKey(),
                'event' => 'voided',
            ],
        );
    }

    /* ── Treasury ────────────────────────────────────────── */

    /**
     * One movement of money. The cash side is always the box's own account; the
     * other side is what the movement was for.
     *
     * A paired movement — a transfer, a float advanced or returned — exists
     * twice in the treasury ledger, once on each box. Only the outgoing leg is
     * posted, with the receiving box as its debit, so the journal holds one
     * entry for one event rather than two that cancel.
     */
    public function cashMovement(CashMovement $movement, ?User $actor = null): ?JournalEntry
    {
        $this->ready();

        return $this->ledger->postFor($movement, 'posted', function () use ($movement) {
            $box = $movement->box;

            if (! $box) {
                return [];
            }

            $cash = $this->chart->accountFor($box);
            $amount = (float) $movement->amount;
            $incoming = $movement->direction === 'in';

            $paired = in_array($movement->source, ['transfer', 'custody_advance', 'custody_settle'], true);

            if ($paired) {
                // The receiving leg says nothing the paying leg has not already
                // said. Money with no stated destination is left unposted
                // rather than guessed at.
                if ($incoming || ! $movement->counterpart_box_id) {
                    return [];
                }

                $counterpart = $movement->counterpartBox;

                if (! $counterpart) {
                    return [];
                }

                return [
                    ['account' => $this->chart->accountFor($counterpart), 'debit' => $amount],
                    ['account' => $cash, 'credit' => $amount],
                ];
            }

            $other = match ($movement->source) {
                'payment' => Account::key('receivable'),
                'supplier_payment' => Account::key('payable'),
                'opening' => Account::key('opening_equity'),
                default => $this->expenseAccount($movement),
            };

            $memo = $movement->note ?: $movement->category;

            // Money in debits the box and credits whatever it came from; money
            // out is the same sentence read backwards.
            return $incoming
                ? [
                    ['account' => $cash, 'debit' => $amount, 'memo' => $memo],
                    ['account' => $other, 'credit' => $amount, 'cost_center_id' => $movement->cost_center_id],
                ]
                : [
                    ['account' => $other, 'debit' => $amount, 'memo' => $memo, 'cost_center_id' => $movement->cost_center_id],
                    ['account' => $cash, 'credit' => $amount],
                ];
        }, [
            'entry_date' => $movement->created_at?->toDateString() ?? now()->toDateString(),
            'source' => $this->sourceFor($movement),
            'memo' => $this->memoFor($movement),
        ], $actor);
    }

    /* ── Stock ───────────────────────────────────────────── */

    /**
     * Stock is an asset, so moving it is a journal entry too.
     *
     *   وارد        Dr مخزون          Cr الموردون
     *   صرف لمهمة    Dr تكلفة المبيعات  Cr مخزون
     *   مرتجع       Dr مخزون          Cr تكلفة المبيعات
     *   تسوية جرد    الفرق ضد «عجز وزيادة المخزون»
     *
     * A transfer between a store and a van moves nothing in value terms and is
     * deliberately not posted — the company owns the same goods either way.
     */
    public function stockMovement(StockMovement $movement, ?User $actor = null): ?JournalEntry
    {
        $this->ready();

        return $this->ledger->postFor($movement, 'posted', function () use ($movement) {
            $value = round((float) $movement->qty * (float) $movement->unit_cost, 2);

            if ($value <= 0) {
                return [];
            }

            $memo = $movement->item?->name;

            return match ($movement->type) {
                // Goods with no supplier behind them were not bought; they
                // appeared, which is a stock gain and not a debt to anyone.
                MovementType::Receipt => [
                    ['account' => 'inventory', 'debit' => $value, 'memo' => $memo],
                    [
                        'account' => $movement->supplier_id ? 'payable' : 'stock_adjustment',
                        'credit' => $value,
                    ],
                ],

                MovementType::Issue => [
                    ['account' => 'cogs', 'debit' => $value, 'memo' => $memo],
                    ['account' => 'inventory', 'credit' => $value],
                ],

                MovementType::Return => [
                    ['account' => 'inventory', 'debit' => $value, 'memo' => $memo],
                    ['account' => 'cogs', 'credit' => $value],
                ],

                // Goods back to the supplier: the exact reverse of the receipt
                // that brought them in, so the debt falls by what they cost.
                MovementType::PurchaseReturn => [
                    ['account' => 'payable', 'debit' => $value, 'memo' => $memo],
                    ['account' => 'inventory', 'credit' => $value],
                ],

                // Direction is carried by which warehouse column is filled —
                // the same convention the stock ledger writes with.
                MovementType::Adjustment => $movement->to_warehouse_id
                    ? [
                        ['account' => 'inventory', 'debit' => $value, 'memo' => $memo],
                        ['account' => 'stock_adjustment', 'credit' => $value],
                    ]
                    : [
                        ['account' => 'stock_adjustment', 'debit' => $value, 'memo' => $memo],
                        ['account' => 'inventory', 'credit' => $value],
                    ],

                default => [],
            };
        }, [
            'entry_date' => $movement->created_at?->toDateString() ?? now()->toDateString(),
            'source' => 'stock',
            'memo' => $movement->type?->label().' — '.($movement->item?->name ?? ''),
        ], $actor);
    }

    // ── Internals ────────────────────────────────────────────

    /**
     * Which expense heading a payment out belongs under.
     *
     * Chosen explicitly when it was recorded. Failing that, matched against an
     * account of the same name — an operator who types «إيجارات» month after
     * month should find it landing on the rent account without being asked.
     * Failing that, the general heading, which is visible and easy to reclassify
     * rather than silently lost.
     */
    protected function expenseAccount(CashMovement $movement): Account
    {
        if ($movement->account_id && ($chosen = Account::find($movement->account_id))) {
            return $chosen;
        }

        if ($movement->category) {
            $matched = Account::query()
                ->postable()
                ->ofType('expense')
                ->where('name', $movement->category)
                ->first();

            if ($matched) {
                return $matched;
            }
        }

        return Account::key('general_expense');
    }

    /** The journal's own grouping for a treasury movement. */
    protected function sourceFor(CashMovement $movement): string
    {
        return match ($movement->source) {
            'payment' => 'payment',
            'supplier_payment' => 'supplier_payment',
            'transfer' => 'transfer',
            'custody_advance', 'custody_settle' => 'custody',
            'opening' => 'opening',
            default => 'expense',
        };
    }

    protected function memoFor(CashMovement $movement): string
    {
        $label = TreasuryReport::LABELS[$movement->source] ?? $movement->source;
        $detail = $movement->payment?->customer?->name
            ?? $movement->note
            ?? $movement->category;

        return trim($detail ? "{$label} — {$detail}" : $label);
    }

    protected function ready(): void
    {
        if (! $this->charted) {
            $this->chart->ensure();
            $this->charted = true;
        }
    }
}

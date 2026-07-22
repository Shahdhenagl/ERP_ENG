<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Item;
use App\Models\SalesReturn;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that writes sales returns.
 *
 * Three rules live here, and each one is the sort a screen would eventually
 * let through:
 *
 *  · a return is always against an issued invoice, and never for more than was
 *    sold on it — the one check that stops a credit note being a way to hand
 *    money back with no trace of what for;
 *  · the tax reversed is the tax that was charged, copied from the invoice, not
 *    today's rate;
 *  · a line is restocked or it is not. A sealed part goes back on the shelf at
 *    what it cost; a burnt-out unit taken back out of goodwill is worth nothing
 *    and must not quietly become inventory.
 */
class SalesReturnService
{
    public function __construct(protected StockLedger $stock) {}

    /**
     * Draft a credit note against an invoice.
     *
     * Nothing moves here. The stock stays where it is and the customer still
     * owes the full amount until this is posted, so a half-typed return cannot
     * forgive an invoice by being abandoned.
     *
     * @param  array<string, mixed>  $data
     */
    public function draft(array $data, ?User $actor = null): SalesReturn
    {
        $invoice = Invoice::with('lines')->findOrFail($data['invoice_id']);

        if ($invoice->status !== InvoiceStatus::Issued) {
            throw ValidationException::withMessages([
                'invoice_id' => 'لا يمكن عمل مرتجع إلا على فاتورة صادرة.',
            ]);
        }

        $warehouse = ! empty($data['warehouse_id'])
            ? Warehouse::findOrFail($data['warehouse_id'])
            : Warehouse::main();

        return DB::transaction(function () use ($data, $invoice, $warehouse, $actor) {
            $return = SalesReturn::create([
                'customer_id' => $invoice->customer_id,
                'invoice_id' => $invoice->id,
                'warehouse_id' => $warehouse->id,
                'return_date' => $data['return_date'] ?? now()->toDateString(),
                'reason' => $data['reason'],
                // The rate the sale carried, so what is given back matches what
                // was taken. A later change to the company's rate is irrelevant
                // to a sale that already happened.
                'tax_rate' => $invoice->tax_rate,
                'notes' => $data['notes'] ?? null,
                'created_by' => $actor?->id,
            ]);

            return $this->syncLines($return, $data['lines'] ?? []);
        });
    }

    /**
     * Replace the lines and recompute. Totals are never taken from the caller —
     * the same rule BillingService follows for invoices.
     *
     * @param  array<int, array<string, mixed>>  $lines
     */
    public function syncLines(SalesReturn $return, array $lines): SalesReturn
    {
        if ($return->isPosted()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن تعديل مرتجع مُرحّل.',
            ]);
        }

        $invoice = $return->invoice()->with('lines')->first();

        DB::transaction(function () use ($return, $invoice, $lines) {
            $return->lines()->delete();

            foreach (array_values($lines) as $sort => $line) {
                $invoiceLine = ! empty($line['invoice_line_id'])
                    ? $this->invoiceLineOn($invoice, (int) $line['invoice_line_id'])
                    : null;

                $qty = round((float) $line['qty'], 3);

                if ($qty <= 0) {
                    continue;
                }

                if ($invoiceLine) {
                    $this->assertWithinSold($return, $invoiceLine, $qty);
                }

                // Priced at what it was sold for, not at today's list price:
                // the customer is owed back what they actually paid.
                $price = round(
                    (float) ($line['unit_price'] ?? $invoiceLine?->unit_price ?? 0),
                    2,
                );

                $return->lines()->create([
                    'invoice_line_id' => $invoiceLine?->id,
                    'item_id' => $line['item_id'] ?? $invoiceLine?->item_id,
                    'description' => $line['description']
                        ?? $invoiceLine?->description
                        ?? '',
                    'qty' => $qty,
                    'unit_price' => $price,
                    'line_total' => round($qty * $price, 2),
                    // Only stock can be restocked. A labour line has nothing to
                    // put back, and marking it so would create a movement for
                    // an item that does not exist.
                    'restock' => (bool) ($line['restock'] ?? true)
                        && ($line['item_id'] ?? $invoiceLine?->item_id) !== null,
                    'sort' => $sort,
                ]);
            }

            $this->recalculate($return);
        });

        return $return->fresh(['lines']);
    }

    public function recalculate(SalesReturn $return): SalesReturn
    {
        $subtotal = round((float) $return->lines()->sum('line_total'), 2);
        $tax = round($subtotal * ((float) $return->tax_rate / 100), 2);

        $return->forceFill([
            'subtotal' => $subtotal,
            'tax_amount' => $tax,
            'total' => round($subtotal + $tax, 2),
        ])->save();

        return $return->fresh();
    }

    /**
     * Post it: the customer owes less, and whatever was worth keeping goes back
     * on the shelf — in one transaction, so the store and the receivable can
     * never disagree about whether the unit came back.
     */
    public function post(SalesReturn $return, User $actor): SalesReturn
    {
        if ($return->isPosted()) {
            throw ValidationException::withMessages([
                'status' => 'تم ترحيل هذا المرتجع بالفعل.',
            ]);
        }

        if ($return->lines()->count() === 0) {
            throw ValidationException::withMessages([
                'lines' => 'لا يمكن ترحيل مرتجع بدون بنود.',
            ]);
        }

        $invoice = $return->invoice;

        // Checked again at the moment it counts: two drafts raised side by side
        // could each look reasonable and together exceed the invoice.
        if ($return->total > $invoice->total - $invoice->creditedTotal() + 0.005) {
            throw ValidationException::withMessages([
                'total' => 'قيمة المرتجع تتجاوز المتبقي على الفاتورة.',
            ]);
        }

        return DB::transaction(function () use ($return, $actor) {
            $warehouse = $return->warehouse ?? Warehouse::main();

            foreach ($return->lines as $line) {
                if (! $line->restock || ! $line->item_id) {
                    continue;
                }

                $item = Item::findOrFail($line->item_id);
                $cost = $this->costOfSale($return, $line->item_id, (float) $item->avg_cost);

                // Frozen on the line, so a purchase next month cannot rewrite
                // what this return took out of cost of sales.
                $line->forceFill(['unit_cost' => $cost])->save();

                $this->stock->returnFromCustomer(
                    $item,
                    $warehouse,
                    (float) $line->qty,
                    $cost,
                    $actor,
                    ['sales_return_id' => $return->id, 'note' => $return->reason],
                );
            }

            $return->forceFill(['status' => 'posted'])->save();

            return $return->fresh(['lines', 'customer', 'invoice', 'warehouse']);
        });
    }

    /** Delete a draft. A posted return is history and stays. */
    public function discard(SalesReturn $return): void
    {
        if ($return->isPosted()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن حذف مرتجع مُرحّل — البضاعة رجعت بالفعل.',
            ]);
        }

        $return->delete();
    }

    /* ── Internals ───────────────────────────────────────── */

    /**
     * What this item cost when it left, taken from the issue movement on the
     * job the invoice was raised from.
     *
     * Falling back to today's average is honest rather than clever: an invoice
     * with no job behind it never consumed stock through the ledger, so there
     * is no historical cost to find.
     */
    protected function costOfSale(SalesReturn $return, int $itemId, float $fallback): float
    {
        $taskId = $return->invoice?->task_id;

        if (! $taskId) {
            return round($fallback, 2);
        }

        $issued = StockMovement::where('task_id', $taskId)
            ->where('item_id', $itemId)
            ->where('type', 'issue')
            ->orderByDesc('id')
            ->value('unit_cost');

        return round((float) ($issued ?? $fallback), 2);
    }

    protected function invoiceLineOn(?Invoice $invoice, int $lineId): InvoiceLine
    {
        $line = $invoice?->lines->firstWhere('id', $lineId);

        if (! $line) {
            throw ValidationException::withMessages([
                'lines' => 'أحد البنود لا يخص هذه الفاتورة.',
            ]);
        }

        return $line;
    }

    /**
     * Refuse to send back more than was sold, counting what earlier returns on
     * the same line already took.
     */
    protected function assertWithinSold(SalesReturn $return, InvoiceLine $line, float $qty): void
    {
        $alreadyReturned = (float) DB::table('sales_return_lines')
            ->join('sales_returns', 'sales_returns.id', '=', 'sales_return_lines.sales_return_id')
            ->where('sales_return_lines.invoice_line_id', $line->id)
            ->where('sales_returns.id', '!=', $return->id)
            ->whereNull('sales_returns.deleted_at')
            ->sum('sales_return_lines.qty');

        $remaining = round((float) $line->qty - $alreadyReturned, 3);

        if ($qty > $remaining + 0.0005) {
            throw ValidationException::withMessages([
                'lines' => "المتبقي القابل للإرجاع من «{$line->description}» هو {$remaining} فقط.",
            ]);
        }
    }
}

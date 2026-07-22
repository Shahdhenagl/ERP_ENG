<?php

namespace App\Services;

use App\Models\Item;
use App\Models\PurchaseReturn;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\Warehouse;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that writes supplier bills and purchase returns.
 *
 * The rule that shapes everything here: **a goods receipt has already put its
 * cost into payables.** LedgerPoster credits the payable account the moment
 * stock arrives with a supplier on it. A bill that credited it again would
 * double the company's debt on every single purchase — which is why a bill
 * covers receipts rather than replacing them, and why `accrual()` is the
 * number that reaches the ledger instead of `total`.
 *
 * A return is the same idea running backwards: the goods leave and the debt
 * drops by what they cost, in one transaction, so the store and the payable
 * can never disagree about whether the crate went back.
 */
class SupplierBilling
{
    public function __construct(protected StockLedger $stock) {}

    /* ── Bills ───────────────────────────────────────────── */

    /**
     * Recompute totals from the lines. Never trusted from the caller — the same
     * rule BillingService follows for customer invoices.
     */
    public function recalculate(SupplierInvoice $invoice): SupplierInvoice
    {
        $subtotal = round((float) $invoice->lines()->sum('line_total'), 2);
        $discount = min((float) $invoice->discount, $subtotal);
        $taxable = round($subtotal - $discount, 2);
        $tax = round($taxable * ((float) $invoice->tax_rate / 100), 2);

        $invoice->forceFill([
            'subtotal' => $subtotal,
            'tax_amount' => $tax,
            'total' => round($taxable + $tax, 2),
        ])->save();

        return $invoice->fresh(['lines']);
    }

    /**
     * Raise a bill, optionally against goods already received.
     *
     * Passing `receipt_ids` is the normal case: the storekeeper booked the
     * crate in last week, the invoice arrived today. The lines are built from
     * those receipts so the bill starts out matching what actually arrived,
     * and any difference the supplier has charged becomes visible instead of
     * being typed over.
     *
     * @param  array<string, mixed>  $data
     */
    public function draft(array $data, ?User $actor = null): SupplierInvoice
    {
        $supplier = Supplier::findOrFail($data['supplier_id']);
        $receipts = $this->claimableReceipts($supplier, $data['receipt_ids'] ?? []);

        return DB::transaction(function () use ($data, $supplier, $receipts, $actor) {
            $invoice = SupplierInvoice::create([
                'supplier_id' => $supplier->id,
                'supplier_ref' => $data['supplier_ref'] ?? null,
                'purchase_order_id' => $data['purchase_order_id'] ?? $receipts->first()?->purchase_order_id,
                'invoice_date' => $data['invoice_date'] ?? now()->toDateString(),
                'due_date' => $data['due_date'] ?? null,
                'discount' => $data['discount'] ?? 0,
                'tax_rate' => $data['tax_rate'] ?? 0,
                'notes' => $data['notes'] ?? null,
                'created_by' => $actor?->id,
            ]);

            $lines = $data['lines'] ?? $receipts->map(fn (StockMovement $receipt) => [
                'item_id' => $receipt->item_id,
                'description' => $receipt->item?->name ?? '',
                'qty' => (float) $receipt->qty,
                'unit_price' => (float) $receipt->unit_cost,
            ])->all();

            $this->syncLines($invoice, $lines);

            // Claiming the receipts here rather than on posting: two bills that
            // both listed the same delivery would each look reasonable on their
            // own, and the double count would only surface in the payable.
            if ($receipts->isNotEmpty()) {
                StockMovement::whereIn('id', $receipts->pluck('id'))
                    ->update(['supplier_invoice_id' => $invoice->id]);
            }

            return $this->recalculate($invoice);
        });
    }

    /** @param  array<int, array<string, mixed>>  $lines */
    public function syncLines(SupplierInvoice $invoice, array $lines): SupplierInvoice
    {
        if ($invoice->status !== 'draft') {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن تعديل بنود فاتورة مُرحّلة.',
            ]);
        }

        DB::transaction(function () use ($invoice, $lines) {
            $invoice->lines()->delete();

            foreach (array_values($lines) as $sort => $line) {
                $qty = round((float) ($line['qty'] ?? 1), 3);
                $price = round((float) ($line['unit_price'] ?? 0), 2);

                $invoice->lines()->create([
                    'item_id' => $line['item_id'] ?? null,
                    'description' => $line['description'] ?? '',
                    'qty' => $qty,
                    'unit_price' => $price,
                    'line_total' => round($qty * $price, 2),
                    'sort' => $sort,
                ]);
            }
        });

        return $this->recalculate($invoice);
    }

    /**
     * Post the bill. Past this it is a debt, and its lines are frozen.
     */
    public function post(SupplierInvoice $invoice): SupplierInvoice
    {
        if ($invoice->status !== 'draft') {
            throw ValidationException::withMessages([
                'status' => 'تم ترحيل هذه الفاتورة بالفعل.',
            ]);
        }

        if ($invoice->lines()->count() === 0) {
            throw ValidationException::withMessages([
                'lines' => 'لا يمكن ترحيل فاتورة بدون بنود.',
            ]);
        }

        $invoice->forceFill(['status' => 'posted'])->save();

        return $invoice->fresh(['lines', 'supplier']);
    }

    /**
     * Tear one up. The receipts it claimed are released so a corrected bill can
     * cover them — otherwise a typo would strand a delivery as uninvoiceable.
     */
    public function void(SupplierInvoice $invoice, string $reason): SupplierInvoice
    {
        if ($invoice->paidTotal() > 0) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إلغاء فاتورة سُدّد عليها. اعكس السداد أولًا.',
            ]);
        }

        if ($invoice->returns()->where('status', 'posted')->exists()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إلغاء فاتورة عليها مرتجع مُرحّل.',
            ]);
        }

        return DB::transaction(function () use ($invoice, $reason) {
            $invoice->receipts()->update(['supplier_invoice_id' => null]);
            $invoice->forceFill(['status' => 'void', 'void_reason' => $reason])->save();

            return $invoice->fresh(['lines', 'supplier']);
        });
    }

    /* ── Returns ─────────────────────────────────────────── */

    /**
     * Draft a return. Nothing leaves the store until it is posted, so a half
     * -typed return does not quietly empty a shelf.
     *
     * @param  array<string, mixed>  $data
     */
    public function draftReturn(array $data, ?User $actor = null): PurchaseReturn
    {
        $supplier = Supplier::findOrFail($data['supplier_id']);
        $warehouse = ! empty($data['warehouse_id'])
            ? Warehouse::findOrFail($data['warehouse_id'])
            : Warehouse::main();

        return DB::transaction(function () use ($data, $supplier, $warehouse, $actor) {
            $return = PurchaseReturn::create([
                'supplier_id' => $supplier->id,
                'supplier_invoice_id' => $data['supplier_invoice_id'] ?? null,
                'warehouse_id' => $warehouse->id,
                'return_date' => $data['return_date'] ?? now()->toDateString(),
                'reason' => $data['reason'],
                'notes' => $data['notes'] ?? null,
                'created_by' => $actor?->id,
            ]);

            return $this->syncReturnLines($return, $data['lines'] ?? []);
        });
    }

    /** @param  array<int, array<string, mixed>>  $lines */
    public function syncReturnLines(PurchaseReturn $return, array $lines): PurchaseReturn
    {
        if ($return->isPosted()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن تعديل مرتجع مُرحّل.',
            ]);
        }

        DB::transaction(function () use ($return, $lines) {
            $return->lines()->delete();

            foreach (array_values($lines) as $sort => $line) {
                $item = Item::findOrFail($line['item_id']);
                $qty = round((float) $line['qty'], 3);
                // Priced at what the stock is carried at unless the bill says
                // otherwise, so the debt drops by what the goods cost us.
                $cost = round((float) ($line['unit_cost'] ?? $item->avg_cost), 2);

                $return->lines()->create([
                    'item_id' => $item->id,
                    'qty' => $qty,
                    'unit_cost' => $cost,
                    'line_total' => round($qty * $cost, 2),
                    'sort' => $sort,
                ]);
            }

            $return->forceFill([
                'total' => round((float) $return->lines()->sum('line_total'), 2),
            ])->save();
        });

        return $return->fresh(['lines']);
    }

    /**
     * Send the goods back: stock out and the debt down, in one transaction.
     */
    public function postReturn(PurchaseReturn $return, User $actor): PurchaseReturn
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

        return DB::transaction(function () use ($return, $actor) {
            $warehouse = $return->warehouse;

            foreach ($return->lines as $line) {
                // The stock ledger refuses to go negative, so a return of more
                // than the shelf holds fails here rather than leaving the store
                // showing a quantity nobody can find.
                $this->stock->returnToSupplier(
                    $line->item,
                    $warehouse,
                    (float) $line->qty,
                    $actor,
                    [
                        'unit_cost' => (float) $line->unit_cost,
                        'supplier_id' => $return->supplier_id,
                        'purchase_return_id' => $return->id,
                        'supplier_invoice_id' => $return->supplier_invoice_id,
                        'note' => $return->reason,
                    ],
                );
            }

            $return->forceFill(['status' => 'posted'])->save();

            return $return->fresh(['lines', 'supplier', 'warehouse']);
        });
    }

    /* ── Statement ───────────────────────────────────────── */

    /**
     * One supplier's account, oldest first, with the balance carried down.
     *
     * Goods received appear as their own line rather than being folded into
     * the bill, because that is the order they happen in and because a delivery
     * with no invoice behind it is exactly what the clerk is looking for.
     *
     * @return array<string, mixed>
     */
    public function statement(Supplier $supplier, ?string $from = null, ?string $to = null): array
    {
        $rows = collect();

        $receipts = $supplier->receipts()
            ->whereIn('type', ['receipt', 'purchase_return'])
            ->when($from, fn ($q) => $q->whereDate('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('created_at', '<=', $to))
            ->with('item')
            ->get();

        foreach ($receipts as $movement) {
            $value = round((float) $movement->qty * (float) $movement->unit_cost, 2);
            $isReturn = $movement->type->value === 'purchase_return';

            $rows->push([
                'date' => $movement->created_at?->toDateString(),
                'type' => $isReturn ? 'return' : 'receipt',
                'type_label' => $isReturn ? 'مرتجع مشتريات' : 'استلام بضاعة',
                'code' => $movement->reference ?? '—',
                'note' => $movement->item?->name,
                // A receipt is a credit to us in the accounting sense — it
                // increases what we owe — so it sits in the same column a bill
                // would, and a return sits opposite it.
                'debit' => $isReturn ? $value : 0.0,
                'credit' => $isReturn ? 0.0 : $value,
            ]);
        }

        $invoices = $supplier->invoices()
            ->where('status', 'posted')
            ->when($from, fn ($q) => $q->whereDate('invoice_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('invoice_date', '<=', $to))
            ->get();

        foreach ($invoices as $invoice) {
            $accrual = $invoice->accrual();

            // A bill that matches its goods exactly adds nothing to the debt;
            // showing it as zero is honest and explains why the total did not
            // move when the invoice was entered.
            $rows->push([
                'date' => $invoice->invoice_date?->toDateString(),
                'type' => 'invoice',
                'type_label' => 'فاتورة مورّد',
                'code' => $invoice->code,
                'note' => $invoice->supplier_ref
                    ? "مرجع المورّد {$invoice->supplier_ref}"
                    : null,
                'debit' => $accrual < 0 ? abs($accrual) : 0.0,
                'credit' => $accrual > 0 ? $accrual : 0.0,
            ]);
        }

        $payments = $supplier->payments()
            ->when($from, fn ($q) => $q->whereDate('paid_at', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('paid_at', '<=', $to))
            ->with('invoice')
            ->get();

        foreach ($payments as $payment) {
            $rows->push([
                'date' => $payment->paid_at?->toDateString(),
                'type' => 'payment',
                'type_label' => 'سند صرف',
                'code' => $payment->code,
                'note' => $payment->invoice?->code ?? 'دفعة تحت الحساب',
                'debit' => (float) $payment->amount,
                'credit' => 0.0,
            ]);
        }

        $opening = $from ? $this->balanceAsOf($supplier, now()->parse($from)->subDay()->toDateString()) : 0.0;
        $balance = $opening;

        $ordered = $rows->sortBy([['date', 'asc'], ['type', 'asc']])->values()
            ->map(function (array $row) use (&$balance) {
                $balance = round($balance + $row['credit'] - $row['debit'], 2);

                return [...$row, 'balance' => $balance];
            });

        return [
            'supplier' => [
                'id' => $supplier->id,
                'code' => $supplier->code,
                'name' => $supplier->name,
                'company' => $supplier->company,
                'phone' => $supplier->phone,
                'tax_id' => $supplier->tax_id,
            ],
            'period' => ['from' => $from, 'to' => $to],
            'opening_balance' => $opening,
            'rows' => $ordered,
            'total_credit' => round($ordered->sum('credit'), 2),
            'total_debit' => round($ordered->sum('debit'), 2),
            'closing_balance' => $balance,
            'uninvoiced' => $supplier->uninvoicedTotal(),
        ];
    }

    /** What was owed at the end of a given day. */
    public function balanceAsOf(Supplier $supplier, string $date): float
    {
        $received = (float) $supplier->receipts()
            ->where('type', 'receipt')
            ->whereDate('created_at', '<=', $date)
            ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
            ->value('total');

        $returned = (float) $supplier->receipts()
            ->where('type', 'purchase_return')
            ->whereDate('created_at', '<=', $date)
            ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
            ->value('total');

        $extras = $supplier->invoices()
            ->where('status', 'posted')
            ->whereDate('invoice_date', '<=', $date)
            ->get()
            ->sum(fn (SupplierInvoice $invoice) => $invoice->accrual());

        $paid = (float) $supplier->payments()
            ->whereDate('paid_at', '<=', $date)
            ->sum('amount');

        return round($received + $extras - $returned - $paid, 2);
    }

    /* ── Internals ───────────────────────────────────────── */

    /**
     * Receipts that may still be billed: this supplier's, and not already
     * claimed by another bill.
     *
     * @param  array<int, int>  $ids
     * @return \Illuminate\Support\Collection<int, StockMovement>
     */
    protected function claimableReceipts(Supplier $supplier, array $ids)
    {
        if ($ids === []) {
            return collect();
        }

        $receipts = StockMovement::whereIn('id', $ids)
            ->where('type', 'receipt')
            ->with('item')
            ->get();

        foreach ($receipts as $receipt) {
            if ($receipt->supplier_id !== $supplier->id) {
                throw ValidationException::withMessages([
                    'receipt_ids' => 'أحد الاستلامات لا يخص هذا المورّد.',
                ]);
            }

            if ($receipt->supplier_invoice_id) {
                throw ValidationException::withMessages([
                    'receipt_ids' => 'أحد الاستلامات مفوتر بالفعل.',
                ]);
            }
        }

        if ($receipts->count() !== count(array_unique($ids))) {
            throw ValidationException::withMessages([
                'receipt_ids' => 'أحد الاستلامات غير موجود.',
            ]);
        }

        return $receipts;
    }
}

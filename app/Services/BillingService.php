<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Enums\MovementType;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Payment;
use App\Models\StockMovement;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\Terms;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that writes invoice totals, receipts and the cash ledger.
 *
 * Totals are recomputed from the lines rather than trusted from the client —
 * a total that can be posted independently of its lines is a total nobody can
 * defend. A receipt and its cash movement are written together in one
 * transaction, so a box's balance always equals the sum of its ledger.
 */
class BillingService
{
    public function __construct(protected StockLedger $stock) {}

    /** Recalculate an invoice from its lines. Called after any line change. */
    public function recalculate(Invoice $invoice): Invoice
    {
        $subtotal = round((float) $invoice->lines()->sum('line_total'), 2);
        // A percentage is a rate on the subtotal, so it follows the lines when
        // one is edited; a flat amount is the figure that was agreed. Either
        // way `discount` ends up as money, which is all anything downstream —
        // tax base, total, journal — has ever read.
        $discount = $invoice->discount_percent !== null
            ? round($subtotal * (float) $invoice->discount_percent / 100, 2)
            : (float) $invoice->discount;

        $discount = min($discount, $subtotal);
        $taxable = round($subtotal - $discount, 2);
        $tax = round($taxable * ((float) $invoice->tax_rate / 100), 2);

        $invoice->forceFill([
            'subtotal' => $subtotal,
            'discount' => $discount,
            'tax_amount' => $tax,
            'total' => round($taxable + $tax, 2),
        ])->save();

        return $invoice->fresh();
    }

    /**
     * Move a draft to issued. Past this point it is a document the customer has
     * seen, so it is corrected by a credit or a void — not by editing.
     */
    public function issue(Invoice $invoice): Invoice
    {
        if ($invoice->status !== InvoiceStatus::Draft) {
            throw ValidationException::withMessages([
                'status' => Terms::get('لا يمكن إصدار فاتورة غير مسودة.'),
            ]);
        }

        if ($invoice->lines()->count() === 0) {
            throw ValidationException::withMessages([
                'lines' => Terms::get('لا يمكن إصدار فاتورة بدون بنود.'),
            ]);
        }

        // The stock leaves with the document. Both in one transaction: an
        // invoice that issued while the shortage rolled back would be a sale of
        // goods the store never gave up.
        return DB::transaction(function () use ($invoice) {
            $this->recalculate($invoice);
            $this->issueStock($invoice);

            $invoice->forceFill([
                'status' => InvoiceStatus::Issued,
                // Snapshot the tax number as it stood when issued.
                'customer_tax_id' => $invoice->customer_tax_id,
            ])->save();

            return $invoice->fresh();
        });
    }

    /**
     * Draw the invoice's stocked lines out of its warehouse.
     *
     * Only lines that name an item move: a labour line or a free-text charge
     * was never on a shelf, and inventing a movement for it would be a lie.
     * Quantities are summed per item first — the same battery on two lines is
     * one draw on the balance, and checking them separately would let an
     * invoice pass that the shelf cannot actually cover.
     */
    protected function issueStock(Invoice $invoice): void
    {
        $lines = $invoice->lines()->whereNotNull('item_id')->get();

        if ($lines->isEmpty()) {
            return;
        }

        $warehouse = $invoice->warehouse ?: Warehouse::main();
        $actor = $this->stockActor($invoice);

        foreach ($lines->groupBy('item_id') as $itemId => $group) {
            $item = Item::find($itemId);

            if (! $item) {
                continue;
            }

            $this->stock->sell($item, $warehouse, (float) $group->sum('qty'), $actor, $invoice);
        }
    }

    /**
     * Who the movement is recorded against: the person doing it now if there is
     * one, else whoever raised the invoice. Both can be missing on a document
     * raised by a scheduled job, and an unattributed movement is better than
     * refusing to record that the goods left.
     */
    protected function stockActor(Invoice $invoice): ?User
    {
        return auth()->user() ?? $invoice->creator;
    }

    /**
     * Put back what this invoice took, net of anything already put back.
     *
     * Reads the invoice's own movements rather than its lines: a line can be
     * gone by now, and what has to be returned is what actually left.
     */
    protected function restoreStock(Invoice $invoice): void
    {
        $movements = $invoice->stockMovements()
            ->whereIn('type', [MovementType::Sale, MovementType::SaleVoid])
            ->get();

        if ($movements->isEmpty()) {
            return;
        }

        $actor = $this->stockActor($invoice);

        foreach ($movements->groupBy('item_id') as $itemId => $group) {
            $sold = (float) $group->where('type', MovementType::Sale)->sum('qty');
            $returned = (float) $group->where('type', MovementType::SaleVoid)->sum('qty');
            $outstanding = round($sold - $returned, 3);

            if ($outstanding <= 0) {
                continue;
            }

            $item = Item::find($itemId);

            if (! $item) {
                continue;
            }

            $sale = $group->firstWhere('type', MovementType::Sale);
            $warehouse = Warehouse::find($sale?->from_warehouse_id) ?: Warehouse::main();

            $this->stock->unsell($item, $warehouse, $outstanding, (float) $sale->unit_cost, $actor, $invoice);
        }
    }

    /**
     * Cancel an invoice. Refused once money has been taken against it: the
     * receipt would be left pointing at a document that no longer counts.
     */
    public function void(Invoice $invoice, string $reason): Invoice
    {
        if ($invoice->payments()->exists()) {
            throw ValidationException::withMessages([
                'status' => Terms::get('لا يمكن إلغاء فاتورة عليها تحصيل. ألغِ سندات القبض أولًا.'),
            ]);
        }

        return DB::transaction(function () use ($invoice, $reason) {
            // A cancelled sale never happened, so the goods are back on the
            // shelf. Only what this invoice actually took, and only once.
            $this->restoreStock($invoice);

            $invoice->forceFill([
                'status' => InvoiceStatus::Void,
                'void_reason' => $reason,
            ])->save();

            return $invoice->fresh();
        });
    }

    /**
     * Record money received. Writes the receipt and its cash movement together
     * so the treasury can never disagree with the receipts behind it.
     */
    public function receivePayment(array $data, User $actor): Payment
    {
        $amount = round((float) $data['amount'], 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount' => Terms::get('قيمة التحصيل يجب أن تكون أكبر من صفر.'),
            ]);
        }

        $invoice = ! empty($data['invoice_id']) ? Invoice::findOrFail($data['invoice_id']) : null;

        if ($invoice) {
            if (! $invoice->status->countsAsReceivable()) {
                throw ValidationException::withMessages([
                    'invoice_id' => Terms::get('لا يمكن التحصيل على فاتورة مسودة أو ملغاة.'),
                ]);
            }

            // Taking more than is owed hides a mistake inside a balance that
            // then reads as a credit nobody granted.
            if ($amount > $invoice->balance() + 0.005) {
                throw ValidationException::withMessages([
                    'amount' => Terms::get('المبلغ أكبر من المتبقي على الفاتورة (').number_format($invoice->balance(), 2).').',
                ]);
            }
        }

        // Falling back to the main box means a receipt is never lost because
        // nobody had set the treasury up yet.
        $box = ! empty($data['cash_box_id'])
            ? CashBox::findOrFail($data['cash_box_id'])
            : CashBox::default();

        return DB::transaction(function () use ($data, $amount, $invoice, $box, $actor) {
            $payment = Payment::create([
                'customer_id' => $invoice?->customer_id ?? $data['customer_id'],
                'invoice_id' => $invoice?->id,
                'cash_box_id' => $box->id,
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'paid_at' => $data['paid_at'] ?? now()->toDateString(),
                'reference' => $data['reference'] ?? null,
                'note' => $data['note'] ?? null,
                'user_id' => $actor->id,
                // Who took the money, when that is not who keyed it in.
                'collected_by_user_id' => $data['collected_by_user_id'] ?? null,
            ]);

            CashMovement::create([
                'cash_box_id' => $box->id,
                'direction' => 'in',
                'amount' => $amount,
                'source' => 'payment',
                'payment_id' => $payment->id,
                'note' => $payment->code,
                'user_id' => $actor->id,
            ]);

            return $payment;
        });
    }

    /** Reverse a receipt. The ledger keeps both lines; nothing is erased. */
    public function reversePayment(Payment $payment, User $actor): void
    {
        DB::transaction(function () use ($payment, $actor) {
            CashMovement::create([
                'cash_box_id' => $payment->cash_box_id,
                'direction' => 'out',
                'amount' => $payment->amount,
                'source' => 'payment',
                'payment_id' => $payment->id,
                'note' => "إلغاء سند القبض {$payment->code}",
                'user_id' => $actor->id,
            ]);

            $payment->delete();
        });
    }

    /** Money leaving a box — wages, fuel, a supplier paid in cash. */
    public function recordExpense(
        CashBox $box,
        float $amount,
        User $actor,
        array $context = [],
        bool $allowOverdraw = false,
    ): CashMovement {
        $amount = round($amount, 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => Terms::get('المبلغ يجب أن يكون أكبر من صفر.')]);
        }

        // A company box cannot spend what it does not hold. A technician's float
        // may: they front their own money on the road, and the box going
        // negative is exactly how the company learns it owes them the difference.
        if (! $allowOverdraw && $amount > $box->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => Terms::get('رصيد «').$box->name.'» لا يكفي ('.number_format($box->balance(), 2).').',
            ]);
        }

        return CashMovement::create([
            'cash_box_id' => $box->id,
            'task_id' => $context['task_id'] ?? null,
            'direction' => 'out',
            'amount' => $amount,
            'source' => 'expense',
            'category' => $context['category'] ?? null,
            'note' => $context['note'] ?? null,
            'receipt_path' => $context['receipt_path'] ?? null,
            // Who spent it, as against who typed it in — the manager recording
            // fuel for a technician is both, and only one of them is the answer
            // to "whose fuel was this".
            'responsible_user_id' => $context['responsible_user_id'] ?? null,
            'user_id' => $actor->id,
        ]);
    }

    /**
     * Money into a box from someone who is not a customer on the books — a
     * refund, a deposit from an outside party, the owner topping up the till.
     *
     * Recorded as its own receipt so it shows on the box and in income without
     * being mistaken for a customer paying down an invoice: there is no
     * receivable behind it, and `LedgerPoster` credits other income for it.
     * The party's name is the note, which is what the printed voucher reads.
     */
    public function recordExternalDeposit(
        CashBox $box,
        float $amount,
        User $actor,
        array $context = [],
    ): CashMovement {
        $amount = round($amount, 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => Terms::get('المبلغ يجب أن يكون أكبر من صفر.')]);
        }

        $party = trim((string) ($context['party'] ?? ''));

        if ($party === '') {
            throw ValidationException::withMessages(['party' => Terms::get('اكتب اسم الجهة المودِعة.')]);
        }

        $extra = trim((string) ($context['note'] ?? ''));

        return CashMovement::create([
            'cash_box_id' => $box->id,
            'direction' => 'in',
            'amount' => $amount,
            'source' => 'external_deposit',
            'category' => $party,
            'note' => $extra !== '' ? "{$party} — {$extra}" : $party,
            'receipt_path' => $context['receipt_path'] ?? null,
            'user_id' => $actor->id,
        ]);
    }

    /** Move money between boxes — cash banked, or drawn out. */
    public function transferBetweenBoxes(CashBox $from, CashBox $to, float $amount, User $actor, ?string $note = null): void
    {
        $amount = round($amount, 2);

        if ($from->id === $to->id) {
            throw ValidationException::withMessages(['to_box_id' => Terms::get('لا يمكن التحويل لنفس الخزينة.')]);
        }

        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => Terms::get('المبلغ يجب أن يكون أكبر من صفر.')]);
        }

        if ($amount > $from->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => Terms::get('رصيد «').$from->name.'» لا يكفي ('.number_format($from->balance(), 2).').',
            ]);
        }

        DB::transaction(function () use ($from, $to, $amount, $actor, $note) {
            CashMovement::create([
                'cash_box_id' => $from->id, 'direction' => 'out', 'amount' => $amount,
                'source' => 'transfer', 'counterpart_box_id' => $to->id,
                'note' => $note, 'user_id' => $actor->id,
            ]);

            CashMovement::create([
                'cash_box_id' => $to->id, 'direction' => 'in', 'amount' => $amount,
                'source' => 'transfer', 'counterpart_box_id' => $from->id,
                'note' => $note, 'user_id' => $actor->id,
            ]);
        });
    }

    /**
     * Draft an invoice for a finished job: the parts that came off the van,
     * priced, plus a labour line for the manager to fill in.
     *
     * Parts are billed at the average cost the stock ledger recorded, which is
     * a starting point rather than a selling price — margin is the operator's
     * decision, so the draft is left editable rather than guessed at.
     */
    public function draftFromTask(Task $task, User $actor, float $taxRate = 0): Invoice
    {
        if ($existing = Invoice::where('task_id', $task->id)->whereNot('status', InvoiceStatus::Void)->first()) {
            throw ValidationException::withMessages([
                'task_id' => "هذه المهمة لها فاتورة بالفعل ({$existing->code}).",
            ]);
        }

        return DB::transaction(function () use ($task, $actor, $taxRate) {
            $invoice = Invoice::create([
                'customer_id' => $task->customer_id,
                'task_id' => $task->id,
                'contract_id' => $task->contract_id ?? null,
                'issue_date' => now()->toDateString(),
                'due_date' => now()->addDays(15)->toDateString(),
                'tax_rate' => $taxRate,
                'notes' => "عن أمر الشغل {$task->code}",
                'created_by' => $actor->id,
            ]);

            $sort = 0;

            // Net of anything the technician handed back on a correction.
            $consumed = StockMovement::query()
                ->where('task_id', $task->id)
                ->whereIn('type', [MovementType::Issue, MovementType::Return])
                ->with('item')
                ->get()
                ->groupBy('item_id')
                ->map(fn ($rows) => [
                    'item' => $rows->first()->item,
                    'qty' => $rows->sum(fn ($m) => $m->type === MovementType::Issue ? (float) $m->qty : -(float) $m->qty),
                    'unit_cost' => (float) $rows->first()->unit_cost,
                ])
                ->filter(fn ($row) => $row['qty'] > 0);

            foreach ($consumed as $row) {
                $invoice->lines()->create([
                    'item_id' => $row['item']?->id,
                    'item_code' => $row['item']?->code,
                    'description' => $row['item']?->name ?? 'صنف',
                    'qty' => $row['qty'],
                    'unit_price' => $row['unit_cost'],
                    'line_total' => round($row['qty'] * $row['unit_cost'], 2),
                    'sort' => $sort++,
                ]);
            }

            // Always present, always zero: the visit is the thing being sold,
            // and leaving the line off invites forgetting to charge for it.
            $invoice->lines()->create([
                'description' => 'أجر زيارة وأعمال فنية',
                'qty' => 1,
                'unit_price' => 0,
                'line_total' => 0,
                'sort' => $sort,
            ]);

            return $this->recalculate($invoice);
        });
    }

    /** What a customer owes across every issued invoice, less anything on account. */
    public function customerBalance(int $customerId): float
    {
        $billed = (float) Invoice::where('customer_id', $customerId)->receivable()->sum('total');
        $collected = (float) Payment::where('customer_id', $customerId)->sum('amount');

        return round($billed - $collected, 2);
    }
}

<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Enums\MovementType;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\StockMovement;
use App\Models\Task;
use App\Models\User;
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
    /** Recalculate an invoice from its lines. Called after any line change. */
    public function recalculate(Invoice $invoice): Invoice
    {
        $subtotal = round((float) $invoice->lines()->sum('line_total'), 2);
        $discount = min((float) $invoice->discount, $subtotal);
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
                'status' => 'لا يمكن إصدار فاتورة غير مسودة.',
            ]);
        }

        if ($invoice->lines()->count() === 0) {
            throw ValidationException::withMessages([
                'lines' => 'لا يمكن إصدار فاتورة بدون بنود.',
            ]);
        }

        $this->recalculate($invoice);

        $invoice->forceFill([
            'status' => InvoiceStatus::Issued,
            // Snapshot the tax number as it stood when issued.
            'customer_tax_id' => $invoice->customer_tax_id,
        ])->save();

        return $invoice->fresh();
    }

    /**
     * Cancel an invoice. Refused once money has been taken against it: the
     * receipt would be left pointing at a document that no longer counts.
     */
    public function void(Invoice $invoice, string $reason): Invoice
    {
        if ($invoice->payments()->exists()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إلغاء فاتورة عليها تحصيل. ألغِ سندات القبض أولًا.',
            ]);
        }

        $invoice->forceFill([
            'status' => InvoiceStatus::Void,
            'void_reason' => $reason,
        ])->save();

        return $invoice->fresh();
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
                'amount' => 'قيمة التحصيل يجب أن تكون أكبر من صفر.',
            ]);
        }

        $invoice = ! empty($data['invoice_id']) ? Invoice::findOrFail($data['invoice_id']) : null;

        if ($invoice) {
            if (! $invoice->status->countsAsReceivable()) {
                throw ValidationException::withMessages([
                    'invoice_id' => 'لا يمكن التحصيل على فاتورة مسودة أو ملغاة.',
                ]);
            }

            // Taking more than is owed hides a mistake inside a balance that
            // then reads as a credit nobody granted.
            if ($amount > $invoice->balance() + 0.005) {
                throw ValidationException::withMessages([
                    'amount' => 'المبلغ أكبر من المتبقي على الفاتورة ('.number_format($invoice->balance(), 2).').',
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
    public function recordExpense(CashBox $box, float $amount, User $actor, array $context = []): CashMovement
    {
        $amount = round($amount, 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'المبلغ يجب أن يكون أكبر من صفر.']);
        }

        if ($amount > $box->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => 'رصيد «'.$box->name.'» لا يكفي ('.number_format($box->balance(), 2).').',
            ]);
        }

        return CashMovement::create([
            'cash_box_id' => $box->id,
            'direction' => 'out',
            'amount' => $amount,
            'source' => 'expense',
            'category' => $context['category'] ?? null,
            'note' => $context['note'] ?? null,
            'user_id' => $actor->id,
        ]);
    }

    /** Move money between boxes — cash banked, or drawn out. */
    public function transferBetweenBoxes(CashBox $from, CashBox $to, float $amount, User $actor, ?string $note = null): void
    {
        $amount = round($amount, 2);

        if ($from->id === $to->id) {
            throw ValidationException::withMessages(['to_box_id' => 'لا يمكن التحويل لنفس الخزينة.']);
        }

        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'المبلغ يجب أن يكون أكبر من صفر.']);
        }

        if ($amount > $from->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => 'رصيد «'.$from->name.'» لا يكفي ('.number_format($from->balance(), 2).').',
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

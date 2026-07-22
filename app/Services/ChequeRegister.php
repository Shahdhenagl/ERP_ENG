<?php

namespace App\Services;

use App\Models\CashBox;
use App\Models\Cheque;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that moves a cheque between its states.
 *
 * One rule shapes all of it: **a cheque is a promise, not money.** Holding one
 * changes nothing — not the treasury, not the invoice, not the books. Clearing
 * it is what produces a receipt or a payment voucher, and those existing paths
 * are what touch the money.
 *
 * The consequence people notice first is that an invoice settled by cheque
 * stays outstanding until the cheque clears. That is correct, and it is the
 * point: a company that counts uncleared cheques as collected plans against
 * money it does not have, and finds out when one bounces.
 */
class ChequeRegister
{
    public function __construct(
        protected BillingService $billing,
        protected PurchasingService $purchasing,
    ) {}

    /* ── Taking one in ───────────────────────────────────── */

    /**
     * A customer has handed over a cheque.
     *
     * @param  array<string, mixed>  $data
     */
    public function receive(array $data, User $actor): Cheque
    {
        $invoice = ! empty($data['invoice_id']) ? Invoice::findOrFail($data['invoice_id']) : null;

        if ($invoice && ! $invoice->status->countsAsReceivable()) {
            throw ValidationException::withMessages([
                'invoice_id' => 'لا يمكن استلام شيك على فاتورة مسودة أو ملغاة.',
            ]);
        }

        $customer = $invoice?->customer
            ?? (! empty($data['customer_id']) ? Customer::findOrFail($data['customer_id']) : null);

        if (! $customer) {
            throw ValidationException::withMessages([
                'customer_id' => 'الشيك الوارد يجب أن يكون من عميل.',
            ]);
        }

        $this->assertAmount($data['amount'] ?? 0);
        $this->assertUnusedNumber($data['cheque_number'], 'incoming');

        return Cheque::create([
            'direction' => 'incoming',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice?->id,
            'cheque_number' => trim($data['cheque_number']),
            'bank_name' => $data['bank_name'] ?? null,
            // Often not the customer's own name — a cheque from a third party
            // is common and the difference matters when one bounces.
            'party_name' => $data['party_name'] ?? $customer->name,
            'issue_date' => $data['issue_date'] ?? now()->toDateString(),
            'due_date' => $data['due_date'],
            'amount' => round((float) $data['amount'], 2),
            'notes' => $data['notes'] ?? null,
            'created_by' => $actor->id,
        ]);
    }

    /* ── Writing one ─────────────────────────────────────── */

    /**
     * We have written a cheque to a supplier.
     *
     * @param  array<string, mixed>  $data
     */
    public function issue(array $data, User $actor): Cheque
    {
        $bill = ! empty($data['supplier_invoice_id'])
            ? SupplierInvoice::findOrFail($data['supplier_invoice_id'])
            : null;

        $supplier = $bill?->supplier
            ?? (! empty($data['supplier_id']) ? Supplier::findOrFail($data['supplier_id']) : null);

        if (! $supplier) {
            throw ValidationException::withMessages([
                'supplier_id' => 'الشيك الصادر يجب أن يكون لمورّد.',
            ]);
        }

        $this->assertAmount($data['amount'] ?? 0);
        $this->assertUnusedNumber($data['cheque_number'], 'outgoing');

        return Cheque::create([
            'direction' => 'outgoing',
            'supplier_id' => $supplier->id,
            'supplier_invoice_id' => $bill?->id,
            // The account it is drawn on, which is what the balance has to
            // cover on the due date.
            'cash_box_id' => $data['cash_box_id'] ?? null,
            'cheque_number' => trim($data['cheque_number']),
            'bank_name' => $data['bank_name'] ?? null,
            'party_name' => $data['party_name'] ?? $supplier->name,
            'issue_date' => $data['issue_date'] ?? now()->toDateString(),
            'due_date' => $data['due_date'],
            'amount' => round((float) $data['amount'], 2),
            'notes' => $data['notes'] ?? null,
            'created_by' => $actor->id,
        ]);
    }

    /* ── Moving it along ─────────────────────────────────── */

    /** Sent to the bank. Still not money, but no longer in the drawer. */
    public function deposit(Cheque $cheque, CashBox $box, ?string $on = null): Cheque
    {
        if ($cheque->status !== 'held') {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إيداع إلا شيك في الخزنة.',
            ]);
        }

        $cheque->forceFill([
            'status' => 'deposited',
            'cash_box_id' => $box->id,
            'deposited_on' => $on ?? now()->toDateString(),
        ])->save();

        return $cheque->fresh(['box']);
    }

    /**
     * The money actually moved.
     *
     * This is the only place a cheque touches the treasury, and it does so
     * through the ordinary receipt and voucher paths — so the ledger, the
     * invoice and the supplier balance all move exactly as they would have if
     * the customer had handed over cash today.
     */
    public function clear(Cheque $cheque, User $actor, ?CashBox $box = null, ?string $on = null): Cheque
    {
        if (! $cheque->isOpen()) {
            throw ValidationException::withMessages([
                'status' => 'تم إقفال هذا الشيك بالفعل.',
            ]);
        }

        $target = $box ?? $cheque->box;

        if (! $target) {
            throw ValidationException::withMessages([
                'cash_box_id' => 'حدّد الحساب البنكي الذي تم التحصيل فيه.',
            ]);
        }

        return DB::transaction(function () use ($cheque, $target, $actor, $on) {
            $settledOn = $on ?? now()->toDateString();

            if ($cheque->isIncoming()) {
                $payment = $this->billing->receivePayment([
                    'invoice_id' => $cheque->invoice_id,
                    'customer_id' => $cheque->customer_id,
                    'cash_box_id' => $target->id,
                    'amount' => (float) $cheque->amount,
                    'method' => 'cheque',
                    'paid_at' => $settledOn,
                    'reference' => $cheque->cheque_number,
                    'note' => "تحصيل الشيك {$cheque->code}",
                ], $actor);

                $cheque->forceFill(['payment_id' => $payment->id]);
            } else {
                $voucher = $this->purchasing->paySupplier([
                    'supplier_id' => $cheque->supplier_id,
                    'supplier_invoice_id' => $cheque->supplier_invoice_id,
                    'cash_box_id' => $target->id,
                    'amount' => (float) $cheque->amount,
                    'method' => 'cheque',
                    'paid_at' => $settledOn,
                    'reference' => $cheque->cheque_number,
                    'note' => "صرف الشيك {$cheque->code}",
                ], $actor);

                $cheque->forceFill(['supplier_payment_id' => $voucher->id]);
            }

            $cheque->forceFill([
                'status' => 'cleared',
                'cash_box_id' => $target->id,
                'settled_on' => $settledOn,
            ])->save();

            return $cheque->fresh(['payment', 'supplierPayment', 'box']);
        });
    }

    /**
     * Returned unpaid.
     *
     * Nothing needs reversing, which is the reward for never having counted it:
     * the invoice was never marked paid and the cash was never raised. All that
     * is left is to record what happened and why.
     */
    public function bounce(Cheque $cheque, string $reason): Cheque
    {
        if (! $cheque->isOpen()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن ارتداد شيك تم إقفاله.',
            ]);
        }

        $cheque->forceFill([
            'status' => 'bounced',
            'bounce_reason' => $reason,
            'settled_on' => now()->toDateString(),
        ])->save();

        return $cheque->fresh();
    }

    public function cancel(Cheque $cheque, string $reason): Cheque
    {
        if (! $cheque->isOpen()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إلغاء شيك تم إقفاله.',
            ]);
        }

        $cheque->forceFill([
            'status' => 'cancelled',
            'bounce_reason' => $reason,
            'settled_on' => now()->toDateString(),
        ])->save();

        return $cheque->fresh();
    }

    /* ── What is coming ──────────────────────────────────── */

    /**
     * The two figures a cheque book is kept for: what is due to arrive, and
     * what has to be covered.
     *
     * @return array<string, mixed>
     */
    public function outlook(int $days = 30): array
    {
        $incoming = Cheque::query()->incoming()->open();
        $outgoing = Cheque::query()->outgoing()->open();

        return [
            'days' => $days,
            'incoming_total' => round((float) (clone $incoming)->sum('amount'), 2),
            'incoming_due' => round((float) (clone $incoming)->dueWithin($days)->sum('amount'), 2),
            'outgoing_total' => round((float) (clone $outgoing)->sum('amount'), 2),
            'outgoing_due' => round((float) (clone $outgoing)->dueWithin($days)->sum('amount'), 2),
            // Past their date and still not banked — the ones to chase today.
            'overdue_incoming' => (clone $incoming)
                ->whereDate('due_date', '<', now()->toDateString())->count(),
            'bounced_this_year' => Cheque::query()->incoming()
                ->where('status', 'bounced')
                ->whereYear('settled_on', now()->year)
                ->count(),
        ];
    }

    /* ── Internals ───────────────────────────────────────── */

    protected function assertAmount(mixed $amount): void
    {
        if (round((float) $amount, 2) <= 0) {
            throw ValidationException::withMessages([
                'amount' => 'قيمة الشيك يجب أن تكون أكبر من صفر.',
            ]);
        }
    }

    /**
     * A cheque number repeated in the same direction is nearly always the same
     * paper entered twice, and two records of one cheque is how it gets banked
     * twice.
     */
    protected function assertUnusedNumber(string $number, string $direction): void
    {
        $exists = Cheque::query()
            ->where('direction', $direction)
            ->where('cheque_number', trim($number))
            ->open()
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'cheque_number' => "الشيك رقم «{$number}» مسجّل بالفعل ولم يُقفل بعد.",
            ]);
        }
    }
}

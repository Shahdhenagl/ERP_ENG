<?php

namespace App\Http\Controllers\Api;

use App\Enums\InvoiceStatus;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StatementController extends Controller
{
    /**
     * A customer's account: every issued invoice and every receipt, in date
     * order, with the balance carried down the page.
     *
     * The two are merged and re-sorted rather than listed separately, because
     * the question this answers — "how did we get to what they owe" — only
     * makes sense read chronologically.
     */
    public function __invoke(Request $request, Customer $customer): JsonResponse
    {
        $from = $request->date('from');
        $to = $request->date('to');

        $invoices = Invoice::query()
            ->where('customer_id', $customer->id)
            ->where('status', InvoiceStatus::Issued->value)
            ->when($from, fn ($q) => $q->whereDate('issue_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('issue_date', '<=', $to))
            ->get()
            ->map(fn (Invoice $invoice) => [
                'date' => $invoice->issue_date?->toDateString(),
                'type' => 'invoice',
                'type_label' => 'فاتورة',
                'code' => $invoice->code,
                'note' => $invoice->notes,
                'debit' => (float) $invoice->total,
                'credit' => 0.0,
            ]);

        $payments = Payment::query()
            ->where('customer_id', $customer->id)
            ->when($from, fn ($q) => $q->whereDate('paid_at', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('paid_at', '<=', $to))
            ->with('invoice')
            ->get()
            ->map(fn (Payment $payment) => [
                'date' => $payment->paid_at?->toDateString(),
                'type' => 'payment',
                'type_label' => 'تحصيل',
                'code' => $payment->code,
                'note' => $payment->invoice?->code ?? 'دفعة تحت الحساب',
                'debit' => 0.0,
                'credit' => (float) $payment->amount,
            ]);

        // Sort by date, then invoices ahead of receipts on the same day — money
        // cannot be collected against an invoice that has not been raised yet,
        // so showing it the other way round reads as a negative balance.
        $rows = $invoices->concat($payments)
            ->sortBy([['date', 'asc'], ['type', 'asc']])
            ->values();

        $balance = 0.0;
        $rows = $rows->map(function (array $row) use (&$balance) {
            $balance = round($balance + $row['debit'] - $row['credit'], 2);

            return [...$row, 'balance' => $balance];
        });

        return response()->json([
            'data' => $rows,
            'meta' => [
                'customer' => [
                    'id' => $customer->id,
                    'code' => $customer->code,
                    'name' => $customer->name,
                    'company' => $customer->company,
                    'phone' => $customer->phone,
                    'address' => $customer->address,
                ],
                'from' => $from?->toDateString(),
                'to' => $to?->toDateString(),
                'total_invoiced' => round($rows->sum('debit'), 2),
                'total_collected' => round($rows->sum('credit'), 2),
                'balance' => $balance,
            ],
        ]);
    }
}

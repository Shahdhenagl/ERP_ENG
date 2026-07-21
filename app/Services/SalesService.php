<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Enums\QuotationStatus;
use App\Enums\SalesOrderStatus;
use App\Models\Invoice;
use App\Models\Quotation;
use App\Models\SalesOrder;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The commercial chain ahead of billing: quote → order → invoice.
 *
 * Each step copies its lines forward rather than pointing at the previous
 * document's. A quote is a historical record of what the customer was told; if
 * an order shared its lines, re-pricing later would rewrite that promise.
 *
 * Totals are recomputed from the lines at every step, never trusted from the
 * caller — the same rule BillingService follows for invoices.
 */
class SalesService
{
    public function __construct(protected BillingService $billing) {}

    /* ── Quotations ──────────────────────────────────────── */

    public function recalculateQuotation(Quotation $quotation): Quotation
    {
        $subtotal = round((float) $quotation->lines()->sum('line_total'), 2);
        $discount = min((float) $quotation->discount, $subtotal);
        $taxable = round($subtotal - $discount, 2);
        $tax = round($taxable * ((float) $quotation->tax_rate / 100), 2);

        $quotation->forceFill([
            'subtotal' => $subtotal,
            'discount' => $discount,
            'tax_amount' => $tax,
            'total' => round($taxable + $tax, 2),
        ])->save();

        return $quotation->fresh();
    }

    /** Hand the quote to the customer. Past this the price is a promise. */
    public function send(Quotation $quotation): Quotation
    {
        if ($quotation->status !== QuotationStatus::Draft) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إرسال عرض سعر غير مسودة.',
            ]);
        }

        if ($quotation->lines()->count() === 0) {
            throw ValidationException::withMessages([
                'lines' => 'لا يمكن إرسال عرض سعر بدون بنود.',
            ]);
        }

        $this->recalculateQuotation($quotation);

        $quotation->forceFill([
            'status' => QuotationStatus::Sent,
            'sent_at' => now(),
        ])->save();

        return $quotation->fresh();
    }

    /**
     * The customer said no. Kept as a record rather than deleted — knowing what
     * was turned down, and why, is the point of quoting at all.
     */
    public function reject(Quotation $quotation, ?string $reason = null): Quotation
    {
        if ($quotation->status !== QuotationStatus::Sent) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن رفض عرض لم يُرسَل بعد.',
            ]);
        }

        $quotation->forceFill([
            'status' => QuotationStatus::Rejected,
            'reject_reason' => $reason,
            'decided_at' => now(),
        ])->save();

        return $quotation->fresh();
    }

    public function cancel(Quotation $quotation, string $reason): Quotation
    {
        if ($quotation->salesOrder()->exists()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إلغاء عرض تحوّل إلى أمر بيع.',
            ]);
        }

        $quotation->forceFill([
            'status' => QuotationStatus::Cancelled,
            'reject_reason' => $reason,
            'decided_at' => now(),
        ])->save();

        return $quotation->fresh();
    }

    /**
     * The customer accepted: the quote becomes an order.
     *
     * A lapsed quote is refused rather than quietly honoured — the price was
     * only promised until its validity date, and re-sending it is a decision
     * somebody should make on purpose.
     */
    public function acceptToOrder(Quotation $quotation, User $actor): SalesOrder
    {
        if ($quotation->status !== QuotationStatus::Sent) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن قبول عرض لم يُرسَل بعد.',
            ]);
        }

        if ($quotation->hasLapsed()) {
            throw ValidationException::withMessages([
                'status' => 'انتهت صلاحية هذا العرض. أصدر عرضًا جديدًا بدلًا منه.',
            ]);
        }

        if ($existing = $quotation->salesOrder) {
            throw ValidationException::withMessages([
                'status' => "هذا العرض تحوّل بالفعل إلى أمر البيع {$existing->code}.",
            ]);
        }

        return DB::transaction(function () use ($quotation, $actor) {
            $order = SalesOrder::create([
                'customer_id' => $quotation->customer_id,
                'quotation_id' => $quotation->id,
                'order_date' => now()->toDateString(),
                'discount' => $quotation->discount,
                'tax_rate' => $quotation->tax_rate,
                'currency' => $quotation->currency,
                'notes' => $quotation->notes,
                'created_by' => $actor->id,
            ]);

            foreach ($quotation->lines as $line) {
                $order->lines()->create([
                    'item_id' => $line->item_id,
                    'item_code' => $line->item_code,
                    'description' => $line->description,
                    'qty' => $line->qty,
                    'unit_price' => $line->unit_price,
                    'line_total' => $line->line_total,
                    'sort' => $line->sort,
                ]);
            }

            $quotation->forceFill([
                'status' => QuotationStatus::Accepted,
                'decided_at' => now(),
            ])->save();

            return $this->recalculateOrder($order);
        });
    }

    /* ── Sales orders ────────────────────────────────────── */

    public function recalculateOrder(SalesOrder $order): SalesOrder
    {
        $subtotal = round((float) $order->lines()->sum('line_total'), 2);
        $discount = min((float) $order->discount, $subtotal);
        $taxable = round($subtotal - $discount, 2);
        $tax = round($taxable * ((float) $order->tax_rate / 100), 2);

        $order->forceFill([
            'subtotal' => $subtotal,
            'discount' => $discount,
            'tax_amount' => $tax,
            'total' => round($taxable + $tax, 2),
        ])->save();

        return $order->fresh();
    }

    /** Cancel an order. Refused once anything has been billed against it. */
    public function cancelOrder(SalesOrder $order, string $reason): SalesOrder
    {
        if ($order->invoices()->whereNot('status', InvoiceStatus::Void)->exists()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إلغاء أمر بيع صدرت عنه فاتورة. ألغِ الفاتورة أولًا.',
            ]);
        }

        $order->forceFill([
            'status' => SalesOrderStatus::Cancelled,
            'cancel_reason' => $reason,
        ])->save();

        return $order->fresh();
    }

    public function markDelivered(SalesOrder $order): SalesOrder
    {
        if ($order->status !== SalesOrderStatus::Open) {
            throw ValidationException::withMessages([
                'status' => 'أمر البيع ليس قيد التنفيذ.',
            ]);
        }

        $order->forceFill(['status' => SalesOrderStatus::Delivered])->save();

        return $order->fresh();
    }

    /**
     * Draft an invoice for the order. Left as a draft on purpose: issuing is a
     * separate decision, and the operator may still want to stage the billing.
     */
    public function invoiceOrder(SalesOrder $order, User $actor): Invoice
    {
        if ($order->status === SalesOrderStatus::Cancelled) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن فوترة أمر بيع ملغي.',
            ]);
        }

        if ($order->lines()->count() === 0) {
            throw ValidationException::withMessages([
                'lines' => 'لا يمكن فوترة أمر بيع بدون بنود.',
            ]);
        }

        // Billing the same order twice is nearly always a mistake; a genuine
        // second invoice can be raised by hand against the customer.
        if ($order->invoices()->whereNot('status', InvoiceStatus::Void)->exists()) {
            throw ValidationException::withMessages([
                'status' => 'صدرت فاتورة لهذا الأمر بالفعل.',
            ]);
        }

        return DB::transaction(function () use ($order, $actor) {
            $invoice = Invoice::create([
                'customer_id' => $order->customer_id,
                'sales_order_id' => $order->id,
                'issue_date' => now()->toDateString(),
                'due_date' => now()->addDays(15)->toDateString(),
                'discount' => $order->discount,
                'tax_rate' => $order->tax_rate,
                'currency' => $order->currency,
                'notes' => "عن أمر البيع {$order->code}",
                'created_by' => $actor->id,
            ]);

            foreach ($order->lines as $line) {
                $invoice->lines()->create([
                    'item_id' => $line->item_id,
                    'item_code' => $line->item_code,
                    'description' => $line->description,
                    'qty' => $line->qty,
                    'unit_price' => $line->unit_price,
                    'line_total' => $line->line_total,
                    'sort' => $line->sort,
                ]);
            }

            return $this->billing->recalculate($invoice);
        });
    }
}

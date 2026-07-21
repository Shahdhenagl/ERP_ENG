<?php

use App\Enums\InvoiceStatus;
use App\Enums\QuotationStatus;
use App\Enums\SalesOrderStatus;
use App\Models\CashBox;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Quotation;
use App\Models\User;
use App\Services\BillingService;
use App\Services\SalesService;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->sales = app(SalesService::class);
    $this->billing = app(BillingService::class);
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
});

function quote(array $lines = [['qty' => 2, 'price' => 5000]], float $taxRate = 0, ?string $validUntil = null): Quotation
{
    $quotation = Quotation::create([
        'customer_id' => test()->customer->id,
        'title' => 'توريد وتركيب جهاز UPS',
        'tax_rate' => $taxRate,
        'valid_until' => $validUntil ?? now()->addDays(14)->toDateString(),
        'created_by' => test()->manager->id,
    ]);

    foreach ($lines as $sort => $line) {
        $quotation->lines()->create([
            'item_id' => $line['item_id'] ?? null,
            'description' => $line['description'] ?? 'بند',
            'qty' => $line['qty'],
            'unit_price' => $line['price'],
            'line_total' => round($line['qty'] * $line['price'], 2),
            'sort' => $sort,
        ]);
    }

    return test()->sales->recalculateQuotation($quotation);
}

/* ── Totals ──────────────────────────────────────────────── */

it('totals a quotation from its lines', function () {
    $quotation = quote([['qty' => 2, 'price' => 5000], ['qty' => 4, 'price' => 250]]);

    expect((float) $quotation->subtotal)->toBe(11000.0)
        ->and((float) $quotation->total)->toBe(11000.0);
});

it('applies VAT after the discount', function () {
    // 10000 − 1000 = 9000, + 14% = 10260
    $quotation = quote([['qty' => 1, 'price' => 10000]], 14);
    $quotation->forceFill(['discount' => 1000])->save();
    $quotation = $this->sales->recalculateQuotation($quotation);

    expect((float) $quotation->tax_amount)->toBe(1260.0)
        ->and((float) $quotation->total)->toBe(10260.0);
});

it('never lets a discount exceed the subtotal', function () {
    $quotation = quote([['qty' => 1, 'price' => 500]]);
    $quotation->forceFill(['discount' => 9999])->save();

    expect((float) $this->sales->recalculateQuotation($quotation)->total)->toBe(0.0);
});

/* ── Sending ─────────────────────────────────────────────── */

it('refuses to send a quotation with no lines', function () {
    $empty = Quotation::create(['customer_id' => $this->customer->id]);

    expect(fn () => $this->sales->send($empty))->toThrow(ValidationException::class);
});

it('stamps when the quotation went out', function () {
    $sent = $this->sales->send(quote());

    expect($sent->status)->toBe(QuotationStatus::Sent)
        ->and($sent->sent_at)->not->toBeNull();
});

it('refuses to send the same quotation twice', function () {
    $sent = $this->sales->send(quote());

    expect(fn () => $this->sales->send($sent))->toThrow(ValidationException::class);
});

/* ── Validity is derived, not stored ─────────────────────── */

it('reports a sent quotation inside its window as still open', function () {
    $sent = $this->sales->send(quote());

    expect($sent->hasLapsed())->toBeFalse()
        ->and($sent->effectiveStatus())->toBe('sent');
});

it('reports a sent quotation past its date as expired', function () {
    // Derived on read: nothing on this host runs on a timer to flip a column.
    $sent = $this->sales->send(quote());
    $sent->forceFill(['valid_until' => now()->subDay()->toDateString()])->save();

    expect($sent->fresh()->hasLapsed())->toBeTrue()
        ->and($sent->fresh()->effectiveStatus())->toBe('expired');
});

it('leaves an accepted quotation alone once its date passes', function () {
    // Only a *sent* quote can lapse — a decision already taken does not expire.
    $order = $this->sales->acceptToOrder($this->sales->send(quote()), $this->manager);
    $quotation = $order->quotation;
    $quotation->forceFill(['valid_until' => now()->subDay()->toDateString()])->save();

    expect($quotation->fresh()->hasLapsed())->toBeFalse();
});

/* ── The customer decides ────────────────────────────────── */

it('keeps a rejection on the record with its reason', function () {
    $sent = $this->sales->send(quote());
    $rejected = $this->sales->reject($sent, 'السعر أعلى من المتاح');

    expect($rejected->status)->toBe(QuotationStatus::Rejected)
        ->and($rejected->reject_reason)->toBe('السعر أعلى من المتاح')
        ->and($rejected->decided_at)->not->toBeNull();
});

it('refuses to reject a quotation that was never sent', function () {
    expect(fn () => $this->sales->reject(quote()))->toThrow(ValidationException::class);
});

/* ── Quote becomes an order ──────────────────────────────── */

it('copies the lines onto the new order', function () {
    $sent = $this->sales->send(quote([
        ['qty' => 2, 'price' => 5000, 'description' => 'جهاز UPS 10kVA'],
        ['qty' => 4, 'price' => 250, 'description' => 'كابل'],
    ]));

    $order = $this->sales->acceptToOrder($sent, $this->manager);

    expect($order->lines)->toHaveCount(2)
        ->and((float) $order->total)->toBe(11000.0)
        ->and($order->quotation_id)->toBe($sent->id)
        ->and($sent->fresh()->status)->toBe(QuotationStatus::Accepted);
});

it('leaves the order untouched when the quote is re-priced afterwards', function () {
    // The quote is a record of what the customer was told. Sharing lines would
    // let a later edit rewrite that promise.
    $sent = $this->sales->send(quote([['qty' => 1, 'price' => 1000]]));
    $order = $this->sales->acceptToOrder($sent, $this->manager);

    $sent->lines()->first()->update(['unit_price' => 9999, 'line_total' => 9999]);

    expect((float) $order->fresh()->total)->toBe(1000.0);
});

it('refuses to accept a lapsed quotation', function () {
    $sent = $this->sales->send(quote());
    $sent->forceFill(['valid_until' => now()->subDay()->toDateString()])->save();

    expect(fn () => $this->sales->acceptToOrder($sent->fresh(), $this->manager))
        ->toThrow(ValidationException::class);
});

it('refuses to accept the same quotation twice', function () {
    $sent = $this->sales->send(quote());
    $this->sales->acceptToOrder($sent, $this->manager);

    expect(fn () => $this->sales->acceptToOrder($sent->fresh(), $this->manager))
        ->toThrow(ValidationException::class);
});

it('refuses to cancel a quotation that became an order', function () {
    $sent = $this->sales->send(quote());
    $this->sales->acceptToOrder($sent, $this->manager);

    expect(fn () => $this->sales->cancel($sent->fresh(), 'خطأ'))
        ->toThrow(ValidationException::class);
});

/* ── Order becomes an invoice ────────────────────────────── */

it('drafts an invoice carrying the order lines', function () {
    $order = $this->sales->acceptToOrder(
        $this->sales->send(quote([['qty' => 2, 'price' => 5000]], 14)),
        $this->manager,
    );
    $invoice = $this->sales->invoiceOrder($order, $this->manager);

    expect($invoice->status)->toBe(InvoiceStatus::Draft)
        ->and($invoice->sales_order_id)->toBe($order->id)
        ->and($invoice->lines)->toHaveCount(1)
        ->and((float) $invoice->total)->toBe((float) $order->total);
});

it('refuses to invoice the same order twice', function () {
    $order = $this->sales->acceptToOrder($this->sales->send(quote()), $this->manager);
    $this->sales->invoiceOrder($order, $this->manager);

    expect(fn () => $this->sales->invoiceOrder($order->fresh(), $this->manager))
        ->toThrow(ValidationException::class);
});

it('allows re-invoicing after the first invoice is voided', function () {
    $order = $this->sales->acceptToOrder($this->sales->send(quote()), $this->manager);
    $invoice = $this->sales->invoiceOrder($order, $this->manager);

    $this->billing->void($this->billing->issue($invoice), 'صدرت بالخطأ');

    expect($this->sales->invoiceOrder($order->fresh(), $this->manager))->not->toBeNull();
});

it('refuses to invoice a cancelled order', function () {
    $order = $this->sales->acceptToOrder($this->sales->send(quote()), $this->manager);
    $this->sales->cancelOrder($order, 'العميل تراجع');

    expect(fn () => $this->sales->invoiceOrder($order->fresh(), $this->manager))
        ->toThrow(ValidationException::class);
});

it('refuses to cancel an order that has been billed', function () {
    $order = $this->sales->acceptToOrder($this->sales->send(quote()), $this->manager);
    $this->sales->invoiceOrder($order, $this->manager);

    expect(fn () => $this->sales->cancelOrder($order->fresh(), 'تراجع'))
        ->toThrow(ValidationException::class);
});

/* ── Billing state is derived ────────────────────────────── */

it('reports an unbilled order as not invoiced', function () {
    $order = $this->sales->acceptToOrder($this->sales->send(quote()), $this->manager);

    expect($order->billingState())->toBe('not_invoiced')
        ->and($order->uninvoicedTotal())->toBe(10000.0);
});

it('reports a fully billed order as invoiced', function () {
    $order = $this->sales->acceptToOrder($this->sales->send(quote()), $this->manager);
    $this->sales->invoiceOrder($order, $this->manager);

    expect($order->fresh()->billingState())->toBe('invoiced')
        ->and($order->fresh()->uninvoicedTotal())->toBe(0.0);
});

it('stops counting an invoice once it is voided', function () {
    $order = $this->sales->acceptToOrder($this->sales->send(quote()), $this->manager);
    $invoice = $this->sales->invoiceOrder($order, $this->manager);

    $this->billing->void($this->billing->issue($invoice), 'خطأ');

    expect($order->fresh()->billingState())->toBe('not_invoiced');
});

/* ── The whole chain lands on the customer's balance ─────── */

it('carries a quote through to money owed', function () {
    $order = $this->sales->acceptToOrder($this->sales->send(quote([['qty' => 1, 'price' => 8000]])), $this->manager);
    $invoice = $this->billing->issue($this->sales->invoiceOrder($order, $this->manager));

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id,
        'cash_box_id' => CashBox::default()->id,
        'amount' => 3000,
    ], $this->manager);

    expect($this->billing->customerBalance($this->customer->id))->toBe(5000.0)
        ->and($invoice->fresh()->paymentState())->toBe('partly_paid');
});

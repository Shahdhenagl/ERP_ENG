<?php

use App\Models\CashBox;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\BillingService;
use App\Services\PurchasingService;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->purchasing = app(PurchasingService::class);
    $this->manager = User::factory()->manager()->create();
    $this->supplier = Supplier::create(['name' => 'النور للبطاريات']);
    $this->battery = Item::factory()->battery()->create(['name' => 'بطارية 100Ah']);
    $this->fan = Item::factory()->create(['name' => 'مروحة تبريد']);
    $this->main = Warehouse::main();
    $this->box = CashBox::default();
});

function order(array $lines = null): PurchaseOrder
{
    $lines ??= [
        ['item' => test()->battery, 'qty' => 20, 'price' => 950],
        ['item' => test()->fan, 'qty' => 10, 'price' => 180],
    ];

    $order = PurchaseOrder::create([
        'supplier_id' => test()->supplier->id,
        'created_by' => test()->manager->id,
    ]);

    foreach ($lines as $sort => $line) {
        $order->lines()->create([
            'item_id' => $line['item']->id,
            'qty' => $line['qty'],
            'unit_price' => $line['price'],
            'sort' => $sort,
        ]);
    }

    return $order->fresh();
}

/* ── Ordering ────────────────────────────────────────────── */

it('refuses to send an order with no lines', function () {
    $empty = PurchaseOrder::create(['supplier_id' => $this->supplier->id]);

    expect(fn () => $this->purchasing->send($empty))->toThrow(ValidationException::class);
});

it('totals an order from its lines with tax', function () {
    // 20 × 950 + 10 × 180 = 20800, + 14% = 23712
    $order = order();
    $order->forceFill(['tax_rate' => 14])->save();

    expect($order->subtotal())->toBe(20800.0)
        ->and($order->total())->toBe(23712.0);
});

it('refuses to receive against a draft order', function () {
    $order = order();

    expect(fn () => $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 5]],
        $this->manager,
    ))->toThrow(ValidationException::class);
});

/* ── Receiving ───────────────────────────────────────────── */

it('books goods in and moves the stock balance', function () {
    $order = $this->purchasing->send(order());

    $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 20]],
        $this->manager,
    );

    expect($this->battery->qtyIn($this->main))->toBe(20.0)
        ->and((float) $this->battery->fresh()->avg_cost)->toBe(950.0);
});

it('ties the receipt to the supplier and the order', function () {
    // The whole point: no more guessing where stock came from.
    $order = $this->purchasing->send(order());

    $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 5]],
        $this->manager,
    );

    $movement = StockMovement::where('purchase_order_id', $order->id)->first();

    expect($movement->supplier_id)->toBe($this->supplier->id)
        ->and($movement->purchase_order_id)->toBe($order->id);
});

it('accepts a partial delivery and leaves the rest outstanding', function () {
    $order = $this->purchasing->send(order());

    $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 12]],
        $this->manager,
    );

    expect($order->fresh()->outstandingFor($this->battery->id))->toBe(8.0)
        ->and($order->fresh()->fulfilment())->toBe('partly_received');
});

it('refuses to receive more than was ordered', function () {
    // An extra nobody asked for is a delivery error or a keying error, and
    // letting it through is how a balance stops matching the shelf.
    $order = $this->purchasing->send(order());

    expect(fn () => $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 25]],
        $this->manager,
    ))->toThrow(ValidationException::class);

    expect($this->battery->qtyIn($this->main))->toBe(0.0);
});

it('refuses a second delivery that would take the line over', function () {
    $order = $this->purchasing->send(order());

    $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 18]],
        $this->manager,
    );

    expect(fn () => $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 5]],
        $this->manager,
    ))->toThrow(ValidationException::class);

    expect($this->battery->qtyIn($this->main))->toBe(18.0);
});

it('refuses an item that is not on the order', function () {
    $order = $this->purchasing->send(order([['item' => $this->battery, 'qty' => 5, 'price' => 900]]));

    expect(fn () => $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->fan->id, 'qty' => 1]],
        $this->manager,
    ))->toThrow(ValidationException::class);
});

it('books nothing at all when one line of a delivery is invalid', function () {
    // Half a delivery is worse than none: the shelf and the book disagree and
    // nobody knows which lines went in.
    $order = $this->purchasing->send(order());

    expect(fn () => $this->purchasing->receiveAgainstOrder(
        $order,
        [
            ['item_id' => $this->battery->id, 'qty' => 5],
            ['item_id' => $this->fan->id, 'qty' => 99],   // over the ordered 10
        ],
        $this->manager,
    ))->toThrow(ValidationException::class);

    expect($this->battery->qtyIn($this->main))->toBe(0.0)
        ->and($this->fan->qtyIn($this->main))->toBe(0.0);
});

it('costs at the invoiced price when it differs from the order', function () {
    $order = $this->purchasing->send(order());

    $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 10, 'unit_cost' => 1010]],
        $this->manager,
    );

    expect((float) $this->battery->fresh()->avg_cost)->toBe(1010.0);
});

it('reads as fully received once every line has arrived', function () {
    $order = $this->purchasing->send(order());

    $this->purchasing->receiveAgainstOrder($order, [
        ['item_id' => $this->battery->id, 'qty' => 20],
        ['item_id' => $this->fan->id, 'qty' => 10],
    ], $this->manager);

    expect($order->fresh()->fulfilment())->toBe('received');
});

/* ── Cancelling ──────────────────────────────────────────── */

it('refuses to cancel an order already part-delivered', function () {
    $order = $this->purchasing->send(order());

    $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 1]],
        $this->manager,
    );

    expect(fn () => $this->purchasing->cancel($order, 'غيّرنا رأينا'))
        ->toThrow(ValidationException::class);
});

/* ── What is owed ────────────────────────────────────────── */

it('owes the supplier for what has arrived', function () {
    $order = $this->purchasing->send(order());

    $this->purchasing->receiveAgainstOrder($order, [
        ['item_id' => $this->battery->id, 'qty' => 10],   // 9500
        ['item_id' => $this->fan->id, 'qty' => 5],        // 900
    ], $this->manager);

    expect($this->supplier->fresh()->balance())->toBe(10400.0);
});

it('owes nothing for goods that have not arrived yet', function () {
    $this->purchasing->send(order());

    expect($this->supplier->fresh()->balance())->toBe(0.0);
});

it('reduces the balance when the supplier is paid', function () {
    $order = $this->purchasing->send(order());
    $this->purchasing->receiveAgainstOrder(
        $order,
        [['item_id' => $this->battery->id, 'qty' => 10]],
        $this->manager,
    );

    // Fund the box first — you cannot pay out of an empty till.
    fundBox(20000);

    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'cash_box_id' => $this->box->id,
        'amount' => 4000,
    ], $this->manager);

    expect($this->supplier->fresh()->balance())->toBe(5500.0);
});

it('takes the payment out of the cash box', function () {
    fundBox(5000);

    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'cash_box_id' => $this->box->id,
        'amount' => 1200,
    ], $this->manager);

    expect($this->box->fresh()->balance())->toBe(3800.0);
});

it('refuses to pay more than the box holds', function () {
    fundBox(100);

    expect(fn () => $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'cash_box_id' => $this->box->id,
        'amount' => 500,
    ], $this->manager))->toThrow(ValidationException::class);
});

it('puts the money back when a voucher is reversed', function () {
    fundBox(5000);

    $payment = $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'cash_box_id' => $this->box->id,
        'amount' => 1000,
    ], $this->manager);

    $this->purchasing->reversePayment($payment, $this->manager);

    expect($this->box->fresh()->balance())->toBe(5000.0)
        ->and($this->supplier->fresh()->balance())->toBe(0.0);
});

/** Puts real money in the till through the sales side, so the test is honest. */
function fundBox(float $amount): void
{
    $billing = app(BillingService::class);
    $customer = \App\Models\Customer::factory()->create();

    $invoice = Invoice::create(['customer_id' => $customer->id]);
    $invoice->lines()->create([
        'description' => 'رصيد افتتاحي', 'qty' => 1,
        'unit_price' => $amount, 'line_total' => $amount,
    ]);

    $billing->receivePayment([
        'invoice_id' => $billing->issue($invoice)->id,
        'cash_box_id' => test()->box->id,
        'amount' => $amount,
    ], test()->manager);
}

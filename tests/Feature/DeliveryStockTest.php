<?php

use App\Models\Customer;
use App\Models\Item;
use App\Models\SalesOrder;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

/**
 * The delivery screen has to say whether the goods are on the shelf.
 *
 * Issuing the invoice is what draws them down and it refuses a shortage, so
 * without this the first anyone hears of it is a van at the gate. What the list
 * reports is the main store's balance against what the order still owes.
 */
beforeEach(function () {
    $this->ledger = app(StockLedger::class);
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    $this->store = Warehouse::main();
});

/** An open sales order for one stocked line. */
function orderFor(Item $item, float $qty): SalesOrder
{
    $order = SalesOrder::create([
        'customer_id' => test()->customer->id,
        'order_date' => now()->toDateString(),
    ]);

    $order->lines()->create([
        'item_id' => $item->id,
        'description' => $item->name,
        'qty' => $qty,
        'unit_price' => 1000,
        'line_total' => $qty * 1000,
    ]);

    return $order;
}

/** The readiness block the list returns for one order. */
function readiness(int $orderId): array
{
    $rows = test()->getJson('/api/sales-orders')->assertOk()->json('data');

    return collect($rows)->firstWhere('id', $orderId)['stock'];
}

it('reports an order the store can cover as ready', function () {
    $item = Item::factory()->create(['name' => 'بطارية 100 أمبير']);
    $this->ledger->receive($item, $this->store, 10, 700, $this->manager);
    $order = orderFor($item, 4);

    actingAs($this->manager);

    expect(readiness($order->id)['state'])->toBe('ready');
});

it('names what is missing and by how much', function () {
    $item = Item::factory()->create(['name' => 'مروحة تبريد']);
    $this->ledger->receive($item, $this->store, 2, 300, $this->manager);
    $order = orderFor($item, 5);

    actingAs($this->manager);
    $stock = readiness($order->id);

    expect($stock['state'])->toBe('short')
        ->and($stock['short'][0]['item'])->toBe('مروحة تبريد')
        // JSON gives a whole number back as an int; the value is what matters.
        ->and((float) $stock['short'][0]['needed'])->toBe(5.0)
        ->and((float) $stock['short'][0]['available'])->toBe(2.0);
});

it('judges the same item on two lines by their sum', function () {
    $item = Item::factory()->create();
    $this->ledger->receive($item, $this->store, 4, 300, $this->manager);

    $order = orderFor($item, 3);
    $order->lines()->create([
        'item_id' => $item->id,
        'description' => 'دفعة ثانية',
        'qty' => 3,
        'unit_price' => 1000,
        'line_total' => 3000,
    ]);

    actingAs($this->manager);

    // Three is affordable twice over; six is not.
    expect(readiness($order->id)['state'])->toBe('short');
});

it('says nothing about an order that never touches a shelf', function () {
    $order = SalesOrder::create([
        'customer_id' => $this->customer->id,
        'order_date' => now()->toDateString(),
    ]);
    $order->lines()->create([
        'description' => 'مصنعية تركيب',
        'qty' => 1,
        'unit_price' => 500,
        'line_total' => 500,
    ]);

    actingAs($this->manager);

    expect(readiness($order->id)['state'])->toBe('none');
});

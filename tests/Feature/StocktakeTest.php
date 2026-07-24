<?php

use App\Models\Item;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->stock = app(StockLedger::class);
    $this->manager = User::factory()->manager()->create();
    $this->store = Warehouse::main();
});

it('serves a count sheet with the book quantity per item', function () {
    $item = Item::factory()->create(['name' => 'بطارية 100 أمبير']);
    $this->stock->receive($item, $this->store, 10, 50, $this->manager);

    $sheet = actingAs($this->manager)
        ->getJson("/api/stock/stocktake?warehouse_id={$this->store->id}")
        ->assertOk()
        ->json('items');

    $line = collect($sheet)->firstWhere('item_id', $item->id);

    expect($line['book_qty'])->toEqual(10)
        ->and($line['unit_cost'])->toEqual(50)
        ->and($line['name'])->toBe('بطارية 100 أمبير');
});

it('adjusts stock to the count and reports the shrinkage', function () {
    $item = Item::factory()->create();
    $this->stock->receive($item, $this->store, 10, 50, $this->manager);

    $data = actingAs($this->manager)->postJson('/api/stock/stocktake', [
        'warehouse_id' => $this->store->id,
        'counts' => [['item_id' => $item->id, 'counted_qty' => 8]], // two short
    ])->assertOk()->json('data');

    expect($item->fresh()->qtyIn($this->store))->toEqual(8)
        ->and($data['adjusted'])->toBe(1)
        ->and($data['shortage_qty'])->toEqual(2)
        ->and($data['shrinkage_value'])->toEqual(100); // 2 × 50
});

it('nets a surplus against a shortage', function () {
    $short = Item::factory()->create();
    $over = Item::factory()->create();
    $this->stock->receive($short, $this->store, 10, 50, $this->manager);
    $this->stock->receive($over, $this->store, 10, 30, $this->manager);

    $data = actingAs($this->manager)->postJson('/api/stock/stocktake', [
        'warehouse_id' => $this->store->id,
        'counts' => [
            ['item_id' => $short->id, 'counted_qty' => 7],  // -3 × 50 = -150
            ['item_id' => $over->id, 'counted_qty' => 12],  // +2 × 30 = +60
        ],
    ])->assertOk()->json('data');

    expect($data['shortage_qty'])->toEqual(3)
        ->and($data['surplus_qty'])->toEqual(2)
        ->and($data['shrinkage_value'])->toEqual(150)
        ->and($data['surplus_value'])->toEqual(60)
        ->and($data['net_value'])->toEqual(-90);
});

it('records nothing for a count that matches the book', function () {
    $item = Item::factory()->create();
    $this->stock->receive($item, $this->store, 10, 50, $this->manager);

    $data = actingAs($this->manager)->postJson('/api/stock/stocktake', [
        'warehouse_id' => $this->store->id,
        'counts' => [['item_id' => $item->id, 'counted_qty' => 10]],
    ])->assertOk()->json('data');

    expect($data['adjusted'])->toBe(0)
        ->and($data['net_value'])->toEqual(0);
});

it('bars a technician from the count', function () {
    actingAs(User::factory()->technician()->create())
        ->getJson("/api/stock/stocktake?warehouse_id={$this->store->id}")
        ->assertForbidden();
});

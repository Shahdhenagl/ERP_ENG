<?php

use App\Enums\MovementType;
use App\Enums\WarehouseType;
use App\Models\Item;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->ledger = app(StockLedger::class);
    $this->manager = User::factory()->manager()->create();
    $this->main = Warehouse::main();
    $this->branch = Warehouse::create(['name' => 'مخزن الفرع', 'type' => WarehouseType::Store]);
    $this->item = Item::factory()->create(['name' => 'كابل']);
    $this->ledger->receive($this->item, $this->main, 100, 20, $this->manager);
});

it('moves stock from one warehouse to another', function () {
    actingAs($this->manager)->postJson('/api/stock/warehouse-transfer', [
        'item_id' => $this->item->id,
        'from_warehouse_id' => $this->main->id,
        'to_warehouse_id' => $this->branch->id,
        'qty' => 30,
    ])->assertCreated();

    expect(round($this->item->qtyIn($this->main), 2))->toBe(70.0)
        ->and(round($this->item->qtyIn($this->branch), 2))->toBe(30.0);
});

it('refuses a transfer to the same warehouse', function () {
    actingAs($this->manager)->postJson('/api/stock/warehouse-transfer', [
        'item_id' => $this->item->id,
        'from_warehouse_id' => $this->main->id,
        'to_warehouse_id' => $this->main->id,
        'qty' => 10,
    ])->assertStatus(422);
});

it('issues stock out with a reason and logs it as an issue', function () {
    actingAs($this->manager)->postJson('/api/stock/issue', [
        'item_id' => $this->item->id,
        'warehouse_id' => $this->main->id,
        'qty' => 12,
        'note' => 'تالف',
    ])->assertCreated();

    expect(round($this->item->qtyIn($this->main), 2))->toBe(88.0)
        ->and($this->item->movements()->where('type', MovementType::Issue->value)->count())->toBe(1);
});

it('refuses to issue more than is on hand', function () {
    actingAs($this->manager)->postJson('/api/stock/issue', [
        'item_id' => $this->item->id,
        'warehouse_id' => $this->main->id,
        'qty' => 1000,
    ])->assertStatus(422);
});

it('bars a technician from moving stock', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->postJson('/api/stock/issue', [
        'item_id' => $this->item->id,
        'warehouse_id' => $this->main->id,
        'qty' => 1,
    ])->assertForbidden();
});

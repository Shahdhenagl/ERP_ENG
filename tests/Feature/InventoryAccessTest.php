<?php

use App\Models\Item;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->ledger = app(StockLedger::class);
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->otherTechnician = User::factory()->technician()->create();
    $this->item = Item::factory()->create();
});

/* ── The catalogue and the store belong to dispatchers ───── */

it('stops a technician browsing the item catalogue', function () {
    actingAs($this->technician)->getJson('/api/items')->assertForbidden();
});

it('stops a technician receiving goods or moving custody', function () {
    // Otherwise a technician could quietly write stock onto their own van.
    actingAs($this->technician)
        ->postJson('/api/stock/receive', ['item_id' => $this->item->id, 'qty' => 5, 'unit_cost' => 10])
        ->assertForbidden();

    actingAs($this->technician)
        ->postJson('/api/stock/transfer', [
            'item_id' => $this->item->id,
            'qty' => 1,
            'to_user_id' => $this->technician->id,
        ])
        ->assertForbidden();
});

it('stops a technician adjusting a stocktake', function () {
    actingAs($this->technician)
        ->postJson('/api/stock/adjust', [
            'item_id' => $this->item->id,
            'warehouse_id' => Warehouse::main()->id,
            'counted_qty' => 999,
        ])
        ->assertForbidden();
});

it('lets a manager run the store', function () {
    actingAs($this->manager)
        ->postJson('/api/stock/receive', [
            'item_id' => $this->item->id,
            'qty' => 5,
            'unit_cost' => 40,
            'supplier' => 'مورّد البطاريات',
        ])
        ->assertCreated();

    expect((float) $this->item->fresh()->avg_cost)->toBe(40.0);
});

/* ── A technician sees their own van and nothing else ────── */

it('shows a technician only what they are carrying', function () {
    $mine = Warehouse::forTechnician($this->technician);
    $theirs = Warehouse::forTechnician($this->otherTechnician);

    $this->ledger->receive($this->item, Warehouse::main(), 10, 100, $this->manager);
    $this->ledger->transfer($this->item, Warehouse::main(), $mine, 3, $this->manager);
    $this->ledger->transfer($this->item, Warehouse::main(), $theirs, 4, $this->manager);

    $response = actingAs($this->technician)->getJson('/api/stock/mine')->assertOk();

    // JSON renders 3.0 as 3, so compare by value rather than by type.
    expect((float) $response->json('data.0.qty'))->toBe(3.0)
        ->and($response->json('meta.warehouse_id'))->toBe($mine->id);
});

it('hides other technicians custody from the warehouse list', function () {
    Warehouse::forTechnician($this->technician);
    Warehouse::forTechnician($this->otherTechnician);

    $response = actingAs($this->technician)->getJson('/api/stock/warehouses')->assertOk();

    expect($response->json('data'))->toHaveCount(1);
});

it('shows a manager every location', function () {
    Warehouse::forTechnician($this->technician);
    Warehouse::forTechnician($this->otherTechnician);
    Warehouse::main();

    $response = actingAs($this->manager)->getJson('/api/stock/warehouses')->assertOk();

    expect($response->json('data'))->toHaveCount(3);
});

/* ── Housekeeping ────────────────────────────────────────── */

it('refuses to hand custody to somebody who is not a technician', function () {
    actingAs($this->manager)
        ->postJson('/api/stock/transfer', [
            'item_id' => $this->item->id,
            'qty' => 1,
            'to_user_id' => $this->manager->id,
        ])
        ->assertStatus(422);
});

it('refuses to delete an item that has moved', function () {
    $this->ledger->receive($this->item, Warehouse::main(), 1, 10, $this->manager);

    actingAs($this->manager)->deleteJson("/api/items/{$this->item->id}")->assertStatus(422);

    expect(Item::find($this->item->id))->not->toBeNull();
});

it('deletes an item that never moved', function () {
    actingAs($this->manager)->deleteJson("/api/items/{$this->item->id}")->assertOk();

    expect(Item::find($this->item->id))->toBeNull();
});

it('lists items that have fallen below the reorder level', function () {
    $low = Item::factory()->create(['name' => 'فيوز', 'reorder_level' => 10]);
    $fine = Item::factory()->create(['name' => 'مروحة', 'reorder_level' => 2]);

    $this->ledger->receive($low, Warehouse::main(), 3, 5, $this->manager);
    $this->ledger->receive($fine, Warehouse::main(), 9, 5, $this->manager);

    $response = actingAs($this->manager)->getJson('/api/items?below_reorder=1')->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('data.0.name'))->toBe('فيوز');
});

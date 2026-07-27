<?php

use App\Enums\MovementType;
use App\Models\Item;
use App\Models\StockLevel;
use App\Models\User;
use App\Models\Warehouse;

use function Pest\Laravel\actingAs;

/**
 * Adding an item you already have on the shelf shouldn't mean adding it and
 * then remembering to receive it. The quantity is taken on the same form — but
 * it still goes in as a receipt, because a balance with no movement behind it
 * is a number nobody can account for later.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->store = Warehouse::main();
});

/** Create an item through the API and hand back the model. */
function createItem(array $payload = []): Item
{
    $id = test()->postJson('/api/items', [
        'name' => 'بطارية 100 أمبير',
        'category' => 'battery',
        'unit' => 'قطعة',
        ...$payload,
    ])->assertCreated()->json('id');

    return Item::findOrFail($id);
}

it('puts the opening quantity on the shelf as a receipt', function () {
    actingAs($this->manager);

    $item = createItem(['opening_qty' => 12, 'opening_cost' => 850]);

    $level = StockLevel::where('item_id', $item->id)
        ->where('warehouse_id', $this->store->id)->first();

    expect((float) $level->qty)->toBe(12.0)
        // Received goods are what sets the average — the sale prices its cost off it.
        ->and((float) $item->fresh()->avg_cost)->toBe(850.0);

    $movement = $item->movements()->first();
    expect($movement->type)->toBe(MovementType::Receipt)
        ->and($movement->note)->toBe('رصيد افتتاحي')
        ->and($movement->to_warehouse_id)->toBe($this->store->id);
});

it('leaves an item with no opening quantity with no movement at all', function () {
    actingAs($this->manager);

    $item = createItem();

    expect($item->movements()->count())->toBe(0)
        ->and((float) StockLevel::where('item_id', $item->id)->sum('qty'))->toBe(0.0);
});

it('refuses a quantity with no cost behind it', function () {
    actingAs($this->manager);

    $this->postJson('/api/items', [
        'name' => 'مروحة تبريد',
        'category' => 'spare_part',
        'unit' => 'قطعة',
        'opening_qty' => 5,
    ])->assertStatus(422)->assertJsonValidationErrors('opening_cost');

    // Refused outright: no half-made item left behind for someone to find.
    expect(Item::where('name', 'مروحة تبريد')->exists())->toBeFalse();
});

it('accepts a free opening balance when the cost is stated as zero', function () {
    actingAs($this->manager);

    $item = createItem(['opening_qty' => 3, 'opening_cost' => 0]);

    expect((float) $item->fresh()->avg_cost)->toBe(0.0)
        ->and((float) StockLevel::where('item_id', $item->id)->value('qty'))->toBe(3.0);
});

it('opens the balance in the store it was told to', function () {
    $branch = Warehouse::create(['name' => 'مخزن فرع أكتوبر', 'type' => 'store']);

    actingAs($this->manager);
    $item = createItem([
        'opening_qty' => 4,
        'opening_cost' => 100,
        'opening_warehouse_id' => $branch->id,
    ]);

    expect((float) StockLevel::where('item_id', $item->id)
        ->where('warehouse_id', $branch->id)->value('qty'))->toBe(4.0)
        ->and(StockLevel::where('item_id', $item->id)
            ->where('warehouse_id', $this->store->id)->exists())->toBeFalse();
});

it('can be sold straight away, without a separate receipt', function () {
    actingAs($this->manager);
    $item = createItem(['opening_qty' => 6, 'opening_cost' => 500]);

    $customer = \App\Models\Customer::factory()->create();
    $invoiceId = $this->postJson('/api/invoices', [
        'customer_id' => $customer->id,
        'lines' => [['item_id' => $item->id, 'description' => $item->name, 'qty' => 2, 'unit_price' => 900]],
    ])->assertCreated()->json('id');

    $this->postJson("/api/invoices/{$invoiceId}/issue")->assertOk();

    expect((float) StockLevel::where('item_id', $item->id)->value('qty'))->toBe(4.0);
});

<?php

use App\Models\Item;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\DB;

use function Pest\Laravel\actingAs;

/**
 * Production MySQL runs in ONLY_FULL_GROUP_BY (strict) mode, which rejects a
 * scalar aggregate that still carries an ORDER BY — the mode Laragon does not
 * enforce, so a query that passes locally can 500 live. These tests turn strict
 * mode on for the connection so that class of bug is caught here instead.
 */
beforeEach(function () {
    // Match the server: an aggregate ordered without a GROUP BY is now an error.
    DB::statement("SET SESSION sql_mode='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES'");
    $this->manager = User::factory()->manager()->create();
});

it('creates a purchase order under strict mode', function () {
    $supplier = Supplier::create(['name' => 'احمد']);
    $item = Item::factory()->create();

    actingAs($this->manager)->postJson('/api/purchase-orders', [
        'supplier_id' => $supplier->id,
        'tax_rate' => 14,
        'lines' => [['item_id' => $item->id, 'qty' => 1, 'unit_price' => 18000]],
    ])->assertCreated()
        ->assertJsonPath('data.subtotal', 18000)
        ->assertJsonPath('data.total', 20520);
});

it('lists purchase orders under strict mode', function () {
    $supplier = Supplier::create(['name' => 'احمد']);
    $item = Item::factory()->create();

    actingAs($this->manager)->postJson('/api/purchase-orders', [
        'supplier_id' => $supplier->id,
        'lines' => [['item_id' => $item->id, 'qty' => 2, 'unit_price' => 500]],
    ])->assertCreated();

    actingAs($this->manager)->getJson('/api/purchase-orders')->assertOk();
});

it('selects a supplier quote into an order under strict mode', function () {
    $supplier = Supplier::create(['name' => 'احمد']);
    $item = Item::factory()->create();

    $quoteId = actingAs($this->manager)->postJson('/api/supplier-quotes', [
        'supplier_id' => $supplier->id,
        'lines' => [['item_id' => $item->id, 'qty' => 1, 'unit_price' => 9000]],
    ])->assertCreated()->json('data.id');

    // This is "اعتماد الموردين": it creates a purchase order and presents it,
    // which is where the ordered-aggregate query used to blow up.
    actingAs($this->manager)->postJson("/api/supplier-quotes/{$quoteId}/select")->assertOk();
});

<?php

use App\Models\Customer;
use App\Models\Item;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The product's kind and nameplate ride along on every sales document — the
 * invoice and the sales order, the same as the quotation — so each reads as what
 * is being sold, not just a price.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    $this->item = Item::factory()->create([
        'name' => 'UPS 20kVA', 'category' => 'ups', 'unit' => 'جهاز',
        'specs' => ['brand' => 'Socomec', 'capacity' => '20 kVA'],
    ]);
});

it('carries the product kind and specs on an invoice line', function () {
    $id = actingAs($this->manager)->postJson('/api/invoices', [
        'customer_id' => $this->customer->id,
        'lines' => [
            ['item_id' => $this->item->id, 'description' => 'UPS 20kVA', 'qty' => 1, 'unit_price' => 85000],
        ],
    ])->assertCreated()->json('id') ?? null;

    // The show endpoint is the one that eager-loads the item and wraps in data.
    $invoiceId = $id ?? \App\Models\Invoice::latest('id')->first()->id;

    $line = actingAs($this->manager)->getJson("/api/invoices/{$invoiceId}")
        ->assertOk()
        ->json('data.lines.0');

    expect($line['item_category_label'])->toBe('أجهزة UPS')
        ->and($line['item_specs']['brand'])->toBe('Socomec')
        ->and($line['unit'])->toBe('جهاز');
});

it('carries the product kind and specs on a sales order line', function () {
    $id = actingAs($this->manager)->postJson('/api/sales-orders', [
        'customer_id' => $this->customer->id,
        'lines' => [
            ['item_id' => $this->item->id, 'description' => 'UPS 20kVA', 'qty' => 1, 'unit_price' => 85000],
        ],
    ])->assertCreated()->json('data.id');

    $line = actingAs($this->manager)->getJson("/api/sales-orders/{$id}")
        ->assertOk()
        ->json('data.lines.0');

    expect($line['item_category_label'])->toBe('أجهزة UPS')
        ->and($line['item_specs']['capacity'])->toBe('20 kVA');
});

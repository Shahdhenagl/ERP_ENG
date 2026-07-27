<?php

use App\Models\Customer;
use App\Models\Item;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * A quotation line that points at a catalogue item carries the product's kind
 * and nameplate, so the quote states what is being sold, not just its price.
 */
it('serves the product kind and specs on a quotation line', function () {
    $manager = User::factory()->manager()->create();
    $customer = Customer::factory()->create();

    $item = Item::factory()->create([
        'name' => 'UPS 20kVA Online',
        'category' => 'ups',
        'unit' => 'جهاز',
        'specs' => ['brand' => 'Socomec', 'model' => 'ITYS', 'capacity' => '20 kVA'],
    ]);

    $id = actingAs($manager)->postJson('/api/quotations', [
        'customer_id' => $customer->id,
        'lines' => [
            ['item_id' => $item->id, 'description' => 'UPS 20kVA', 'qty' => 1, 'unit_price' => 85000],
        ],
    ])->assertCreated()->json('data.id');

    $line = actingAs($manager)->getJson("/api/quotations/{$id}")
        ->assertOk()
        ->json('data.lines.0');

    expect($line['item_category_label'])->toBe('أجهزة UPS')
        ->and($line['item_specs']['brand'])->toBe('Socomec')
        ->and($line['item_specs']['capacity'])->toBe('20 kVA')
        ->and($line['unit'])->toBe('جهاز');
});

it('leaves a free-text line without product details', function () {
    $manager = User::factory()->manager()->create();
    $customer = Customer::factory()->create();

    $id = actingAs($manager)->postJson('/api/quotations', [
        'customer_id' => $customer->id,
        'lines' => [['description' => 'أجر تركيب', 'qty' => 1, 'unit_price' => 5000]],
    ])->assertCreated()->json('data.id');

    $line = actingAs($manager)->getJson("/api/quotations/{$id}")->json('data.lines.0');

    expect($line['item_category_label'])->toBeNull()
        ->and($line['item_specs'])->toBeNull();
});

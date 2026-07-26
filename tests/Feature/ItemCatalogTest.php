<?php

use App\Models\Item;
use App\Models\ItemCategory as ItemGroup;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The store carries whole UPS units and battery banks as stock now, each with a
 * nameplate. The catalogue keeps only the specs that belong to the kind it is
 * filed under, prices it with a quoted sell price, and files it into the matching
 * editable group.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
});

it('registers a UPS item with its nameplate and files it in the UPS group', function () {
    $data = actingAs($this->manager)->postJson('/api/items', [
        'name' => 'UPS 20kVA Online',
        'category' => 'ups',
        'unit' => 'جهاز',
        'sell_price' => 85000,
        'specs' => [
            'brand' => 'Socomec',
            'model' => 'ITYS',
            'ups_type' => 'online',
            'phase' => 'three',
            'capacity' => '20 kVA',
        ],
    ])->assertCreated()->json();

    $item = Item::firstWhere('name', 'UPS 20kVA Online');

    expect($item->category->value)->toBe('ups')
        ->and($item->specs['brand'])->toBe('Socomec')
        ->and($item->specs['capacity'])->toBe('20 kVA')
        ->and((float) $item->sell_price)->toBe(85000.0)
        // Filed into the editable group that shares the slug.
        ->and($item->item_category_id)->toBe(ItemGroup::where('slug', 'ups')->value('id'));

    expect($data['specs']['ups_type'])->toBe('online')
        ->and($data['category_label'])->toBe('أجهزة UPS');
});

it('registers a battery item with its specs and sell price', function () {
    actingAs($this->manager)->postJson('/api/items', [
        'name' => 'بطارية 12V 100Ah',
        'category' => 'battery',
        'unit' => 'بطارية',
        'sell_price' => 2400,
        'specs' => [
            'brand' => 'CSB',
            'capacity_ah' => '100',
            'voltage' => '12',
            'battery_type' => 'vrla',
        ],
    ])->assertCreated();

    $item = Item::firstWhere('name', 'بطارية 12V 100Ah');

    expect($item->specs['capacity_ah'])->toBe('100')
        ->and($item->specs['battery_type'])->toBe('vrla')
        ->and((float) $item->sell_price)->toBe(2400.0)
        ->and($item->item_category_id)->toBe(ItemGroup::where('slug', 'battery')->value('id'));
});

it('drops specs that do not belong to the chosen category', function () {
    // A UPS payload smuggling a battery-only key must not keep it.
    actingAs($this->manager)->postJson('/api/items', [
        'name' => 'UPS 10kVA',
        'category' => 'ups',
        'unit' => 'جهاز',
        'specs' => [
            'brand' => 'APC',
            'capacity_ah' => '999',   // battery key, not a UPS one
        ],
    ])->assertCreated();

    $item = Item::firstWhere('name', 'UPS 10kVA');

    expect($item->specs)->toHaveKey('brand')
        ->and($item->specs)->not->toHaveKey('capacity_ah');
});

it('keeps no nameplate on a spare part', function () {
    actingAs($this->manager)->postJson('/api/items', [
        'name' => 'مروحة تبريد',
        'category' => 'spare_part',
        'unit' => 'قطعة',
        'specs' => ['brand' => 'ignored'],
    ])->assertCreated();

    expect(Item::firstWhere('name', 'مروحة تبريد')->specs)->toBeNull();
});

it('stores an all-blank nameplate as nothing', function () {
    actingAs($this->manager)->postJson('/api/items', [
        'name' => 'UPS فارغ المواصفات',
        'category' => 'ups',
        'unit' => 'جهاز',
        'specs' => ['brand' => '', 'model' => ''],
    ])->assertCreated();

    expect(Item::firstWhere('name', 'UPS فارغ المواصفات')->specs)->toBeNull();
});

it('updates a UPS nameplate without touching its stock', function () {
    $item = Item::factory()->create([
        'name' => 'UPS قديم', 'category' => 'ups', 'specs' => ['brand' => 'قديم'],
    ]);

    actingAs($this->manager)->putJson("/api/items/{$item->id}", [
        'name' => 'UPS محدّث',
        'category' => 'ups',
        'unit' => 'جهاز',
        'specs' => ['brand' => 'Eaton', 'capacity' => '30 kVA'],
    ])->assertOk();

    expect($item->fresh()->specs['brand'])->toBe('Eaton')
        ->and($item->fresh()->specs['capacity'])->toBe('30 kVA');
});

it('counts items per category for the tabs', function () {
    Item::factory()->create(['category' => 'ups']);
    Item::factory()->count(2)->create(['category' => 'battery']);
    Item::factory()->create(['category' => 'spare_part']);

    $counts = actingAs($this->manager)->getJson('/api/items')->assertOk()->json('counts');

    expect($counts['all'])->toBe(4)
        ->and($counts['by_category']['ups'])->toBe(1)
        ->and($counts['by_category']['battery'])->toBe(2)
        ->and($counts['by_category']['spare_part'])->toBe(1);
});

it('filters the list down to one category', function () {
    Item::factory()->create(['category' => 'ups', 'name' => 'وحدة UPS']);
    Item::factory()->create(['category' => 'battery', 'name' => 'بنك بطاريات']);

    $response = actingAs($this->manager)->getJson('/api/items?category=ups')->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('data.0.name'))->toBe('وحدة UPS');
});

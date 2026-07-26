<?php

use App\Models\Asset;
use App\Models\Battery;
use App\Models\Customer;
use App\Models\Item;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

/**
 * A UPS unit or a battery bank installed at a customer is stock leaving the
 * store: it draws the nameplate down from the catalogue item and comes off the
 * shelf in the same breath, so the register and the balance never disagree.
 */
beforeEach(function () {
    $this->ledger = app(StockLedger::class);
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    $this->store = Warehouse::main();
});

/* ── UPS units ───────────────────────────────────────────── */

it('draws a UPS off the shelf and copies its nameplate when installed', function () {
    $item = Item::factory()->create([
        'name' => 'UPS 20kVA', 'category' => 'ups',
        'specs' => ['brand' => 'Socomec', 'model' => 'ITYS', 'capacity' => '20 kVA'],
    ]);
    $this->ledger->receive($item, $this->store, 3, 50000, $this->manager);

    actingAs($this->manager)->postJson('/api/assets', [
        'customer_id' => $this->customer->id,
        'item_id' => $item->id,
        'serial' => 'SN-EX-1',
    ])->assertCreated();

    $asset = Asset::firstWhere('serial', 'SN-EX-1');

    expect($asset->item_id)->toBe($item->id)
        // Nameplate carried down from the catalogue.
        ->and($asset->brand)->toBe('Socomec')
        ->and($asset->capacity)->toBe('20 kVA')
        // One unit gone from the store.
        ->and($item->qtyIn($this->store))->toBe(2.0);
});

it('lets a typed value win over the catalogue nameplate', function () {
    $item = Item::factory()->create([
        'category' => 'ups', 'specs' => ['brand' => 'Socomec', 'capacity' => '20 kVA'],
    ]);
    $this->ledger->receive($item, $this->store, 1, 50000, $this->manager);

    actingAs($this->manager)->postJson('/api/assets', [
        'customer_id' => $this->customer->id,
        'item_id' => $item->id,
        'brand' => 'Eaton',           // overrides the item's Socomec
    ])->assertCreated();

    expect(Asset::latest('id')->first()->brand)->toBe('Eaton');
});

it('refuses to install a UPS that is not on the shelf', function () {
    $item = Item::factory()->create(['category' => 'ups']);   // never received

    actingAs($this->manager)->postJson('/api/assets', [
        'customer_id' => $this->customer->id,
        'item_id' => $item->id,
    ])->assertStatus(422);

    // The register must not keep a unit the balance could not back.
    expect(Asset::count())->toBe(0);
});

it('refuses a catalogue item that is not a UPS', function () {
    $item = Item::factory()->create(['category' => 'spare_part']);
    $this->ledger->receive($item, $this->store, 5, 10, $this->manager);

    actingAs($this->manager)->postJson('/api/assets', [
        'customer_id' => $this->customer->id,
        'item_id' => $item->id,
    ])->assertStatus(422)->assertJsonValidationErrors('item_id');
});

it('registers a device by hand without touching stock', function () {
    // A unit already in the field, logged after the fact, draws nothing down.
    actingAs($this->manager)->postJson('/api/assets', [
        'customer_id' => $this->customer->id,
        'brand' => 'APC', 'serial' => 'OLD-1',
    ])->assertCreated();

    expect(Asset::firstWhere('serial', 'OLD-1')->item_id)->toBeNull();
});

/* ── Battery banks ───────────────────────────────────────── */

it('draws a battery bank off the shelf, its whole count', function () {
    $item = Item::factory()->create([
        'name' => 'بطارية 12V 100Ah', 'category' => 'battery',
        'sell_price' => 2400,
        'specs' => ['brand' => 'CSB', 'capacity_ah' => '100', 'voltage' => '12'],
    ]);
    $this->ledger->receive($item, $this->store, 40, 1500, $this->manager);

    actingAs($this->manager)->postJson('/api/batteries', [
        'customer_id' => $this->customer->id,
        'item_id' => $item->id,
        'count' => 16,
        'installed_on' => now()->toDateString(),
        'life_months' => 24,
    ])->assertCreated();

    $battery = Battery::latest('id')->first();

    expect($battery->item_id)->toBe($item->id)
        ->and($battery->brand)->toBe('CSB')
        ->and((float) $battery->capacity_ah)->toBe(100.0)
        // Priced from the catalogue, costed at the moving average.
        ->and((float) $battery->sell_price)->toBe(2400.0)
        ->and((float) $battery->unit_cost)->toBe(1500.0)
        // Sixteen cells gone from the store.
        ->and($item->qtyIn($this->store))->toBe(24.0);
});

it('refuses a battery bank larger than the shelf holds', function () {
    $item = Item::factory()->create(['category' => 'battery']);
    $this->ledger->receive($item, $this->store, 10, 1500, $this->manager);

    actingAs($this->manager)->postJson('/api/batteries', [
        'customer_id' => $this->customer->id,
        'item_id' => $item->id,
        'count' => 16,   // only 10 in stock
    ])->assertStatus(422);

    expect(Battery::count())->toBe(0);
});

it('refuses a catalogue item that is not a battery', function () {
    $item = Item::factory()->create(['category' => 'ups']);
    $this->ledger->receive($item, $this->store, 5, 10, $this->manager);

    actingAs($this->manager)->postJson('/api/batteries', [
        'customer_id' => $this->customer->id,
        'item_id' => $item->id,
    ])->assertStatus(422)->assertJsonValidationErrors('item_id');
});

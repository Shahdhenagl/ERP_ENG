<?php

use App\Models\Item;
use App\Models\ItemSerial;
use App\Models\Supplier;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\PurchasingService;
use App\Services\SerialRegistry;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->stock = app(StockLedger::class);
    $this->registry = app(SerialRegistry::class);
    $this->purchasing = app(PurchasingService::class);

    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->store = Warehouse::main();

    $this->tracked = Item::factory()->create([
        'name' => 'بطارية 100 أمبير',
        'tracks_serials' => true,
    ]);

    $this->loose = Item::factory()->create(['name' => 'كابل', 'tracks_serials' => false]);
});

/* ── Receiving ───────────────────────────────────────────── */

it('records a unit for every serial on a receipt', function () {
    $this->stock->receive($this->tracked, $this->store, 3, 500, $this->manager, [
        'serials' => ['BAT-001', 'BAT-002', 'BAT-003'],
    ]);

    expect(ItemSerial::where('item_id', $this->tracked->id)->count())->toBe(3)
        ->and(ItemSerial::where('serial', 'BAT-001')->first()->status)->toBe('in_stock')
        ->and(ItemSerial::where('serial', 'BAT-001')->first()->warehouse_id)->toBe($this->store->id);
});

it('refuses a receipt whose serials do not match the quantity', function () {
    // Three units and two labels means one unit nobody can find later.
    $this->stock->receive($this->tracked, $this->store, 3, 500, $this->manager, [
        'serials' => ['BAT-001', 'BAT-002'],
    ]);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses a tracked item with no serials at all', function () {
    $this->stock->receive($this->tracked, $this->store, 2, 500, $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('leaves the count alone when the serials are refused', function () {
    // The two ledgers move in one transaction, so a refusal must not leave the
    // quantity raised with no units behind it.
    try {
        $this->stock->receive($this->tracked, $this->store, 3, 500, $this->manager, [
            'serials' => ['BAT-001'],
        ]);
    } catch (Illuminate\Validation\ValidationException) {
        // expected
    }

    expect((float) $this->tracked->fresh()->totalQty())->toBe(0.0)
        ->and(ItemSerial::count())->toBe(0);
});

it('asks nothing of an item that is not tracked', function () {
    $this->stock->receive($this->loose, $this->store, 50, 12, $this->manager);

    expect((float) $this->loose->fresh()->totalQty())->toBe(50.0)
        ->and(ItemSerial::count())->toBe(0);
});

it('refuses the same serial twice in one receipt', function () {
    $this->stock->receive($this->tracked, $this->store, 2, 500, $this->manager, [
        'serials' => ['BAT-001', 'BAT-001'],
    ]);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses a serial already sitting on a shelf', function () {
    // One of the two entries is wrong, and guessing which is worse than saying
    // so out loud.
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);
})->throws(Illuminate\Validation\ValidationException::class);

it('treats a serial as the same unit whatever its spacing and case', function () {
    // Labels are read by people and scanners. «AB-1» and «ab-1 » are one unit.
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['  bat-001  '],
    ]);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Issuing ─────────────────────────────────────────────── */

it('marks the units that left on a job', function () {
    $this->stock->receive($this->tracked, $this->store, 3, 500, $this->manager, [
        'serials' => ['BAT-001', 'BAT-002', 'BAT-003'],
    ]);

    $task = Task::factory()->create();
    $this->stock->issueToTask($this->tracked, $this->store, 2, $task, $this->manager, null, [
        'BAT-001', 'BAT-002',
    ]);

    expect(ItemSerial::where('serial', 'BAT-001')->first()->status)->toBe('issued')
        ->and(ItemSerial::where('serial', 'BAT-003')->first()->status)->toBe('in_stock')
        ->and(ItemSerial::where('item_id', $this->tracked->id)->available()->count())->toBe(1);
});

it('remembers which job a unit went out on', function () {
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $task = Task::factory()->create();
    $this->stock->issueToTask($this->tracked, $this->store, 1, $task, $this->manager, null, ['BAT-001']);

    $unit = ItemSerial::where('serial', 'BAT-001')->first();

    expect($unit->issuedOn->task_id)->toBe($task->id);
});

it('refuses to issue a unit that is already out', function () {
    $this->stock->receive($this->tracked, $this->store, 2, 500, $this->manager, [
        'serials' => ['BAT-001', 'BAT-002'],
    ]);

    $task = Task::factory()->create();
    $this->stock->issueToTask($this->tracked, $this->store, 1, $task, $this->manager, null, ['BAT-001']);
    $this->stock->issueToTask($this->tracked, $this->store, 1, $task, $this->manager, null, ['BAT-001']);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses a serial that was never received', function () {
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $task = Task::factory()->create();
    $this->stock->issueToTask($this->tracked, $this->store, 1, $task, $this->manager, null, ['BAT-999']);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Coming back ─────────────────────────────────────────── */

it('brings a unit back as returned rather than straight onto the shelf', function () {
    // Something that has been out and come back deserves a look before it is
    // sold again, and a status that says so is the cheapest way to force it.
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $task = Task::factory()->create();
    $this->stock->issueToTask($this->tracked, $this->store, 1, $task, $this->manager, null, ['BAT-001']);

    $this->stock->returnFromCustomer($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    expect(ItemSerial::where('serial', 'BAT-001')->first()->status)->toBe('returned');
});

it('lets a returned unit go out again', function () {
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $task = Task::factory()->create();
    $this->stock->issueToTask($this->tracked, $this->store, 1, $task, $this->manager, null, ['BAT-001']);
    $this->stock->returnFromCustomer($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $second = Task::factory()->create();
    $this->stock->issueToTask($this->tracked, $this->store, 1, $second, $this->manager, null, ['BAT-001']);

    expect(ItemSerial::where('serial', 'BAT-001')->first()->status)->toBe('issued');
});

it('takes a scrapped unit out of circulation for good', function () {
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $unit = ItemSerial::where('serial', 'BAT-001')->first();
    $this->registry->scrap($unit, 'انتفخت');

    $task = Task::factory()->create();
    $this->stock->issueToTask($this->tracked, $this->store, 1, $task, $this->manager, null, ['BAT-001']);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Barcodes ────────────────────────────────────────────── */

it('finds an item by its barcode', function () {
    $this->tracked->update(['barcode' => '6221031492015']);

    expect(Item::query()->search('6221031492015')->count())->toBe(1);
});

it('finds an item by one of its serials', function () {
    // A scan on the search box lands on the item whether the code is on the
    // item or on one of its units.
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-XYZ-77'],
    ]);

    expect(Item::query()->search('BAT-XYZ-77')->count())->toBe(1);
});

it('refuses two items sharing a barcode', function () {
    $this->tracked->update(['barcode' => '6221031492015']);

    actingAs($this->manager)
        ->postJson('/api/items', [
            'name' => 'صنف آخر',
            'barcode' => '6221031492015',
            'category' => 'spare_part',
            'unit' => 'قطعة',
        ])
        ->assertStatus(422);
});

/* ── Through the API ─────────────────────────────────────── */

it('receives with serials through the API', function () {
    $supplier = Supplier::create(['name' => 'مورّد']);

    actingAs($this->manager)
        ->postJson('/api/stock/receive', [
            'item_id' => $this->tracked->id,
            'supplier_id' => $supplier->id,
            'qty' => 2,
            'unit_cost' => 500,
            'serials' => ['BAT-A1', 'BAT-A2'],
        ])
        ->assertCreated();

    expect(ItemSerial::count())->toBe(2);
});

it('refuses a mismatched receipt through the API', function () {
    $supplier = Supplier::create(['name' => 'مورّد']);

    actingAs($this->manager)
        ->postJson('/api/stock/receive', [
            'item_id' => $this->tracked->id,
            'supplier_id' => $supplier->id,
            'qty' => 5,
            'unit_cost' => 500,
            'serials' => ['BAT-A1'],
        ])
        ->assertStatus(422);
});

it('lists the units of one item', function () {
    $this->stock->receive($this->tracked, $this->store, 2, 500, $this->manager, [
        'serials' => ['BAT-001', 'BAT-002'],
    ]);

    $response = actingAs($this->manager)
        ->getJson("/api/items/{$this->tracked->id}/serials")
        ->assertOk();

    expect($response->json('data'))->toHaveCount(2)
        ->and($response->json('meta.in_stock'))->toBe(2);
});

it('looks a unit up by its serial alone', function () {
    // What a scanner points at: the holder does not know which item record it
    // belongs to — that is the question, not the input.
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-777'],
    ]);

    $response = actingAs($this->technician)
        ->getJson('/api/serials/lookup?serial=bat-777')
        ->assertOk();

    expect($response->json('data.item'))->toBe('بطارية 100 أمبير')
        ->and($response->json('data.status_label'))->toBe('في المخزن');
});

it('says so plainly when a serial is unknown', function () {
    actingAs($this->technician)
        ->getJson('/api/serials/lookup?serial=NOPE')
        ->assertNotFound();
});

it('scraps a unit through the API', function () {
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    $unit = ItemSerial::first();

    actingAs($this->manager)
        ->postJson("/api/serials/{$unit->id}/scrap", ['reason' => 'انتفخت'])
        ->assertOk()
        ->assertJsonPath('data.status', 'scrapped');
});

it('keeps a technician from scrapping stock', function () {
    $this->stock->receive($this->tracked, $this->store, 1, 500, $this->manager, [
        'serials' => ['BAT-001'],
    ]);

    actingAs($this->technician)
        ->postJson('/api/serials/'.ItemSerial::first()->id.'/scrap', ['reason' => 'x'])
        ->assertForbidden();
});

<?php

use App\Models\Asset;
use App\Models\AssetCustody;
use App\Models\CashBox;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\BillingService;
use App\Services\CustodyService;
use App\Services\StockLedger;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->custody = app(CustodyService::class);
    $this->billing = app(BillingService::class);
    $this->ledger = app(StockLedger::class);

    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create(['name' => 'محمود']);
    $this->other = User::factory()->technician()->create(['name' => 'كريم']);

    $this->treasury = CashBox::default();
    $this->store = Warehouse::main();
});

/** Puts real money in the till through the sales side, so balances are honest. */
function fundTreasury(float $amount): void
{
    $invoice = Invoice::create(['customer_id' => Customer::factory()->create()->id]);
    $invoice->lines()->create([
        'description' => 'خدمة', 'qty' => 1, 'unit_price' => $amount, 'line_total' => $amount,
    ]);

    test()->billing->receivePayment([
        'invoice_id' => test()->billing->issue(test()->billing->recalculate($invoice))->id,
        'cash_box_id' => test()->treasury->id,
        'amount' => $amount,
    ], test()->manager);
}

/* ── Several named stores ────────────────────────────────── */

it('opens a second store beside the first', function () {
    $second = $this->custody->openStore(['name' => 'مخزن الإسكندرية', 'keeper' => 'أ. طارق']);

    expect($second->name)->toBe('مخزن الإسكندرية')
        ->and($second->is_default)->toBeFalse()
        ->and($this->store->fresh()->is_default)->toBeTrue();
});

it('keeps exactly one default store', function () {
    $second = $this->custody->openStore(['name' => 'مخزن ثانٍ']);
    $second->makeDefault();

    expect(Warehouse::where('is_default', true)->count())->toBe(1)
        ->and(Warehouse::main()->id)->toBe($second->id);
});

it('refuses to close a store that still holds stock', function () {
    // Deleting would drop the balance out of the totals with nothing to explain it.
    $second = $this->custody->openStore(['name' => 'مخزن ثانٍ']);
    $item = Item::factory()->create();

    $this->ledger->receive($item, $second, 5, 100, $this->manager);

    expect(fn () => $this->custody->closeStore($second))->toThrow(ValidationException::class);
});

it('refuses to close the default store', function () {
    expect(fn () => $this->custody->closeStore($this->store))->toThrow(ValidationException::class);
});

it('closes an empty store', function () {
    $second = $this->custody->openStore(['name' => 'مخزن فارغ']);

    $this->custody->closeStore($second);

    expect(Warehouse::find($second->id))->toBeNull();
});

/* ── Cash custody ────────────────────────────────────────── */

it('moves money into the technician custody without creating any', function () {
    fundTreasury(5000);

    $this->custody->advanceCash($this->technician, 2000, $this->treasury, $this->manager);

    expect($this->custody->cashBoxFor($this->technician)->balance())->toBe(2000.0)
        ->and($this->treasury->fresh()->balance())->toBe(3000.0);
});

it('takes what the technician spent out of their float', function () {
    fundTreasury(5000);
    $this->custody->advanceCash($this->technician, 2000, $this->treasury, $this->manager);

    $this->custody->spendFromCustody($this->technician, 180, $this->technician, [
        'category' => 'مواصلات',
    ]);

    expect($this->custody->cashBoxFor($this->technician)->balance())->toBe(1820.0);
});

it('refuses to spend more than the technician holds', function () {
    fundTreasury(5000);
    $this->custody->advanceCash($this->technician, 500, $this->treasury, $this->manager);

    expect(fn () => $this->custody->spendFromCustody($this->technician, 900, $this->technician))
        ->toThrow(ValidationException::class);
});

it('returns the unspent balance to the treasury', function () {
    fundTreasury(5000);
    $this->custody->advanceCash($this->technician, 2000, $this->treasury, $this->manager);
    $this->custody->spendFromCustody($this->technician, 500, $this->technician);

    $this->custody->returnCash($this->technician, 1500, $this->treasury, $this->manager);

    expect($this->custody->cashBoxFor($this->technician)->balance())->toBe(0.0)
        ->and($this->treasury->fresh()->balance())->toBe(4500.0);
});

it('leaves the company total unchanged by an advance', function () {
    // The money moved; it did not appear or vanish.
    fundTreasury(5000);
    $before = CashBox::all()->sum(fn (CashBox $b) => $b->balance());

    $this->custody->advanceCash($this->technician, 2000, $this->treasury, $this->manager);

    expect(round(CashBox::all()->sum(fn (CashBox $b) => $b->balance()), 2))->toBe(round($before, 2));
});

it('refuses to hand a float to somebody who is not a technician', function () {
    fundTreasury(5000);

    expect(fn () => $this->custody->advanceCash($this->manager, 100, $this->treasury, $this->manager))
        ->toThrow(ValidationException::class);
});

/* ── Device custody ──────────────────────────────────────── */

it('records who took a device and when', function () {
    $asset = Asset::factory()->create(['customer_id' => Customer::factory()]);

    $custody = $this->custody->takeDevice($asset, $this->technician, $this->manager, [
        'reason' => 'workshop_repair',
        'taken_from' => 'مستشفى الأمل',
    ]);

    expect($custody->isOpen())->toBeTrue()
        ->and($custody->holder->name)->toBe('محمود')
        ->and($custody->reasonLabel())->toBe('إصلاح بالورشة');
});

it('refuses to put one device in two pairs of hands', function () {
    // Two people showing as holding it means nobody is accountable for it.
    $asset = Asset::factory()->create(['customer_id' => Customer::factory()]);

    $this->custody->takeDevice($asset, $this->technician, $this->manager);

    expect(fn () => $this->custody->takeDevice($asset, $this->other, $this->manager))
        ->toThrow(ValidationException::class);
});

it('frees the device once it is handed back', function () {
    $asset = Asset::factory()->create(['customer_id' => Customer::factory()]);

    $custody = $this->custody->takeDevice($asset, $this->technician, $this->manager);
    $this->custody->returnDevice($custody, $this->manager, ['returned_to' => 'مستشفى الأمل']);

    expect($custody->fresh()->isOpen())->toBeFalse();

    // And it can go out again afterwards.
    expect($this->custody->takeDevice($asset, $this->other, $this->manager))->not->toBeNull();
});

it('refuses to hand back a custody already closed', function () {
    $asset = Asset::factory()->create(['customer_id' => Customer::factory()]);
    $custody = $this->custody->takeDevice($asset, $this->technician, $this->manager);

    $this->custody->returnDevice($custody, $this->manager);

    expect(fn () => $this->custody->returnDevice($custody->fresh(), $this->manager))
        ->toThrow(ValidationException::class);
});

/* ── The three together ──────────────────────────────────── */

it('states everything one technician is answerable for', function () {
    fundTreasury(5000);
    $this->custody->advanceCash($this->technician, 2000, $this->treasury, $this->manager);

    $item = Item::factory()->create(['name' => 'بطارية']);
    $van = Warehouse::forTechnician($this->technician);
    $this->ledger->receive($item, $this->store, 10, 900, $this->manager);
    $this->ledger->transfer($item, $this->store, $van, 3, $this->manager);

    $asset = Asset::factory()->create(['customer_id' => Customer::factory()]);
    $this->custody->takeDevice($asset, $this->technician, $this->manager);

    $statement = $this->custody->statementFor($this->technician);

    expect($statement['cash']['balance'])->toBe(2000.0)
        ->and($statement['stock']['lines'])->toHaveCount(1)
        ->and($statement['stock']['value'])->toBe(2700.0)
        ->and($statement['devices'])->toHaveCount(1)
        // One number for how exposed the company is with this person.
        ->and($statement['total_value'])->toBe(4700.0);
});

it('reports an empty custody rather than failing on a technician with none', function () {
    $statement = $this->custody->statementFor($this->other);

    expect($statement['cash']['balance'])->toBe(0.0)
        ->and($statement['stock']['lines'])->toHaveCount(0)
        ->and($statement['devices'])->toHaveCount(0)
        ->and($statement['total_value'])->toBe(0.0);
});

it('lists every active technician on the overview', function () {
    expect($this->custody->allStatements())->toHaveCount(2);
});

/* ── Access ──────────────────────────────────────────────── */

it('lets a manager read the custody overview', function () {
    \Pest\Laravel\actingAs($this->manager)
        ->getJson('/api/custody')
        ->assertOk();
});

it('keeps a technician out of the overview', function () {
    // What everyone else is holding is not their business.
    \Pest\Laravel\actingAs($this->technician)
        ->getJson('/api/custody')
        ->assertForbidden();
});

it('lets a manager hand out a cash advance through the API', function () {
    fundTreasury(5000);

    \Pest\Laravel\actingAs($this->manager)
        ->postJson('/api/custody/cash', [
            'user_id' => $this->technician->id,
            'cash_box_id' => $this->treasury->id,
            'amount' => 1500,
            'direction' => 'advance',
        ])
        ->assertCreated();

    expect($this->custody->cashBoxFor($this->technician)->balance())->toBe(1500.0);
});

it('lets a manager record a device handover through the API', function () {
    $asset = Asset::factory()->create(['customer_id' => Customer::factory()]);

    \Pest\Laravel\actingAs($this->manager)
        ->postJson('/api/custody/devices', [
            'asset_id' => $asset->id,
            'user_id' => $this->technician->id,
            'reason' => 'workshop_repair',
        ])
        ->assertCreated();

    expect(AssetCustody::open()->where('asset_id', $asset->id)->exists())->toBeTrue();
});

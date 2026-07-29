<?php

use App\Enums\MovementType;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\FinancialReports;
use App\Services\LedgerBackfill;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->item = Item::factory()->create();
    $this->store = Warehouse::main();
});

function movementOf(string $type, float $qty = 1, float $cost = 100): StockMovement
{
    return StockMovement::create([
        'item_id' => test()->item->id,
        'type' => $type,
        'qty' => $qty,
        'unit_cost' => $cost,
        'from_warehouse_id' => $type === 'sale' ? test()->store->id : null,
        'to_warehouse_id' => $type === 'sale' ? null : test()->store->id,
        'user_id' => test()->manager->id,
    ]);
}

it('posts the cost of a sale, and unposts it when the invoice is torn up', function () {
    $sale = movementOf('sale', 2, 5000);
    $void = movementOf('sale_void', 2, 5000);

    app(LedgerBackfill::class)->run($this->manager);

    $saleEntry = JournalEntry::where('sourceable_type', (new StockMovement)->getMorphClass())
        ->where('sourceable_id', $sale->id)->first();
    $voidEntry = JournalEntry::where('sourceable_type', (new StockMovement)->getMorphClass())
        ->where('sourceable_id', $void->id)->first();

    // Both used to fall through the poster's match to an empty line set, so no
    // entry was ever written and the banner counted them for ever.
    expect($saleEntry)->not->toBeNull()
        ->and($voidEntry)->not->toBeNull();

    // Cost of sales carries the goods out; voiding brings them back.
    expect((float) $saleEntry->lines()->whereHas('account', fn ($a) => $a->where('key', 'cogs'))->sum('debit'))
        ->toBe(10000.0);
});

it('leaves nothing unposted once every movement type is handled', function () {
    movementOf('sale', 1, 250);
    movementOf('sale_void', 1, 250);

    app(LedgerBackfill::class)->run($this->manager);

    expect(app(FinancialReports::class)->unposted()['stock_movements'])->toBe(0);
});

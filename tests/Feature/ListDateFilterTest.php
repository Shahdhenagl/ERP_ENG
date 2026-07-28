<?php

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

/**
 * The operational lists narrow to a month or a single day — the manager asks
 * "what happened in June" or "what moved today" against the same range the UI's
 * month/day pickers build.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
});

it('filters invoices by their date range', function () {
    $customer = Customer::factory()->create();

    $may = Invoice::create(['customer_id' => $customer->id]);
    $may->forceFill(['issue_date' => '2026-05-10'])->save();

    $june = Invoice::create(['customer_id' => $customer->id]);
    $june->forceFill(['issue_date' => '2026-06-10'])->save();

    $ids = collect(
        actingAs($this->manager)->getJson('/api/invoices?from=2026-06-01&to=2026-06-30')
            ->assertOk()->json('data'),
    )->pluck('id');

    expect($ids)->toContain($june->id)->not->toContain($may->id);
});

it('filters stock movements by their date range', function () {
    $ledger = app(StockLedger::class);
    $item = Item::factory()->create();
    $main = Warehouse::main();

    $old = $ledger->receive($item, $main, 5, 100, $this->manager);
    $old->forceFill(['created_at' => now()->subMonths(2)->toDateTimeString()])->save();

    $recent = $ledger->receive($item, $main, 3, 100, $this->manager);   // today

    $ids = collect(
        actingAs($this->manager)
            ->getJson('/api/stock/movements?from='.now()->startOfMonth()->toDateString())
            ->assertOk()->json('data'),
    )->pluck('id');

    expect($ids)->toContain($recent->id)->not->toContain($old->id);
});

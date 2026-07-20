<?php

use App\Enums\MovementType;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->ledger = app(StockLedger::class);
    $this->actor = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->item = Item::factory()->create();
    $this->main = Warehouse::main();
    $this->van = Warehouse::forTechnician($this->technician);
});

/* ── Weighted moving average ─────────────────────────────── */

it('takes the arriving price as the average for a first receipt', function () {
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);

    expect((float) $this->item->fresh()->avg_cost)->toBe(100.0);
});

it('blends the average across two receipts at different prices', function () {
    // 10 × 100 = 1000, then 10 × 120 = 1200 → 2200 / 20 = 110
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);
    $this->ledger->receive($this->item, $this->main, 10, 120, $this->actor);

    expect((float) $this->item->fresh()->avg_cost)->toBe(110.0);
});

it('weights the average by quantity, not by number of purchases', function () {
    // 90 × 100 = 9000, then 10 × 200 = 2000 → 11000 / 100 = 110
    $this->ledger->receive($this->item, $this->main, 90, 100, $this->actor);
    $this->ledger->receive($this->item, $this->main, 10, 200, $this->actor);

    expect((float) $this->item->fresh()->avg_cost)->toBe(110.0);
});

it('counts stock held in vans when averaging', function () {
    // Otherwise sending goods to a technician would inflate the next average:
    // the stock is still the company's, it has just moved.
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);
    $this->ledger->transfer($this->item, $this->main, $this->van, 10, $this->actor);
    $this->ledger->receive($this->item, $this->main, 10, 120, $this->actor);

    expect((float) $this->item->fresh()->avg_cost)->toBe(110.0);
});

it('leaves the average alone on transfers and issues', function () {
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);
    $this->ledger->transfer($this->item, $this->main, $this->van, 4, $this->actor);

    $task = Task::factory()->create([
        'customer_id' => Customer::factory(),
        'assigned_to' => $this->technician->id,
    ]);

    $this->ledger->issueToTask($this->item, $this->van, 2, $task, $this->technician);

    expect((float) $this->item->fresh()->avg_cost)->toBe(100.0);
});

/* ── Balances ────────────────────────────────────────────── */

it('moves quantity from one place to another without inventing any', function () {
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);
    $this->ledger->transfer($this->item, $this->main, $this->van, 4, $this->actor);

    expect($this->item->qtyIn($this->main))->toBe(6.0)
        ->and($this->item->qtyIn($this->van))->toBe(4.0)
        ->and($this->item->fresh()->totalQty())->toBe(10.0);
});

it('refuses to issue more than the van is holding', function () {
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);
    $this->ledger->transfer($this->item, $this->main, $this->van, 2, $this->actor);

    $task = Task::factory()->create(['customer_id' => Customer::factory()]);

    expect(fn () => $this->ledger->issueToTask($this->item, $this->van, 5, $task, $this->technician))
        ->toThrow(ValidationException::class);

    expect($this->item->qtyIn($this->van))->toBe(2.0);
});

it('refuses to transfer stock that is not there', function () {
    expect(fn () => $this->ledger->transfer($this->item, $this->main, $this->van, 1, $this->actor))
        ->toThrow(ValidationException::class);
});

it('rejects a zero or negative quantity', function (float $qty) {
    expect(fn () => $this->ledger->receive($this->item, $this->main, $qty, 100, $this->actor))
        ->toThrow(ValidationException::class);
})->with([0, -5]);

it('refuses to transfer into the same warehouse', function () {
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);

    expect(fn () => $this->ledger->transfer($this->item, $this->main, $this->main, 1, $this->actor))
        ->toThrow(ValidationException::class);
});

/* ── Cost is frozen onto the movement ────────────────────── */

it('stamps the average in force when the part was used', function () {
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);
    $this->ledger->transfer($this->item, $this->main, $this->van, 5, $this->actor);

    $task = Task::factory()->create(['customer_id' => Customer::factory()]);
    $issue = $this->ledger->issueToTask($this->item, $this->van, 2, $task, $this->technician);

    // A later, pricier purchase must not rewrite what this job cost.
    $this->ledger->receive($this->item, $this->main, 100, 500, $this->actor);

    expect((float) $issue->fresh()->unit_cost)->toBe(100.0)
        ->and($issue->fresh()->value())->toBe(200.0);
});

/* ── Stocktake ───────────────────────────────────────────── */

it('writes the difference when a count disagrees with the book', function () {
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);

    $movement = $this->ledger->adjust($this->item, $this->main, 8, $this->actor, 'جرد شهري');

    expect($this->item->qtyIn($this->main))->toBe(8.0)
        ->and($movement->type)->toBe(MovementType::Adjustment)
        // Positive quantity, direction carried by the warehouse column.
        ->and((float) $movement->qty)->toBe(2.0)
        ->and($movement->from_warehouse_id)->toBe($this->main->id)
        ->and($movement->signedQtyFor($this->main->id))->toBe(-2.0);
});

it('records nothing when the count agrees with the book', function () {
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);

    expect($this->ledger->adjust($this->item, $this->main, 10, $this->actor))->toBeNull();
});

/* ── The ledger explains the balance ─────────────────────── */

it('can rebuild the balance from the movements alone', function () {
    // If these two can drift, neither number is evidence of anything.
    $this->ledger->receive($this->item, $this->main, 10, 100, $this->actor);
    $this->ledger->transfer($this->item, $this->main, $this->van, 4, $this->actor);
    $this->ledger->adjust($this->item, $this->main, 5, $this->actor);

    $task = Task::factory()->create(['customer_id' => Customer::factory()]);
    $this->ledger->issueToTask($this->item, $this->van, 1, $task, $this->technician);

    $replay = fn (Warehouse $w) => round(
        $this->item->movements->sum(fn ($m) => $m->signedQtyFor($w->id)),
        3,
    );

    expect($replay($this->main))->toBe($this->item->qtyIn($this->main))
        ->and($replay($this->van))->toBe($this->item->qtyIn($this->van));
});

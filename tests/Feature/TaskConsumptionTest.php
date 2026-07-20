<?php

use App\Enums\TaskStatus;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

/**
 * Parts reported on a job come out of the technician's own van. The report can
 * be refiled any number of times, so what matters is that stock ends up
 * matching the report — not that each save deducts something.
 */
beforeEach(function () {
    $this->ledger = app(StockLedger::class);
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    $this->item = Item::factory()->battery()->create();
    $this->main = Warehouse::main();
    $this->van = Warehouse::forTechnician($this->technician);

    // Six batteries bought at 100, all handed to the technician.
    $this->ledger->receive($this->item, $this->main, 6, 100, $this->manager);
    $this->ledger->transfer($this->item, $this->main, $this->van, 6, $this->manager);

    $this->task = Task::factory()->create([
        'customer_id' => Customer::factory(),
        'assigned_to' => $this->technician->id,
        'created_by' => $this->manager->id,
        'status' => TaskStatus::InProgress,
    ]);
});

function fileReport(array $parts): \Illuminate\Testing\TestResponse
{
    return actingAs(test()->technician)->postJson("/api/tasks/".test()->task->id."/reports", [
        'type' => 'completion',
        'parts_used' => $parts,
    ]);
}

it('takes reported parts out of the technician van', function () {
    fileReport([['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 2]])->assertCreated();

    expect($this->item->qtyIn($this->van))->toBe(4.0);
});

it('does not deduct twice when the same report is refiled', function () {
    $parts = [['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 2]];

    fileReport($parts)->assertCreated();
    fileReport($parts)->assertCreated();

    expect($this->item->qtyIn($this->van))->toBe(4.0);
});

it('deducts only the difference when the quantity goes up', function () {
    fileReport([['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 2]])->assertCreated();
    fileReport([['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 5]])->assertCreated();

    expect($this->item->qtyIn($this->van))->toBe(1.0);
});

it('puts stock back when the quantity is corrected down', function () {
    fileReport([['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 5]])->assertCreated();
    fileReport([['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 2]])->assertCreated();

    expect($this->item->qtyIn($this->van))->toBe(4.0);
});

it('puts everything back when the line is removed entirely', function () {
    fileReport([['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 3]])->assertCreated();
    fileReport([])->assertCreated();

    expect($this->item->qtyIn($this->van))->toBe(6.0);
});

it('ignores a free-text part that is not a stock item', function () {
    // Bought on the way to site — inventing a movement for it would be a lie.
    fileReport([['name' => 'مسمار من السوق', 'qty' => 4]])->assertCreated();

    expect($this->item->qtyIn($this->van))->toBe(6.0)
        ->and($this->task->fresh()->status)->toBe(TaskStatus::Completed);
});

it('adds up duplicate lines for the same item', function () {
    fileReport([
        ['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 2],
        ['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 1],
    ])->assertCreated();

    expect($this->item->qtyIn($this->van))->toBe(3.0);
});

it('refuses a report claiming more parts than the van holds', function () {
    fileReport([['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 99]])
        ->assertStatus(422);

    // And nothing is half-applied: the job stays open and the van intact.
    expect($this->item->qtyIn($this->van))->toBe(6.0)
        ->and($this->task->fresh()->status)->toBe(TaskStatus::InProgress);
});

it('does not touch stock when a manager files the report', function () {
    // A manager has no van, and did not fit anything.
    actingAs($this->manager)
        ->postJson("/api/tasks/{$this->task->id}/reports", [
            'type' => 'completion',
            'parts_used' => [['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 2]],
        ])
        ->assertCreated();

    expect($this->item->qtyIn($this->van))->toBe(6.0);
});

it('costs the consumption at the average in force', function () {
    fileReport([['item_id' => $this->item->id, 'name' => 'بطارية', 'qty' => 2]])->assertCreated();

    $issue = $this->task->fresh()->id
        ? \App\Models\StockMovement::where('task_id', $this->task->id)->latest('id')->first()
        : null;

    expect((float) $issue->unit_cost)->toBe(100.0)
        ->and($issue->value())->toBe(200.0);
});

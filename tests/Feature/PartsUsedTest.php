<?php

use App\Models\Item;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->ledger = app(StockLedger::class);
    $this->manager = User::factory()->manager()->create();
    $this->main = Warehouse::main();
    $this->item = Item::factory()->create(['name' => 'فيوز 10A']);
    $this->ledger->receive($this->item, $this->main, 50, 20, $this->manager);
});

it('reports parts consumed on jobs, costed and totalled', function () {
    $task = Task::factory()->create();
    $this->ledger->issueToTask($this->item, $this->main, 4, $task, $this->manager);
    // A plain issue with no job behind it must not count as a part used.
    $this->ledger->issue($this->item, $this->main, 2, $this->manager, 'تالف');

    $response = actingAs($this->manager)->getJson('/api/stock/parts-used')->assertOk();

    $rows = $response->json('data');
    expect($rows)->toHaveCount(1)
        ->and($rows[0]['task_code'])->toBe($task->code)
        ->and($rows[0]['qty'])->toEqual(4)
        ->and($rows[0]['value'])->toEqual(80)          // 4 × 20
        ->and($response->json('meta.total_value'))->toEqual(80);
});

it('narrows parts used to one item', function () {
    $other = Item::factory()->create();
    $this->ledger->receive($other, $this->main, 10, 5, $this->manager);
    $task = Task::factory()->create();
    $this->ledger->issueToTask($this->item, $this->main, 1, $task, $this->manager);
    $this->ledger->issueToTask($other, $this->main, 1, $task, $this->manager);

    $rows = actingAs($this->manager)
        ->getJson("/api/stock/parts-used?item_id={$this->item->id}")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['item'])->toBe('فيوز 10A');
});

it('bars a technician from the parts-used report', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/stock/parts-used')->assertForbidden();
});

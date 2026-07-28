<?php

use App\Models\Customer;
use App\Models\Item;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The alerts board reads the live operational conditions, grouped — the same
 * scanner the daily sweep uses — and stays a manager's screen.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
});

it('groups the standing conditions for the board', function () {
    // A part below its reorder level, and a job past its resolution deadline.
    Item::factory()->create(['name' => 'فيوز 32A', 'reorder_level' => 10]);
    Task::factory()->for($this->customer)->create([
        'status' => 'pending', 'resolution_due_at' => now()->subDay(),
    ]);

    $groups = collect(
        actingAs($this->manager)->getJson('/api/alerts')->assertOk()->json('data.groups'),
    );

    expect($groups->firstWhere('key', 'stock'))->not->toBeNull()
        ->and($groups->firstWhere('key', 'stock')['count'])->toBeGreaterThan(0)
        ->and($groups->firstWhere('key', 'stock')['items'][0]['title'])->toContain('نقص')
        ->and($groups->firstWhere('key', 'tasks')['count'])->toBeGreaterThan(0);
});

it('shows a quote waiting on approval under the approvals group', function () {
    $id = actingAs($this->manager)->postJson('/api/quotations', [
        'customer_id' => $this->customer->id,
        'lines' => [['description' => 'UPS', 'qty' => 1, 'unit_price' => 40000]],
    ])->assertCreated()->json('data.id');

    actingAs($this->manager)->postJson("/api/quotations/{$id}/submit")->assertOk();

    $groups = collect(
        actingAs($this->manager)->getJson('/api/alerts')->assertOk()->json('data.groups'),
    );

    expect($groups->firstWhere('key', 'approvals'))->not->toBeNull()
        ->and($groups->firstWhere('key', 'approvals')['count'])->toBeGreaterThan(0);
});

it('returns nothing to act on when all is clear', function () {
    actingAs($this->manager)->getJson('/api/alerts')
        ->assertOk()
        ->assertJsonPath('data.total', 0)
        ->assertJsonPath('data.groups', []);
});

it('keeps the board off a technician', function () {
    actingAs(User::factory()->technician()->create())
        ->getJson('/api/alerts')
        ->assertForbidden();
});

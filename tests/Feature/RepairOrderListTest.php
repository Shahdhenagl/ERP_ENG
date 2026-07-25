<?php

use App\Models\Asset;
use App\Models\Task;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->asset = Asset::factory()->create();
    $this->warranty = Warranty::create([
        'asset_id' => $this->asset->id,
        'customer_id' => $this->asset->customer_id,
        'starts_on' => now()->subMonth()->toDateString(),
        'ends_on' => now()->addMonths(11)->toDateString(),
    ]);
});

function claim(array $attributes = []): WarrantyClaim
{
    return WarrantyClaim::create([
        'warranty_id' => test()->warranty->id,
        'asset_id' => test()->asset->id,
        'reported_on' => now()->toDateString(),
        'fault' => 'عطل',
        'status' => 'open',
        ...$attributes,
    ]);
}

it('lists only claims that reached a repair order', function () {
    $task = Task::factory()->create();
    claim(['status' => 'approved', 'task_id' => $task->id]);   // has a repair order
    claim(['status' => 'open']);                                // does not

    $rows = actingAs($this->manager)
        ->getJson('/api/warranty-claims?has_repair=1')
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['task_id'])->toBe($task->id);
});

it('bars a technician from the repair order list', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/warranty-claims?has_repair=1')->assertForbidden();
});

<?php

use App\Models\ActivityLog;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
});

it('returns the contract amendment trail, contract actions only', function () {
    $contract = Contract::factory()->for($this->customer)->create();

    ActivityLog::record('contract.created', $contract, 'أُنشئ العقد');
    ActivityLog::record('contract.renew', $contract, 'جُدّد العقد');
    // Noise from another module that must not leak in.
    ActivityLog::record('invoice.created', null, 'فاتورة');

    $rows = actingAs($this->manager)
        ->getJson('/api/contracts/activity')
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(2)
        ->and(collect($rows)->pluck('action')->all())
        ->each->toStartWith('contract.');
});

it('narrows the trail to one contract', function () {
    $a = Contract::factory()->for($this->customer)->create();
    $b = Contract::factory()->for($this->customer)->create();
    ActivityLog::record('contract.created', $a, 'A');
    ActivityLog::record('contract.created', $b, 'B');

    $rows = actingAs($this->manager)
        ->getJson("/api/contracts/activity?contract_id={$a->id}")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['contract_id'])->toBe($a->id);
});

it('bars a technician from the contract trail', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/contracts/activity')->assertForbidden();
});

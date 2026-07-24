<?php

use App\Models\Asset;
use App\Models\Battery;
use App\Models\Customer;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create(['name' => 'مستشفى النور']);
    $this->asset = Asset::factory()->create([
        'customer_id' => $this->customer->id,
        'brand' => 'APC',
        'model' => 'Smart-UPS 3000',
    ]);
});

it('registers a battery, inherits the owner, and derives the due date', function () {
    $response = actingAs($this->manager)->postJson('/api/batteries', [
        'asset_id' => $this->asset->id,
        'brand' => 'CSB',
        'installed_on' => '2026-01-10',
        'life_months' => 24,
        'count' => 8,
    ])->assertCreated();

    expect($response->json('data.customer'))->toBe('مستشفى النور')
        ->and($response->json('data.due_at'))->toBe('2028-01-10')   // +24 months
        ->and($response->json('data.code'))->toStartWith('BT-')
        ->and($response->json('data.status'))->toBe('active');
});

it('lists the banks due within a window, overdue included', function () {
    // Due long ago.
    Battery::create([
        'asset_id' => $this->asset->id, 'installed_on' => now()->subMonths(30), 'life_months' => 24,
    ]);
    // Fresh, nowhere near due.
    Battery::create([
        'asset_id' => $this->asset->id, 'installed_on' => now(), 'life_months' => 24,
    ]);

    $rows = actingAs($this->manager)
        ->getJson('/api/batteries?due_within=30')
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['is_overdue'])->toBeTrue();
});

it('replaces a bank by chaining a new one and closing the old', function () {
    $old = Battery::create([
        'asset_id' => $this->asset->id, 'installed_on' => now()->subMonths(26), 'life_months' => 24,
        'brand' => 'CSB', 'count' => 8,
    ]);

    $response = actingAs($this->manager)
        ->postJson("/api/batteries/{$old->id}/replace", ['installed_on' => '2026-08-01'])
        ->assertCreated();

    $newId = $response->json('data.id');
    $old->refresh();

    expect($old->status->value)->toBe('replaced')
        ->and($old->replaced_by_id)->toBe($newId)
        ->and($response->json('data.brand'))->toBe('CSB')      // specs inherited
        ->and($response->json('data.count'))->toBe(8)
        ->and($response->json('data.status'))->toBe('active');
});

it('refuses to replace a bank that is not in service', function () {
    $old = Battery::create([
        'asset_id' => $this->asset->id, 'installed_on' => now(), 'life_months' => 24,
        'status' => 'faulty',
    ]);

    actingAs($this->manager)->postJson("/api/batteries/{$old->id}/replace")->assertStatus(422);
});

it('bars a technician from managing batteries', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->postJson('/api/batteries', ['asset_id' => $this->asset->id])
        ->assertForbidden();
});

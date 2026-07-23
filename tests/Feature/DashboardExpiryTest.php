<?php

use App\Models\Asset;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\User;
use App\Services\WarrantyService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
});

/* ── Cover about to lapse ────────────────────────────────── */

it('surfaces a warranty about to expire on the dashboard', function () {
    // Money waiting to be asked for: an extension is sellable while the term is
    // running out, and worthless the day after.
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    app(WarrantyService::class)->register([
        'asset_id' => $asset->id,
        'ends_on' => now()->addDays(20)->toDateString(),
    ], $this->manager);

    $response = actingAs($this->manager)->getJson('/api/dashboard')->assertOk();

    expect($response->json('warranties_expiring'))->toHaveCount(1)
        ->and($response->json('warranties_expiring.0.days_remaining'))->toBeLessThanOrEqual(20)
        ->and($response->json('stats.warranties_expiring'))->toBe(1);
});

it('leaves cover with plenty of time off the alert', function () {
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    app(WarrantyService::class)->register([
        'asset_id' => $asset->id,
        'months' => 24,
    ], $this->manager);

    expect(actingAs($this->manager)->getJson('/api/dashboard')->json('warranties_expiring'))
        ->toHaveCount(0);
});

it('surfaces a contract about to expire', function () {
    Contract::factory()->create([
        'customer_id' => $this->customer->id,
        'status' => 'active',
        'starts_on' => now()->subYear(),
        'ends_on' => now()->addDays(30),
    ]);

    $response = actingAs($this->manager)->getJson('/api/dashboard')->assertOk();

    expect($response->json('contracts_expiring'))->toHaveCount(1);
});

it('does not compute the alerts for a technician', function () {
    // The dashboard payload is scoped, and a field user is never shown the
    // office's chase lists.
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);
    app(WarrantyService::class)->register([
        'asset_id' => $asset->id,
        'ends_on' => now()->addDays(10)->toDateString(),
    ], $this->manager);

    $response = actingAs($this->technician)->getJson('/api/dashboard')->assertOk();

    expect($response->json('warranties_expiring'))->toBeNull()
        ->and($response->json('contracts_expiring'))->toBeNull();
});

<?php

use App\Models\Asset;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->otherTechnician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
});

/* ── Warranty runs from the sale date ────────────────────── */

it('computes the warranty end from the sale date, not the install date', function () {
    $asset = Asset::factory()->create([
        'customer_id' => $this->customer->id,
        'sold_at' => '2026-01-15',
        'installed_at' => '2026-03-20',   // later, and deliberately ignored
        'warranty_months' => 24,
    ]);

    expect($asset->warrantyEndsAt()->toDateString())->toBe('2028-01-15');
});

it('reports a live warranty as in force', function () {
    $asset = Asset::factory()->underWarranty()->create(['customer_id' => $this->customer->id]);

    expect($asset->isUnderWarranty())->toBeTrue()
        ->and($asset->warrantyLabel())->toBe('ساري');
});

it('reports a lapsed warranty as expired', function () {
    $asset = Asset::factory()->warrantyExpired()->create(['customer_id' => $this->customer->id]);

    expect($asset->isUnderWarranty())->toBeFalse()
        ->and($asset->warrantyLabel())->toBe('منتهي');
});

it('keeps an unknown warranty distinct from an expired one', function () {
    // A device bought before the system existed has no sale date. Calling that
    // "expired" would wrongly bill the customer for a covered repair.
    $asset = Asset::factory()->create([
        'customer_id' => $this->customer->id,
        'sold_at' => null,
        'warranty_months' => null,
    ]);

    expect($asset->isUnderWarranty())->toBeNull()
        ->and($asset->warrantyLabel())->toBe('غير محدد');
});

it('filters the list down to devices still in warranty', function () {
    Asset::factory()->underWarranty()->create(['customer_id' => $this->customer->id]);
    Asset::factory()->warrantyExpired()->create(['customer_id' => $this->customer->id]);
    Asset::factory()->create(['customer_id' => $this->customer->id]);   // unknown

    actingAs($this->manager)
        ->getJson('/api/assets?under_warranty=1')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

/* ── Identity ────────────────────────────────────────────── */

it('assigns each device a unique, increasing code', function () {
    $first = Asset::factory()->create(['customer_id' => $this->customer->id]);
    $second = Asset::factory()->create(['customer_id' => $this->customer->id]);

    // The contract is uniqueness and order, not adjacency: the code is derived
    // from max(id) before the insert, and MySQL's auto-increment can already be
    // ahead of that — so consecutive rows may legitimately skip numbers.
    expect($first->code)->toMatch('/^AS-\d{4,}$/')
        ->and($second->code)->toMatch('/^AS-\d{4,}$/')
        ->and((int) substr($second->code, 3))->toBeGreaterThan((int) substr($first->code, 3));
});

it('refuses a duplicate serial', function () {
    Asset::factory()->create(['customer_id' => $this->customer->id, 'serial' => 'DUP-001']);

    actingAs($this->manager)
        ->postJson('/api/assets', [
            'customer_id' => $this->customer->id,
            'serial' => 'DUP-001',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('serial');
});

it('allows several devices with no serial yet', function () {
    // Unique columns treat NULL as distinct, but this is worth pinning: a batch
    // arriving before anyone records serials must not collide.
    Asset::factory()->create(['customer_id' => $this->customer->id, 'serial' => null]);

    actingAs($this->manager)
        ->postJson('/api/assets', ['customer_id' => $this->customer->id, 'serial' => null])
        ->assertCreated();
});

/* ── A job may only point at its own customer's device ───── */

it('rejects attaching a device owned by a different customer', function () {
    $otherCustomer = Customer::factory()->create();
    $foreignAsset = Asset::factory()->create(['customer_id' => $otherCustomer->id]);

    actingAs($this->manager)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'asset_id' => $foreignAsset->id,
            'title' => 'صيانة',
            'type' => 'maintenance',
            'priority' => 'normal',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('asset_id');
});

it('accepts a device the customer actually owns', function () {
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    actingAs($this->manager)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'asset_id' => $asset->id,
            'title' => 'صيانة',
            'type' => 'maintenance',
            'priority' => 'normal',
        ])
        ->assertCreated()
        ->assertJsonPath('asset_id', $asset->id);
});

/* ── Service history ─────────────────────────────────────── */

it('returns the full service history for a device', function () {
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    Task::factory()->count(3)->create([
        'customer_id' => $this->customer->id,
        'asset_id' => $asset->id,
    ]);

    actingAs($this->manager)
        ->getJson("/api/assets/{$asset->id}")
        ->assertOk()
        ->assertJsonPath('data.tasks_count', 3)
        ->assertJsonCount(3, 'data.tasks');
});

/* ── Access control ──────────────────────────────────────── */

it('stops a technician browsing the whole registry', function () {
    actingAs($this->technician)->getJson('/api/assets')->assertForbidden();
});

it('stops a technician creating or editing devices', function () {
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    actingAs($this->technician)
        ->postJson('/api/assets', ['customer_id' => $this->customer->id])
        ->assertForbidden();

    actingAs($this->technician)
        ->putJson("/api/assets/{$asset->id}", ['customer_id' => $this->customer->id])
        ->assertForbidden();
});

it('lets a technician open a device they are dispatched to', function () {
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    Task::factory()->create([
        'customer_id' => $this->customer->id,
        'asset_id' => $asset->id,
        'assigned_to' => $this->technician->id,
    ]);

    actingAs($this->technician)->getJson("/api/assets/{$asset->id}")->assertOk();
});

it('hides a device from a technician who was never sent to it', function () {
    // Otherwise a technician could walk the id space and read every
    // customer's equipment list.
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    Task::factory()->create([
        'customer_id' => $this->customer->id,
        'asset_id' => $asset->id,
        'assigned_to' => $this->otherTechnician->id,
    ]);

    actingAs($this->technician)->getJson("/api/assets/{$asset->id}")->assertForbidden();
});

/* ── Deletion ────────────────────────────────────────────── */

it('refuses to delete a device that has service history', function () {
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);
    Task::factory()->create(['customer_id' => $this->customer->id, 'asset_id' => $asset->id]);

    actingAs($this->manager)
        ->deleteJson("/api/assets/{$asset->id}")
        ->assertStatus(422);

    expect(Asset::find($asset->id))->not->toBeNull();
});

it('deletes a device that was never worked on', function () {
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    actingAs($this->manager)->deleteJson("/api/assets/{$asset->id}")->assertOk();

    expect(Asset::find($asset->id))->toBeNull();
});

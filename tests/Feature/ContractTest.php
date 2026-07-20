<?php

use App\Enums\ContractStatus;
use App\Models\Asset;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
});

/* ── Access control ─────────────────────────────────────── */

it('keeps contracts away from technicians', function () {
    // Commercial terms are not a technician's business — they see the SLA on
    // their own job and nothing else.
    actingAs($this->technician)->getJson('/api/contracts')->assertForbidden();
    actingAs($this->technician)->postJson('/api/contracts', [])->assertForbidden();
});

/* ── Creating ───────────────────────────────────────────── */

it('creates a contract with a sequential code', function () {
    actingAs($this->manager)
        ->postJson('/api/contracts', [
            'customer_id' => $this->customer->id,
            'title' => 'عقد صيانة سنوي',
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addYear()->toDateString(),
            'visits_per_year' => 4,
            'sla_response_hours' => 4,
            'sla_resolution_hours' => 24,
        ])
        ->assertCreated()
        // store() returns the resource unwrapped, as every other entity does.
        ->assertJsonPath('code', 'CT-'.now()->year.'-0001')
        ->assertJsonPath('status', 'draft');
});

it('starts a contract as a draft so nothing is planned before it is signed off', function () {
    actingAs($this->manager)
        ->postJson('/api/contracts', [
            'customer_id' => $this->customer->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addYear()->toDateString(),
            'visits_per_year' => 4,
        ])
        ->assertCreated()
        ->assertJsonPath('visits_count', 0);
});

it('refuses a term that ends before it starts', function () {
    actingAs($this->manager)
        ->postJson('/api/contracts', [
            'customer_id' => $this->customer->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->subMonth()->toDateString(),
            'visits_per_year' => 4,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('ends_on');
});

it('refuses two live contracts covering the same customer at the same time', function () {
    Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => now()->subMonth()->toDateString(),
        'ends_on' => now()->addMonths(6)->toDateString(),
    ]);

    // Which SLA applies would otherwise be a coin toss.
    actingAs($this->manager)
        ->postJson('/api/contracts', [
            'customer_id' => $this->customer->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addYear()->toDateString(),
            'visits_per_year' => 4,
            'status' => 'active',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('starts_on');
});

it('refuses to cover devices belonging to someone else', function () {
    $foreign = Asset::factory()->create();

    actingAs($this->manager)
        ->postJson('/api/contracts', [
            'customer_id' => $this->customer->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addYear()->toDateString(),
            'visits_per_year' => 4,
            'asset_ids' => [$foreign->id],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('asset_ids');
});

it('covers specific devices when asked to', function () {
    $assets = Asset::factory()->count(2)->for($this->customer)->create();

    actingAs($this->manager)
        ->postJson('/api/contracts', [
            'customer_id' => $this->customer->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addYear()->toDateString(),
            'visits_per_year' => 4,
            'asset_ids' => $assets->pluck('id')->all(),
        ])
        ->assertCreated()
        ->assertJsonPath('assets_count', 2);
});

/* ── Derived status ─────────────────────────────────────── */

it('reports an elapsed term as expired without anything having to flip it', function () {
    // Nothing on this host runs on a timer, so expiry has to be a fact about
    // today rather than a stored state someone forgot to update.
    $contract = Contract::factory()->expired()->for($this->customer)->create();

    actingAs($this->manager)
        ->getJson("/api/contracts/{$contract->id}")
        ->assertOk()
        ->assertJsonPath('data.status', 'active')
        ->assertJsonPath('data.effective_status', 'expired');
});

it('reports a term that has not begun as not yet started', function () {
    $contract = Contract::factory()->for($this->customer)->create([
        'status' => ContractStatus::Active,
        'starts_on' => now()->addMonth()->toDateString(),
        'ends_on' => now()->addYear()->toDateString(),
    ]);

    actingAs($this->manager)
        ->getJson("/api/contracts/{$contract->id}")
        ->assertOk()
        ->assertJsonPath('data.effective_status', 'scheduled');
});

/* ── Lifecycle ──────────────────────────────────────────── */

it('will not bring a cancelled contract back to life', function () {
    $contract = Contract::factory()->cancelled()->for($this->customer)->create();

    actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/activate")
        ->assertStatus(422)
        ->assertJsonValidationErrors('status');
});

/* ── Deleting ───────────────────────────────────────────── */

it('refuses to delete a contract with work still open under it', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create();
    Task::factory()->for($this->customer)->create(['contract_id' => $contract->id]);

    actingAs($this->manager)
        ->deleteJson("/api/contracts/{$contract->id}")
        ->assertStatus(422);
});

it('deletes a contract nobody has worked under', function () {
    $contract = Contract::factory()->for($this->customer)->create();

    actingAs($this->manager)
        ->deleteJson("/api/contracts/{$contract->id}")
        ->assertOk();

    expect(Contract::query()->whereKey($contract->id)->exists())->toBeFalse();
});

/* ── Listing ────────────────────────────────────────────── */

it('finds a contract by its customer name', function () {
    Contract::factory()->for(Customer::factory()->create(['name' => 'مستشفى الأمل']))->create();
    Contract::factory()->for(Customer::factory()->create(['name' => 'بنك القاهرة']))->create();

    actingAs($this->manager)
        ->getJson('/api/contracts?search=الأمل')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

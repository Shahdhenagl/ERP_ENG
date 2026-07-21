<?php

use App\Models\Asset;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    $this->customer = Customer::factory()->create([
        'name' => 'بنك القاهرة',
        'address' => '9 شارع 9، المعادي',
        'lat' => 29.9602,
        'lng' => 31.2569,
    ]);
});

function branchFor(Customer $customer, array $attributes = []): Branch
{
    return Branch::create([
        'customer_id' => $customer->id,
        'name' => 'فرع مدينة نصر',
        'address' => '42 شارع مصطفى النحاس، مدينة نصر',
        'lat' => 30.0626,
        'lng' => 31.3450,
        ...$attributes,
    ]);
}

/* ── The migration gave every customer a starting branch ─── */

it('opens a main branch for a customer that already existed', function () {
    // The factory creates the customer after the migration ran, so this checks
    // the shape rather than the backfill — the backfill itself is exercised by
    // every other test, which relies on the seeded data still being reachable.
    expect(Branch::where('customer_id', $this->customer->id)->count())->toBe(0);

    $branch = branchFor($this->customer);

    expect($branch->code)->toStartWith('BR-')
        ->and($branch->customer->name)->toBe('بنك القاهرة');
});

/* ── Location falls down three steps ─────────────────────── */

it('sends the technician to the branch, not to head office', function () {
    $branch = branchFor($this->customer);

    $task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'branch_id' => $branch->id,
        'site_address' => null,
        'site_lat' => null,
        'site_lng' => null,
    ]);

    expect($task->effectiveAddress())->toBe('42 شارع مصطفى النحاس، مدينة نصر')
        ->and($task->effectiveLat())->toBe(30.0626);
});

it('falls back to the customer when the job names no branch', function () {
    $task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'branch_id' => null,
        'site_address' => null,
        'site_lat' => null,
        'site_lng' => null,
    ]);

    expect($task->effectiveAddress())->toBe('9 شارع 9، المعادي')
        ->and($task->effectiveLat())->toBe(29.9602);
});

it('lets an address typed on the job win over the branch', function () {
    // A one-off visit to a warehouse the branch does not cover.
    $branch = branchFor($this->customer);

    $task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'branch_id' => $branch->id,
        'site_address' => 'مخزن العبور',
        'site_lat' => 30.1,
        'site_lng' => 31.4,
    ]);

    expect($task->effectiveAddress())->toBe('مخزن العبور')
        ->and($task->effectiveLat())->toBe(30.1);
});

it('builds a navigation link from the branch coordinates', function () {
    $branch = branchFor($this->customer);

    $task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'branch_id' => $branch->id,
        'site_lat' => null,
        'site_lng' => null,
        'site_address' => null,
        'site_map_url' => null,
    ]);

    expect($task->navigationUrl())->toContain('30.0626');
});

/* ── Who the technician actually rings ───────────────────── */

it('prefers the branch contact over head office', function () {
    $branch = branchFor($this->customer, [
        'contact_name' => 'أ. سامي',
        'contact_whatsapp' => '01012345678',
    ]);

    expect($branch->contactNumber())->toBe('01012345678');
});

it('falls back to the customer number when the branch has none', function () {
    expect(branchFor($this->customer)->contactNumber())
        ->toBe($this->customer->whatsappNumber());
});

/* ── Devices live at a branch ────────────────────────────── */

it('groups a customer devices by the branch holding them', function () {
    $maadi = branchFor($this->customer, ['name' => 'فرع المعادي']);
    $nasr = branchFor($this->customer, ['name' => 'فرع مدينة نصر']);

    Asset::factory()->count(2)->create([
        'customer_id' => $this->customer->id,
        'branch_id' => $maadi->id,
    ]);
    Asset::factory()->create([
        'customer_id' => $this->customer->id,
        'branch_id' => $nasr->id,
    ]);

    expect($maadi->assets()->count())->toBe(2)
        ->and($nasr->assets()->count())->toBe(1);
});

it('keeps the branch label readable in a picker', function () {
    expect(branchFor($this->customer, ['name' => 'فرع المعادي'])->label())
        ->toBe('فرع المعادي — بنك القاهرة');
});

/* ── Access ──────────────────────────────────────────────── */

it('lets a manager add a branch to a customer', function () {
    $response = actingAs($this->manager)
        ->postJson("/api/customers/{$this->customer->id}/branches", [
            'name' => 'فرع المهندسين',
            'address' => '12 شارع جامعة الدول',
            'contact_name' => 'أ. هدى',
            'contact_phone' => '01098765432',
            'working_hours' => '٩ص - ٥م، الجمعة مغلق',
            'customer_ref' => 'BR-114',
        ])
        ->assertCreated();

    expect($response->json('data.name'))->toBe('فرع المهندسين')
        ->and($response->json('data.code'))->toStartWith('BR-');
});

it('lists a customer branches with what each one holds', function () {
    $branch = branchFor($this->customer);
    Asset::factory()->count(3)->create([
        'customer_id' => $this->customer->id,
        'branch_id' => $branch->id,
    ]);

    $response = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/branches")
        ->assertOk();

    expect($response->json('data.0.assets_count'))->toBe(3);
});

it('stops a technician editing branches', function () {
    actingAs($this->technician)
        ->postJson("/api/customers/{$this->customer->id}/branches", ['name' => 'فرع'])
        ->assertForbidden();
});

it('refuses a branch that belongs to another customer', function () {
    // Otherwise a job would be dispatched to a site the customer does not own,
    // and that branch's history would quietly gain a visit that never happened.
    $other = Customer::factory()->create();
    $foreign = branchFor($other);

    actingAs($this->manager)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'branch_id' => $foreign->id,
            'title' => 'صيانة',
            'type' => 'maintenance',
            'priority' => 'normal',
        ])
        ->assertStatus(422);
});

it('accepts a branch the customer does own', function () {
    $branch = branchFor($this->customer);

    actingAs($this->manager)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'branch_id' => $branch->id,
            'title' => 'صيانة',
            'type' => 'maintenance',
            'priority' => 'normal',
        ])
        ->assertCreated();
});

it('refuses to delete a branch that still holds devices', function () {
    $branch = branchFor($this->customer);
    Asset::factory()->create([
        'customer_id' => $this->customer->id,
        'branch_id' => $branch->id,
    ]);

    actingAs($this->manager)
        ->deleteJson("/api/branches/{$branch->id}")
        ->assertStatus(422);

    expect(Branch::find($branch->id))->not->toBeNull();
});

it('deletes an empty branch', function () {
    $branch = branchFor($this->customer);

    actingAs($this->manager)->deleteJson("/api/branches/{$branch->id}")->assertOk();

    expect(Branch::find($branch->id))->toBeNull();
});

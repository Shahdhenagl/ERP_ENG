<?php

use App\Models\Asset;
use App\Models\Branch;
use App\Models\Contract;
use App\Enums\TaskStatus;
use App\Models\Customer;
use App\Models\Task;
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

it('counts postponed tasks on the dashboard', function () {
    Task::factory()->for($this->customer)->create(['status' => TaskStatus::Postponed]);
    Task::factory()->for($this->customer)->create(['status' => TaskStatus::Pending]);

    expect(actingAs($this->manager)->getJson('/api/dashboard')->json('stats.postponed'))
        ->toBe(1);
});

it('counts assigned incomplete tasks separately from unassigned and finished work', function () {
    Task::factory()->for($this->customer)->assignedTo($this->technician)->count(2)->create([
        'status' => TaskStatus::Pending,
    ]);
    Task::factory()->for($this->customer)->create(['status' => TaskStatus::Pending]);
    Task::factory()->for($this->customer)->assignedTo($this->technician)->create([
        'status' => TaskStatus::Completed,
    ]);
    Task::factory()->for($this->customer)->assignedTo($this->technician)->create([
        'status' => TaskStatus::Cancelled,
    ]);
    Task::factory()->for($this->customer)->assignedTo($this->technician)->create([
        'status' => TaskStatus::Postponed,
    ]);

    $response = actingAs($this->manager)->getJson('/api/dashboard')->assertOk();

    expect($response->json('stats.assigned_incomplete'))->toBe(3)
        ->and($response->json('stats.unassigned'))->toBe(1);
});

it('counts active branches without any task in the selected month and shows the last visit', function () {
    $withoutTasks = Branch::create([
        'customer_id' => $this->customer->id,
        'name' => 'فرع بلا مهام',
        'is_active' => true,
    ]);
    $withTasks = Branch::create([
        'customer_id' => $this->customer->id,
        'name' => 'فرع عليه مهمة',
        'is_active' => true,
    ]);
    Branch::create([
        'customer_id' => $this->customer->id,
        'name' => 'فرع غير نشط',
        'is_active' => false,
    ]);

    Task::factory()->for($this->customer)->create([
        'branch_id' => $withoutTasks->id,
        'status' => TaskStatus::Completed,
        'scheduled_at' => '2026-07-10 09:00:00',
        'completed_at' => '2026-07-10 12:00:00',
    ]);
    Task::factory()->for($this->customer)->create([
        'branch_id' => $withTasks->id,
        'status' => TaskStatus::Pending,
        'scheduled_at' => '2026-08-15 09:00:00',
    ]);

    $body = actingAs($this->manager)
        ->getJson('/api/dashboard?year=2026&month=8')
        ->assertOk()
        ->json();

    expect($body['stats']['branches_without_tasks'])->toBe(1)
        ->and($body['branches_without_tasks'])->toHaveCount(1)
        ->and($body['branches_without_tasks'][0]['name'])->toBe('فرع بلا مهام')
        ->and($body['branches_without_tasks'][0]['last_visit_completed_at'])->toBe('2026-07-10');
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

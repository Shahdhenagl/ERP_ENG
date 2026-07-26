<?php

use App\Enums\TaskStatus;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
});

/* ── A phone belongs to one customer ─────────────────────── */

it('refuses a second customer with the same phone', function () {
    Customer::factory()->create(['phone' => '01000000001']);

    actingAs($this->manager)
        ->postJson('/api/customers', ['name' => 'مكرر', 'phone' => '01000000001'])
        ->assertStatus(422)
        ->assertJsonValidationErrorFor('phone');
});

it('lets a customer keep its own phone on edit', function () {
    $customer = Customer::factory()->create(['phone' => '01000000002', 'name' => 'قديم']);

    actingAs($this->manager)
        ->putJson("/api/customers/{$customer->id}", ['name' => 'جديد', 'phone' => '01000000002'])
        ->assertOk();

    expect($customer->fresh()->name)->toBe('جديد');
});

it('allows many customers with no phone', function () {
    Customer::factory()->create(['phone' => null]);
    Customer::factory()->create(['phone' => null]);

    expect(Customer::whereNull('phone')->count())->toBe(2);
});

/* ── Legal details ───────────────────────────────────────── */

it('stores the English name and the tax and commercial numbers', function () {
    actingAs($this->manager)
        ->postJson('/api/customers', [
            'name' => 'بنك القاهرة',
            'name_en' => 'Banque du Caire',
            'phone' => '01099999999',
            'tax_id' => '123-456-789',
            'commercial_register' => 'CR-88221',
        ])
        ->assertCreated()
        ->assertJsonPath('name_en', 'Banque du Caire')
        ->assertJsonPath('tax_id', '123-456-789')
        ->assertJsonPath('commercial_register', 'CR-88221');
});

it('finds a customer by its English name', function () {
    Customer::factory()->create(['name' => 'بنك القاهرة', 'name_en' => 'Banque du Caire', 'phone' => '01088888888']);

    actingAs($this->manager)
        ->getJson('/api/customers?search=Banque')
        ->assertOk()
        ->assertJsonPath('meta.total', 1);
});

/* ── Type ────────────────────────────────────────────────── */

it('stores and labels a customer type', function () {
    $response = actingAs($this->manager)
        ->postJson('/api/customers', ['name' => 'مستشفى النور', 'phone' => '01111111111', 'type' => 'hospital'])
        ->assertCreated()
        ->assertJsonPath('type', 'hospital')
        ->assertJsonPath('type_label', 'مستشفى');

    expect($response)->not->toBeNull();
});

it('rejects a type outside the catalogue', function () {
    actingAs($this->manager)
        ->postJson('/api/customers', ['name' => 'x', 'phone' => '01222222222', 'type' => 'spaceship'])
        ->assertStatus(422)
        ->assertJsonValidationErrorFor('type');
});

it('filters customers by type', function () {
    Customer::factory()->create(['type' => 'factory', 'name' => 'مصنع أ']);
    Customer::factory()->create(['type' => 'bank', 'name' => 'بنك ب']);

    $names = actingAs($this->manager)
        ->getJson('/api/customers?type=factory')
        ->assertOk()
        ->json('data.*.name');

    expect($names)->toContain('مصنع أ')->not->toContain('بنك ب');
});

/* ── Contract standing ───────────────────────────────────── */

function customerWithContract(?callable $state): Customer
{
    $customer = Customer::factory()->create();
    if ($state) {
        $state(Contract::factory()->for($customer));
    }

    return $customer;
}

it('classifies and filters customers by contract standing', function () {
    $active = Customer::factory()->create(['name' => 'ساري']);
    Contract::factory()->for($active)->create([
        'status' => 'active', 'starts_on' => now()->subMonths(2), 'ends_on' => now()->addDays(300),
    ]);

    $expiring = Customer::factory()->create(['name' => 'قارب']);
    Contract::factory()->for($expiring)->create([
        'status' => 'active', 'starts_on' => now()->subMonths(6), 'ends_on' => now()->addDays(30),
    ]);

    $expired = Customer::factory()->create(['name' => 'منتهي']);
    Contract::factory()->for($expired)->expired()->create();

    $none = Customer::factory()->create(['name' => 'بلا']);

    expect($active->contractStanding())->toBe('active')
        ->and($expiring->contractStanding())->toBe('expiring')
        ->and($expired->contractStanding())->toBe('expired')
        ->and($none->contractStanding())->toBe('none');

    $only = fn (string $standing) => actingAs($this->manager)
        ->getJson("/api/customers?contract={$standing}")
        ->json('data.*.name');

    expect($only('active'))->toContain('ساري')->not->toContain('قارب')->not->toContain('منتهي');
    expect($only('expiring'))->toContain('قارب')->not->toContain('ساري');
    expect($only('expired'))->toContain('منتهي')->not->toContain('ساري');
    expect($only('none'))->toContain('بلا')->not->toContain('ساري');
});

it('attaches contract standing to the list', function () {
    $customer = Customer::factory()->create();
    Contract::factory()->for($customer)->create([
        'status' => 'active', 'starts_on' => now()->subMonth(), 'ends_on' => now()->addDays(20),
    ]);

    actingAs($this->manager)
        ->getJson('/api/customers')
        ->assertOk()
        ->assertJsonPath('data.0.contract_standing', 'expiring')
        ->assertJsonPath('data.0.contract_standing_label', 'قارب على الانتهاء');
});

/* ── Profile ─────────────────────────────────────────────── */

it('serves a customer profile with contracts and a summary', function () {
    $customer = Customer::factory()->create(['name' => 'عميل الملف']);
    Contract::factory()->for($customer)->active()->create();

    actingAs($this->manager)
        ->getJson("/api/customers/{$customer->id}/profile")
        ->assertOk()
        ->assertJsonPath('data.customer.name', 'عميل الملف')
        ->assertJsonPath('data.summary.active_contracts', 1)
        ->assertJsonCount(1, 'data.contracts')
        ->assertJsonStructure(['data' => ['summary' => ['outstanding', 'assets', 'quotations'], 'contracts', 'quotations', 'assets']]);
});

it('bars a technician from the profile', function () {
    $customer = Customer::factory()->create();

    actingAs(User::factory()->technician()->create())
        ->getJson("/api/customers/{$customer->id}/profile")
        ->assertForbidden();
});

/* ── Task history ────────────────────────────────────────── */

it('lists a customer job history with a summary', function () {
    $customer = Customer::factory()->create();
    Task::factory()->for($customer)->create(['status' => TaskStatus::Completed, 'scheduled_at' => now()->subDays(3)]);
    Task::factory()->for($customer)->create(['status' => TaskStatus::InProgress, 'scheduled_at' => now()->subDay()]);
    Task::factory()->create(['scheduled_at' => now()]);   // another customer's job

    $body = actingAs($this->manager)
        ->getJson("/api/customers/{$customer->id}/tasks")
        ->assertOk()
        ->json();

    expect($body['data'])->toHaveCount(2)
        ->and($body['meta']['total'])->toBe(2)
        ->and($body['meta']['completed'])->toBe(1)
        ->and($body['meta']['open'])->toBe(1)
        ->and($body['meta']['customer']['id'])->toBe($customer->id);
});

it('orders the history newest first by the effective date', function () {
    $customer = Customer::factory()->create();
    Task::factory()->for($customer)->create(['title' => 'أقدم', 'scheduled_at' => now()->subDays(10)]);
    Task::factory()->for($customer)->create(['title' => 'أحدث', 'scheduled_at' => now()->subDay()]);

    $titles = actingAs($this->manager)
        ->getJson("/api/customers/{$customer->id}/tasks")
        ->json('data.*.title');

    expect($titles)->toBe(['أحدث', 'أقدم']);
});

it('filters the history to a date window', function () {
    $customer = Customer::factory()->create();
    Task::factory()->for($customer)->create(['title' => 'داخل', 'scheduled_at' => '2026-03-15 10:00']);
    Task::factory()->for($customer)->create(['title' => 'قبل', 'scheduled_at' => '2026-01-01 10:00']);
    Task::factory()->for($customer)->create(['title' => 'بعد', 'scheduled_at' => '2026-06-01 10:00']);

    $titles = actingAs($this->manager)
        ->getJson("/api/customers/{$customer->id}/tasks?from=2026-03-01&to=2026-03-31")
        ->assertOk()
        ->json('data.*.title');

    expect($titles)->toBe(['داخل']);
});

it('includes a job with no schedule by its creation date', function () {
    // An unscheduled job still belongs in the history — filed under when it was raised.
    $customer = Customer::factory()->create();
    Task::factory()->for($customer)->create(['title' => 'بلا موعد', 'scheduled_at' => null]);

    $titles = actingAs($this->manager)
        ->getJson("/api/customers/{$customer->id}/tasks")
        ->json('data.*.title');

    expect($titles)->toContain('بلا موعد');
});

it('rejects a to-date before the from-date', function () {
    $customer = Customer::factory()->create();

    actingAs($this->manager)
        ->getJson("/api/customers/{$customer->id}/tasks?from=2026-05-01&to=2026-04-01")
        ->assertStatus(422)
        ->assertJsonValidationErrorFor('to');
});

it('bars a technician from the job history', function () {
    $customer = Customer::factory()->create();

    actingAs(User::factory()->technician()->create())
        ->getJson("/api/customers/{$customer->id}/tasks")
        ->assertForbidden();
});

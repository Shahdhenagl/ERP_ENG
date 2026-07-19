<?php

use App\Models\Customer;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\getJson;
use function Pest\Laravel\postJson;

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->otherTechnician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
});

/* ── Authentication ──────────────────────────────────────── */

it('rejects unauthenticated requests', function (string $endpoint) {
    getJson($endpoint)->assertUnauthorized();
})->with(['/api/me', '/api/tasks', '/api/dashboard', '/api/customers', '/api/users']);

it('refuses to log in a suspended account', function () {
    $user = User::factory()->technician()->suspended()->create(['email' => 'stop@test.local']);

    postJson('/api/login', ['email' => $user->email, 'password' => 'password'])
        ->assertStatus(422);
});

it('logs in an active account and returns a token', function () {
    $user = User::factory()->manager()->create(['email' => 'go@test.local']);

    postJson('/api/login', ['email' => $user->email, 'password' => 'password'])
        ->assertOk()
        ->assertJsonStructure(['token', 'user' => ['id', 'name', 'role']]);
});

/* ── Dispatcher-only endpoints ───────────────────────────── */

it('stops a technician creating work', function () {
    actingAs($this->technician)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'title' => 'محاولة غير مصرح بها',
            'type' => 'repair',
            'priority' => 'low',
        ])
        ->assertForbidden();
});

it('stops a technician reaching customers or users', function (string $endpoint) {
    actingAs($this->technician)->getJson($endpoint)->assertForbidden();
})->with(['/api/customers', '/api/users', '/api/technicians']);

it('stops a manager administering users', function () {
    actingAs($this->manager)->getJson('/api/users')->assertForbidden();
});

it('lets an admin administer users', function () {
    actingAs($this->admin)->getJson('/api/users')->assertOk();
});

it('lets a manager dispatch work', function () {
    actingAs($this->manager)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'title' => 'صيانة دورية',
            'type' => 'maintenance',
            'priority' => 'normal',
        ])
        ->assertCreated();
});

/* ── Row-level scoping ───────────────────────────────────── */

it('shows a technician only their own jobs', function () {
    Task::factory()->count(3)->assignedTo($this->technician)->create();
    Task::factory()->count(4)->assignedTo($this->otherTechnician)->create();

    actingAs($this->technician)
        ->getJson('/api/tasks')
        ->assertOk()
        ->assertJsonCount(3, 'data');
});

it('shows a manager every job', function () {
    Task::factory()->count(3)->assignedTo($this->technician)->create();
    Task::factory()->count(4)->assignedTo($this->otherTechnician)->create();

    actingAs($this->manager)
        ->getJson('/api/tasks')
        ->assertOk()
        ->assertJsonCount(7, 'data');
});

it("blocks a technician opening someone else's job", function () {
    $task = Task::factory()->assignedTo($this->otherTechnician)->create();

    actingAs($this->technician)->getJson("/api/tasks/{$task->id}")->assertForbidden();
});

it("blocks a technician driving someone else's job", function () {
    $task = Task::factory()->assignedTo($this->otherTechnician)->create();

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'accepted'])
        ->assertForbidden();
});

it("blocks a technician filing a report on someone else's job", function () {
    $task = Task::factory()->assignedTo($this->otherTechnician)->create();

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/reports", ['type' => 'diagnosis'])
        ->assertForbidden();
});

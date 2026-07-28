<?php

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Task;
use App\Models\User;
use App\Notifications\OperationsAlert;
use App\Services\BillingService;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;

/**
 * Anything that needs sign-off pushes a live notification to the managers the
 * moment it is raised, and the board itself carries the standing alerts — the
 * shortages, the delays, the money overdue — a manager acts on.
 */

/* ── Approval notifications reach managers only ──────────── */

it('notifies managers the moment a technician files leave', function () {
    Notification::fake();

    $manager = User::factory()->manager()->create();
    $technician = User::factory()->technician()->create();

    actingAs($technician)->postJson('/api/leave/mine', [
        'type' => 'annual', 'from_date' => '2026-09-06', 'to_date' => '2026-09-06',
    ])->assertCreated();

    Notification::assertSentTo($manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'approval.needed');

    // The person who raised it is not a manager, so it does not come back to them.
    Notification::assertNotSentTo($technician, OperationsAlert::class);
});

it('notifies managers when a quote is submitted for approval', function () {
    Notification::fake();

    $manager = User::factory()->manager()->create();
    $customer = Customer::factory()->create();

    $id = actingAs($manager)->postJson('/api/quotations', [
        'customer_id' => $customer->id,
        'lines' => [['description' => 'UPS', 'qty' => 1, 'unit_price' => 40000]],
    ])->assertCreated()->json('data.id');

    actingAs($manager)->postJson("/api/quotations/{$id}/submit")->assertOk();

    Notification::assertSentTo($manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'approval.needed');
});

/* ── The board's standing alerts ─────────────────────────── */

it('surfaces shortages, delays and overdue invoices on the dashboard', function () {
    $manager = User::factory()->manager()->create();
    $customer = Customer::factory()->create();

    // A part below its reorder level (nothing received, so on-hand is zero).
    Item::factory()->create(['name' => 'فيوز 32A', 'reorder_level' => 10]);

    // A job past its resolution deadline and still open.
    Task::factory()->for($customer)->create([
        'status' => 'pending', 'resolution_due_at' => now()->subDay(),
    ]);

    // An issued invoice past its due date and unpaid.
    $billing = app(BillingService::class);
    $invoice = Invoice::create([
        'customer_id' => $customer->id,
        'issue_date' => now()->subMonth()->toDateString(),
        'due_date' => now()->subWeek()->toDateString(),
    ]);
    $invoice->lines()->create(['description' => 'خدمة', 'qty' => 1, 'unit_price' => 2000, 'line_total' => 2000]);
    $billing->issue($billing->recalculate($invoice));

    $data = actingAs($manager)->getJson('/api/dashboard')->assertOk()->json();

    expect($data['stats']['low_stock'])->toBeGreaterThan(0)
        ->and($data['stats']['delayed'])->toBeGreaterThan(0)
        ->and($data['stats']['overdue_invoices'])->toBeGreaterThan(0)
        ->and($data['low_stock'][0]['name'])->toBe('فيوز 32A')
        ->and($data['overdue_invoices'][0]['code'])->toBe($invoice->code);
});

it('keeps the standing alerts off a technician dashboard', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/dashboard')
        ->assertOk()
        ->assertJsonMissingPath('low_stock');
});

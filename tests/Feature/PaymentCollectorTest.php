<?php

use App\Models\Contract;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\User;

/**
 * A receipt names two people: whoever keyed it in, and whoever took the money.
 * They are the same at a desk and different the moment a technician collects
 * on site — which is exactly the receipt somebody later has to trace.
 */
it('records the employee who took the money, apart from the one who keyed it', function () {
    $clerk = User::factory()->create(['role' => 'admin']);
    $technician = User::factory()->create(['role' => 'technician']);
    $customer = Customer::factory()->create();

    $contract = Contract::factory()->create([
        'customer_id' => $customer->id,
        'status' => 'active',
        'value' => 30000,
    ]);

    $payment = $contract->payments()->create([
        'sequence' => 1, 'amount' => 7500, 'status' => 'due', 'is_upfront' => true,
    ]);

    $this->actingAs($clerk)
        ->postJson("/api/contracts/{$contract->id}/payments/{$payment->id}/collect", [
            'method' => 'cash',
            'collected_by_user_id' => $technician->id,
        ])->assertOk();

    $receipt = Payment::latest('id')->first();

    expect($receipt->user_id)->toBe($clerk->id)
        ->and($receipt->collected_by_user_id)->toBe($technician->id);
});

it('leaves the collector empty when the person keying it took it themselves', function () {
    $clerk = User::factory()->create(['role' => 'admin']);
    $customer = Customer::factory()->create();

    $this->actingAs($clerk)->postJson('/api/payments', [
        'customer_id' => $customer->id,
        'amount' => 500,
        'method' => 'cash',
    ])->assertCreated();

    expect(Payment::latest('id')->first()->collected_by_user_id)->toBeNull();
});

it('gives everyone signed in the roster of colleagues to name', function () {
    // The users index is admin-only, so a treasurer asking it for names got a
    // 403 and a dropdown with nothing in it.
    $treasurer = User::factory()->create(['role' => 'manager', 'position' => 'treasurer']);
    User::factory()->create(['name' => 'محمود الفني', 'role' => 'technician']);

    $roster = $this->actingAs($treasurer)->getJson('/api/staff')->assertOk()->json();

    expect(collect($roster)->pluck('name'))->toContain('محمود الفني')
        ->and(collect($roster)->firstWhere('name', $treasurer->name)['label'])
        ->toBe('أمين الخزنة');

    $this->getJson('/api/users')->assertForbidden();
});

it('names the collector without charging anything to them', function () {
    // Naming somebody on a receipt must not quietly open a custody against
    // them, or move a piastre of their pay. The money lands in the box, and
    // the name is a name.
    $clerk = User::factory()->create(['role' => 'admin']);
    $technician = User::factory()->create(['role' => 'technician']);
    $customer = Customer::factory()->create();
    $box = \App\Models\CashBox::create(['name' => 'درج المكتب', 'type' => 'cash']);

    $this->actingAs($clerk)->postJson('/api/payments', [
        'customer_id' => $customer->id,
        'cash_box_id' => $box->id,
        'amount' => 1200,
        'method' => 'cash',
        'collected_by_user_id' => $technician->id,
    ])->assertCreated();

    expect(round($box->fresh()->balance(), 2))->toBe(1200.0)
        ->and(\App\Models\CashBox::where('user_id', $technician->id)->exists())->toBeFalse()
        ->and(\App\Models\CashMovement::where('responsible_user_id', $technician->id)->exists())
        ->toBeFalse();
});

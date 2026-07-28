<?php

use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * A treasurer keeps the boxes tidy: renaming and closing empty ones, and
 * correcting a receipt's details — while the main till, technicians' floats, and
 * any box with history are protected from deletion.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    // Open the main till first, so boxes created in the tests are separate from
    // it — otherwise the first cash box would itself resolve as the default.
    CashBox::default();
});

it('renames a cash box', function () {
    $box = CashBox::create(['name' => 'حساب قديم', 'type' => 'bank']);

    actingAs($this->manager)->putJson("/api/treasury/boxes/{$box->id}", [
        'name' => 'حساب البنك الأهلي', 'type' => 'bank', 'account_number' => '123',
    ])->assertOk();

    expect($box->fresh()->name)->toBe('حساب البنك الأهلي');
});

it('deletes an empty box', function () {
    $box = CashBox::create(['name' => 'خزينة فارغة', 'type' => 'cash']);

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$box->id}")->assertOk();

    expect(CashBox::find($box->id))->toBeNull();
});

it('refuses to delete a box that has movement', function () {
    $box = CashBox::create(['name' => 'خزينة بها حركة', 'type' => 'cash']);
    CashMovement::create([
        'cash_box_id' => $box->id, 'direction' => 'in', 'amount' => 500, 'source' => 'opening',
    ]);

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$box->id}")->assertStatus(422);

    expect(CashBox::find($box->id))->not->toBeNull();
});

it('refuses to delete the main till', function () {
    $main = CashBox::default();

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$main->id}")->assertStatus(422);
});

it('refuses to touch a technician float from here', function () {
    $tech = User::factory()->technician()->create();
    $float = CashBox::create(['name' => 'عهدة فني', 'type' => 'cash', 'user_id' => $tech->id]);

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$float->id}")->assertStatus(422);
    actingAs($this->manager)->putJson("/api/treasury/boxes/{$float->id}", [
        'name' => 'x', 'type' => 'cash',
    ])->assertStatus(422);
});

it('records an external deposit into a box as income', function () {
    $box = CashBox::default();
    $before = $box->balance();

    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => $box->id,
        'amount' => 1500,
        'party' => 'شركة النور',
        'note' => 'دفعة مقدمة',
    ])->assertCreated();

    // The money is in the box, and it is a receipt, not an expense.
    expect($box->fresh()->balance())->toBe(round($before + 1500, 2));

    $movement = CashMovement::where('source', 'external_deposit')->latest('id')->first();
    expect($movement)->not->toBeNull()
        ->and($movement->direction)->toBe('in')
        ->and($movement->category)->toBe('شركة النور')
        ->and((float) $movement->amount)->toBe(1500.0);
});

it('refuses an external deposit with no party named', function () {
    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => CashBox::default()->id,
        'amount' => 500,
    ])->assertStatus(422);
});

it('keeps external deposits off a technician', function () {
    $tech = User::factory()->technician()->create();

    actingAs($tech)->postJson('/api/treasury/deposit', [
        'cash_box_id' => CashBox::default()->id,
        'amount' => 500,
        'party' => 'جهة',
    ])->assertForbidden();
});

it('corrects a receipt without moving the money', function () {
    $customer = Customer::factory()->create();
    $id = actingAs($this->manager)->postJson('/api/payments', [
        'customer_id' => $customer->id, 'amount' => 700, 'method' => 'cash',
    ])->assertCreated()->json('id');

    $before = CashBox::default()->balance();

    actingAs($this->manager)->putJson("/api/payments/{$id}", [
        'method' => 'instapay', 'note' => 'تصحيح الطريقة',
    ])->assertOk()->assertJsonPath('method_label', 'إنستاباي');

    // The metadata changed; the balance did not.
    expect(CashBox::default()->fresh()->balance())->toBe(round($before, 2));
});

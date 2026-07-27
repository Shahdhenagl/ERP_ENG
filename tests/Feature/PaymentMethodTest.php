<?php

use App\Models\Customer;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * InstaPay and Vodafone Cash are first-class receipt methods now, and a receipt
 * can be pulled on its own for its printable voucher.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create(['name' => 'شركة النور']);
});

it('accepts a receipt paid by Vodafone Cash and labels it', function () {
    $id = actingAs($this->manager)->postJson('/api/payments', [
        'customer_id' => $this->customer->id,
        'amount' => 1500,
        'method' => 'vodafone_cash',
    ])->assertCreated()
        ->assertJsonPath('method', 'vodafone_cash')
        ->assertJsonPath('method_label', 'فودافون كاش')
        ->json('id');

    // And it can be read back on its own for the printable receipt.
    actingAs($this->manager)->getJson("/api/payments/{$id}")
        ->assertOk()
        ->assertJsonPath('data.code', fn ($code) => str_starts_with($code, 'RC-'))
        ->assertJsonPath('data.customer', 'شركة النور')
        ->assertJsonPath('data.method_label', 'فودافون كاش');
});

it('accepts a receipt paid by InstaPay', function () {
    actingAs($this->manager)->postJson('/api/payments', [
        'customer_id' => $this->customer->id,
        'amount' => 800,
        'method' => 'instapay',
    ])->assertCreated()->assertJsonPath('method_label', 'إنستاباي');
});

it('still refuses an invented payment method', function () {
    actingAs($this->manager)->postJson('/api/payments', [
        'customer_id' => $this->customer->id,
        'amount' => 100,
        'method' => 'crypto',
    ])->assertStatus(422)->assertJsonValidationErrors('method');
});

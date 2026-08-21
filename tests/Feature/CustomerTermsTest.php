<?php

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;

/**
 * How an account settles is decided before anything is sold, not inferred from
 * its history — a new customer has none, and inferring it is how somebody ends
 * up extending credit that was never granted.
 */
beforeEach(function () {
    $this->actingAs(User::factory()->create(['role' => 'admin']));
});

it('opens an account on cash terms unless told otherwise', function () {
    $response = $this->postJson('/api/customers', ['name' => 'شركة النيل', 'phone' => '01000000001'])->assertCreated();

    expect($response->json('payment_terms'))->toBe('cash')
        ->and($response->json('payment_terms_label'))->toBe('نقدي');
});

it('records an account as buying on credit', function () {
    $response = $this->postJson('/api/customers', [
        'name' => 'البنك الأهلي',
        'phone' => '01000000002',
        'payment_terms' => 'credit',
    ])->assertCreated();

    expect($response->json('payment_terms_label'))->toBe('آجل');
});

it('narrows the list to one set of terms', function () {
    Customer::factory()->create(['payment_terms' => 'credit']);
    Customer::factory()->create(['payment_terms' => 'cash']);
    Customer::factory()->create(['payment_terms' => 'cash']);

    expect($this->getJson('/api/customers?payment_terms=credit')->json('data'))->toHaveCount(1)
        ->and($this->getJson('/api/customers?payment_terms=cash')->json('data'))->toHaveCount(2);
});

it('refuses terms it does not recognise', function () {
    $this->postJson('/api/customers', ['name' => 'شركة', 'phone' => '01000000003', 'payment_terms' => 'barter'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('payment_terms');
});

it('reports what was collected beside what is still owed', function () {
    $customer = Customer::factory()->create();

    $invoice = Invoice::create([
        'customer_id' => $customer->id,
        'issue_date' => now()->toDateString(),
        'due_date' => now()->toDateString(),
        'status' => 'issued',
        'subtotal' => 1000,
        'total' => 1000,
        'tax_rate' => 0,
    ]);

    $this->postJson('/api/payments', [
        'invoice_id' => $invoice->id,
        'amount' => 400,
        'method' => 'cash',
    ])->assertCreated();

    $summary = $this->getJson('/api/customers')->assertOk()->json('summary');

    // Debt on its own says nothing about the month: the same balance means one
    // thing after heavy collection and another after none.
    expect((float) $summary['collected'])->toBe(400.0)
        ->and((float) $summary['outstanding'])->toBe(600.0)
        ->and($summary)->toHaveKey('returned');
});

it('returns a clear phone field error when a customer phone is already used', function () {
    Customer::factory()->create(['phone' => '01008021337']);

    $this->postJson('/api/customers', [
        'name' => 'عميل مكرر',
        'phone' => '01008021337',
    ])
        ->assertUnprocessable()
        ->assertJsonPath('errors.phone.0', 'رقم الهاتف مستخدم بالفعل لعميل آخر. استخدم رقمًا مختلفًا.');
});

it('returns a clear phone field error when changing to another customer phone', function () {
    $target = Customer::factory()->create(['phone' => '01008021338']);
    $other = Customer::factory()->create(['phone' => '01008021339']);

    $this->putJson("/api/customers/{$target->id}", [
        'name' => $target->name,
        'phone' => $other->phone,
    ])
        ->assertUnprocessable()
        ->assertJsonPath('errors.phone.0', 'رقم الهاتف مستخدم بالفعل لعميل آخر. استخدم رقمًا مختلفًا.');
});

it('does not allow reusing a phone held by a soft deleted customer', function () {
    $deleted = Customer::factory()->create(['phone' => '01008021340']);
    $deleted->delete();

    $this->postJson('/api/customers', [
        'name' => 'عميل بعد الحذف',
        'phone' => '01008021340',
    ])
        ->assertUnprocessable()
        ->assertJsonPath('errors.phone.0', 'رقم الهاتف مستخدم بالفعل لعميل آخر. استخدم رقمًا مختلفًا.');
});

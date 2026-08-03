<?php

use App\Models\User;
use App\Support\Terms;

/**
 * The moment somebody is stuck is the worst moment to answer them in a
 * language the screen around them does not use.
 */
beforeEach(function () {
    Terms::flush();
    $this->actingAs(User::factory()->create(['role' => 'admin']));
});

it('answers a bad form in Arabic, naming the field as the screen does', function () {
    // Without lang/ar Laravel falls back to its own English, so a clerk filling
    // an Arabic form wrong was told "The name field is required."
    $errors = $this->postJson('/api/customers', [])
        ->assertStatus(422)
        ->json('errors');

    expect($errors['name'][0])->toContain('مطلوب')
        ->and($errors['name'][0])->toContain('الاسم')
        ->and($errors['phone'][0])->toContain('الهاتف');
});

it('answers a bad form in English when the caller reads English', function () {
    $errors = $this->withHeader('X-App-Locale', 'en')
        ->postJson('/api/customers', [])
        ->assertStatus(422)
        ->json('errors');

    expect($errors['name'][0])->toContain('required');
});

it('refuses in the caller’s language, not only in Arabic', function () {
    $customer = \App\Models\Customer::factory()->create();

    \App\Models\Task::factory()->create([
        'customer_id' => $customer->id,
        'status' => 'pending',
    ]);

    $arabic = $this->deleteJson("/api/customers/{$customer->id}")
        ->assertStatus(422)
        ->json('message');

    $english = $this->withHeader('X-App-Locale', 'en')
        ->deleteJson("/api/customers/{$customer->id}")
        ->assertStatus(422)
        ->json('message');

    expect($arabic)->toBe('لا يمكن حذف عميل لديه مهام مفتوحة.')
        ->and($english)->toBe('A customer with open tasks cannot be deleted.');
});

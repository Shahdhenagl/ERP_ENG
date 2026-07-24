<?php

use App\Models\Contact;
use App\Models\Customer;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create(['name' => 'بنك القاهرة']);
});

it('adds a contact to a customer and gives it a code', function () {
    $response = actingAs($this->manager)
        ->postJson("/api/customers/{$this->customer->id}/contacts", [
            'name' => 'م. أحمد سالم',
            'job_title' => 'مدير الصيانة',
            'phone' => '01000000000',
        ])
        ->assertCreated();

    expect($response->json('data.name'))->toBe('م. أحمد سالم')
        ->and($response->json('data.customer'))->toBe('بنك القاهرة')
        ->and($response->json('data.code'))->toStartWith('CT-');
});

it('lists a customer contacts with the primary first', function () {
    Contact::create(['customer_id' => $this->customer->id, 'name' => 'محمد', 'is_primary' => false]);
    Contact::create(['customer_id' => $this->customer->id, 'name' => 'سالم', 'is_primary' => true]);

    $rows = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/contacts")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(2)
        ->and($rows[0]['name'])->toBe('سالم')
        ->and($rows[0]['is_primary'])->toBeTrue();
});

it('keeps one primary per customer', function () {
    $first = Contact::create([
        'customer_id' => $this->customer->id, 'name' => 'الأول', 'is_primary' => true,
    ]);

    actingAs($this->manager)->postJson("/api/customers/{$this->customer->id}/contacts", [
        'name' => 'الثاني',
        'is_primary' => true,
    ])->assertCreated();

    expect($first->fresh()->is_primary)->toBeFalse()
        ->and(Contact::where('customer_id', $this->customer->id)->where('is_primary', true)->count())
        ->toBe(1);
});

it('scopes a contact directory to one customer', function () {
    $other = Customer::factory()->create();
    Contact::create(['customer_id' => $this->customer->id, 'name' => 'لنا']);
    Contact::create(['customer_id' => $other->id, 'name' => 'لغيرنا']);

    $rows = actingAs($this->manager)
        ->getJson("/api/contacts?customer_id={$this->customer->id}")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['name'])->toBe('لنا');
});

it('bars a technician from the contacts', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)
        ->postJson("/api/customers/{$this->customer->id}/contacts", ['name' => 'x'])
        ->assertForbidden();
});

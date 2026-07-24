<?php

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Quotation;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create(['name' => 'مصنع النور']);
});

it('merges a customer dealings into one date-sorted stream', function () {
    Quotation::create([
        'customer_id' => $this->customer->id,
        'issue_date' => '2026-01-10',
        'created_by' => $this->manager->id,
    ]);
    $invoice = Invoice::create([
        'customer_id' => $this->customer->id,
        'issue_date' => '2026-03-01',
        'status' => 'issued',
        'created_by' => $this->manager->id,
    ]);

    $response = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/timeline")
        ->assertOk();

    $rows = $response->json('data');

    // Newest first: the March invoice leads the January quote.
    expect($rows)->toHaveCount(2)
        ->and($rows[0]['type'])->toBe('invoice')
        ->and($rows[0]['date'])->toBe('2026-03-01')
        ->and($rows[1]['type'])->toBe('quotation')
        ->and($response->json('meta.customer.name'))->toBe('مصنع النور');
});

it('leaves draft invoices off the timeline', function () {
    Invoice::create([
        'customer_id' => $this->customer->id,
        'issue_date' => '2026-03-01',
        'status' => 'draft',
        'created_by' => $this->manager->id,
    ]);

    $rows = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/timeline")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(0);
});

it('bars a technician from a customer timeline', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson("/api/customers/{$this->customer->id}/timeline")
        ->assertForbidden();
});

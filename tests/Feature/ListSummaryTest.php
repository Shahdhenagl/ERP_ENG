<?php

use App\Models\Contract;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use App\Services\BillingService;

use function Pest\Laravel\actingAs;

/**
 * The strip of headline figures above a module's list — computed over the whole
 * module, not the page in view.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
});

it('summarises the customer list with the money owed', function () {
    $customer = Customer::factory()->create();
    Customer::factory()->create(['is_active' => false]);

    // A 1,000 invoice, 400 collected → 600 outstanding.
    $billing = app(BillingService::class);
    $invoice = Invoice::create(['customer_id' => $customer->id, 'issue_date' => now()->toDateString()]);
    $invoice->lines()->create(['description' => 'خدمة', 'qty' => 1, 'unit_price' => 1000, 'line_total' => 1000]);
    $billing->issue($billing->recalculate($invoice));
    $billing->receivePayment(['invoice_id' => $invoice->id, 'amount' => 400], $this->manager);

    $summary = actingAs($this->manager)->getJson('/api/customers')->assertOk()->json('summary');

    expect($summary['total'])->toBe(2)
        ->and($summary['active'])->toBe(1)
        ->and($summary['outstanding'])->toEqual(600);
});

it('summarises the contract list with active count and value', function () {
    $customer = Customer::factory()->create();

    Contract::factory()->create([
        'customer_id' => $customer->id, 'status' => 'active',
        'starts_on' => now()->subMonth(), 'ends_on' => now()->addYear(), 'value' => 12000,
    ]);
    Contract::factory()->create([
        'customer_id' => $customer->id, 'status' => 'cancelled', 'value' => 5000,
    ]);

    $summary = actingAs($this->manager)->getJson('/api/contracts')->assertOk()->json('summary');

    expect($summary['active'])->toBe(1)
        ->and($summary['annual_value'])->toEqual(12000);
});

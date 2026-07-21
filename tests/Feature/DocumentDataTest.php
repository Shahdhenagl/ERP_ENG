<?php

use App\Models\CashBox;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Setting;
use App\Models\User;
use App\Services\BillingService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->billing = app(BillingService::class);
    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
    $this->box = CashBox::default();
});

function invoiceFor(Customer $customer, float $amount, ?string $date = null): Invoice
{
    $invoice = Invoice::create([
        'customer_id' => $customer->id,
        'issue_date' => $date ?? now()->toDateString(),
    ]);

    $invoice->lines()->create([
        'description' => 'خدمة', 'qty' => 1, 'unit_price' => $amount, 'line_total' => $amount,
    ]);

    return test()->billing->issue(test()->billing->recalculate($invoice));
}

/* ── The letterhead ──────────────────────────────────────── */

it('serves defaults before anyone has filled the details in', function () {
    // A blank letterhead would print an invoice from a company with no name.
    $response = actingAs($this->manager)->getJson('/api/settings')->assertOk();

    expect($response->json('data.company_name'))->toBe('City Engineering');
});

it('lets a technician read the letterhead', function () {
    // They print a signed service report on site; it should carry the brand.
    actingAs($this->technician)->getJson('/api/settings')->assertOk();
});

it('stops anyone but an admin changing it', function () {
    actingAs($this->manager)
        ->putJson('/api/settings', ['company_name' => 'شركة أخرى'])
        ->assertForbidden();

    actingAs($this->technician)
        ->putJson('/api/settings', ['company_name' => 'شركة أخرى'])
        ->assertForbidden();
});

it('keeps what an admin saves', function () {
    actingAs($this->admin)
        ->putJson('/api/settings', [
            'company_name' => 'سيتي إنجنيرنج',
            'company_tax_id' => '123-456-789',
            'company_phone' => '0223456789',
        ])
        ->assertOk();

    expect(Setting::get('company_tax_id'))->toBe('123-456-789')
        ->and(Setting::get('company_name'))->toBe('سيتي إنجنيرنج')
        // Untouched keys keep their default rather than blanking.
        ->and(Setting::get('company_tagline'))->toBe('Expertise in Standby Energy');
});

/* ── Customer statement ──────────────────────────────────── */

it('carries the balance down the page', function () {
    invoiceFor($this->customer, 1000, now()->subDays(10)->toDateString());
    invoiceFor($this->customer, 500, now()->subDays(5)->toDateString());

    $response = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/statement")
        ->assertOk();

    expect($response->json('data.0.balance'))->toBe(1000)
        ->and($response->json('data.1.balance'))->toBe(1500)
        ->and($response->json('meta.balance'))->toBe(1500);
});

it('nets receipts off the running balance', function () {
    $invoice = invoiceFor($this->customer, 1000, now()->subDays(3)->toDateString());

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id,
        'cash_box_id' => $this->box->id,
        'amount' => 400,
    ], $this->manager);

    $response = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/statement")
        ->assertOk();

    expect($response->json('meta.total_invoiced'))->toBe(1000)
        ->and($response->json('meta.total_collected'))->toBe(400)
        ->and($response->json('meta.balance'))->toBe(600);
});

it('puts an invoice ahead of a receipt taken the same day', function () {
    // Money cannot be collected against an invoice that does not exist yet;
    // the other order reads as a negative balance and alarms people.
    $today = now()->toDateString();
    $invoice = invoiceFor($this->customer, 800, $today);

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id,
        'cash_box_id' => $this->box->id,
        'amount' => 800,
        'paid_at' => $today,
    ], $this->manager);

    $rows = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/statement")
        ->assertOk()
        ->json('data');

    expect($rows[0]['type'])->toBe('invoice')
        ->and($rows[1]['type'])->toBe('payment')
        ->and($rows[1]['balance'])->toBe(0);
});

it('leaves drafts and voided invoices off the account', function () {
    // Neither is money the customer owes.
    Invoice::create(['customer_id' => $this->customer->id])
        ->lines()->create(['description' => 'مسودة', 'qty' => 1, 'unit_price' => 999, 'line_total' => 999]);

    $voided = invoiceFor($this->customer, 500);
    $this->billing->void($voided, 'خطأ');

    invoiceFor($this->customer, 300);

    $response = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/statement")
        ->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('meta.balance'))->toBe(300);
});

it('narrows the account to a date range', function () {
    invoiceFor($this->customer, 1000, now()->subMonths(3)->toDateString());
    invoiceFor($this->customer, 250, now()->toDateString());

    $response = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/statement?from=".now()->subDays(7)->toDateString())
        ->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('meta.balance'))->toBe(250);
});

it('keeps a technician out of a customer account', function () {
    actingAs($this->technician)
        ->getJson("/api/customers/{$this->customer->id}/statement")
        ->assertForbidden();
});

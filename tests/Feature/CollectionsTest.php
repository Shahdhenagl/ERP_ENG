<?php

use App\Models\CashBox;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use App\Services\BillingService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->billing = app(BillingService::class);
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create(['name' => 'شركة النور']);
    $this->box = CashBox::default();
});

function paidInvoice(float $amount): Invoice
{
    $invoice = Invoice::create([
        'customer_id' => test()->customer->id,
        'created_by' => test()->manager->id,
    ]);
    $invoice->lines()->create([
        'description' => 'بند',
        'qty' => 1,
        'unit_price' => $amount,
        'line_total' => $amount,
        'sort' => 0,
    ]);
    test()->billing->issue(test()->billing->recalculate($invoice));

    test()->billing->receivePayment([
        'invoice_id' => $invoice->id,
        'amount' => $amount,
        'cash_box_id' => test()->box->id,
    ], test()->manager);

    return $invoice;
}

it('lists collected receipts newest first with the customer and invoice', function () {
    $invoice = paidInvoice(750);

    $rows = actingAs($this->manager)
        ->getJson('/api/payments')
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1);

    $receipt = $rows[0];
    expect((float) $receipt['amount'])->toBe(750.0)
        ->and($receipt['customer'])->toBe('شركة النور')
        ->and($receipt['invoice_code'])->toBe($invoice->code);
});

it('filters receipts by customer', function () {
    paidInvoice(300);

    $other = Customer::factory()->create();
    $invoice = Invoice::create(['customer_id' => $other->id, 'created_by' => $this->manager->id]);
    $invoice->lines()->create([
        'description' => 'بند', 'qty' => 1, 'unit_price' => 200, 'line_total' => 200, 'sort' => 0,
    ]);
    $this->billing->issue($this->billing->recalculate($invoice));
    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 200, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    $rows = actingAs($this->manager)
        ->getJson("/api/payments?customer_id={$this->customer->id}")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and((float) $rows[0]['amount'])->toBe(300.0);
});

it('bars a technician from the collections ledger', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/payments')->assertForbidden();
});

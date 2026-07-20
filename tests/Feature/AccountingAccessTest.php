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
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
    $this->box = CashBox::default();
});

function issuedInvoice(float $amount = 1000): Invoice
{
    $invoice = Invoice::create([
        'customer_id' => test()->customer->id,
        'created_by' => test()->manager->id,
    ]);

    $invoice->lines()->create([
        'description' => 'صيانة', 'qty' => 1,
        'unit_price' => $amount, 'line_total' => $amount,
    ]);

    return test()->billing->issue($invoice);
}

/* ── Money is not the technician's business ──────────────── */

it('keeps a technician out of the invoice list', function () {
    actingAs($this->technician)->getJson('/api/invoices')->assertForbidden();
});

it('keeps a technician out of the treasury', function () {
    actingAs($this->technician)->getJson('/api/treasury/boxes')->assertForbidden();
    actingAs($this->technician)->getJson('/api/treasury/summary')->assertForbidden();
});

it('stops a technician taking money', function () {
    $invoice = issuedInvoice();

    actingAs($this->technician)
        ->postJson('/api/payments', [
            'invoice_id' => $invoice->id,
            'cash_box_id' => $this->box->id,
            'amount' => 100,
        ])
        ->assertForbidden();
});

/* ── The manager's flow, end to end ──────────────────────── */

it('creates a draft, issues it, and collects against it', function () {
    $created = actingAs($this->manager)
        ->postJson('/api/invoices', [
            'customer_id' => $this->customer->id,
            'tax_rate' => 14,
            'lines' => [
                ['description' => 'زيارة صيانة', 'qty' => 1, 'unit_price' => 1000],
                ['description' => 'بطارية', 'qty' => 2, 'unit_price' => 500],
            ],
        ])
        ->assertCreated()
        // A POST returns the resource unwrapped; only the GET routes carry a
        // `data` envelope.
        ->assertJsonPath('payment_state', 'draft');

    // 2000 + 14% = 2280 — compared by value, since JSON renders it as an int.
    expect((float) $created->json('total'))->toBe(2280.0);

    $id = $created->json('id');

    actingAs($this->manager)
        ->postJson("/api/invoices/{$id}/issue")
        ->assertOk()
        ->assertJsonPath('data.payment_state', 'unpaid');

    actingAs($this->manager)
        ->postJson('/api/payments', [
            'invoice_id' => $id, 'cash_box_id' => $this->box->id, 'amount' => 1280,
        ])
        ->assertCreated();

    $after = actingAs($this->manager)
        ->getJson("/api/invoices/{$id}")
        ->assertOk()
        ->assertJsonPath('data.payment_state', 'partly_paid');

    expect((float) $after->json('data.balance'))->toBe(1000.0);
});

it('refuses to edit an invoice once it has been issued', function () {
    $invoice = issuedInvoice();

    actingAs($this->manager)
        ->putJson("/api/invoices/{$invoice->id}", [
            'lines' => [['description' => 'تعديل', 'qty' => 1, 'unit_price' => 1]],
        ])
        ->assertStatus(422);
});

it('refuses to delete an issued invoice', function () {
    $invoice = issuedInvoice();

    actingAs($this->manager)->deleteJson("/api/invoices/{$invoice->id}")->assertStatus(422);
});

it('deletes a draft', function () {
    $invoice = Invoice::create(['customer_id' => $this->customer->id]);

    actingAs($this->manager)->deleteJson("/api/invoices/{$invoice->id}")->assertOk();
});

it('rejects an invoice with no lines', function () {
    actingAs($this->manager)
        ->postJson('/api/invoices', ['customer_id' => $this->customer->id, 'lines' => []])
        ->assertStatus(422)
        ->assertJsonValidationErrors('lines');
});

/* ── Treasury ────────────────────────────────────────────── */

it('reports cash on hand and what is still owed', function () {
    $invoice = issuedInvoice(1000);

    actingAs($this->manager)->postJson('/api/payments', [
        'invoice_id' => $invoice->id, 'cash_box_id' => $this->box->id, 'amount' => 400,
    ])->assertCreated();

    $summary = actingAs($this->manager)->getJson('/api/treasury/summary')->assertOk();

    // JSON renders 400.0 as 400, so compare by value rather than by type.
    expect((float) $summary->json('cash_on_hand'))->toBe(400.0)
        ->and((float) $summary->json('receivable'))->toBe(600.0);
});

it('lists only outstanding invoices when asked', function () {
    $paid = issuedInvoice(500);
    issuedInvoice(800);

    actingAs($this->manager)->postJson('/api/payments', [
        'invoice_id' => $paid->id, 'cash_box_id' => $this->box->id, 'amount' => 500,
    ])->assertCreated();

    $response = actingAs($this->manager)->getJson('/api/invoices?outstanding=1')->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and((float) $response->json('data.0.balance'))->toBe(800.0);
});

it('reverses a receipt and puts the balance back', function () {
    $invoice = issuedInvoice(1000);

    $payment = actingAs($this->manager)->postJson('/api/payments', [
        'invoice_id' => $invoice->id, 'cash_box_id' => $this->box->id, 'amount' => 1000,
    ])->assertCreated()->json('id');

    actingAs($this->manager)->deleteJson("/api/payments/{$payment}")->assertOk();

    $fresh = actingAs($this->manager)->getJson("/api/invoices/{$invoice->id}")->assertOk();

    expect((float) $fresh->json('data.balance'))->toBe(1000.0);

    expect($this->box->fresh()->balance())->toBe(0.0);
});

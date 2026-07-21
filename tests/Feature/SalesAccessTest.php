<?php

use App\Models\Customer;
use App\Models\Quotation;
use App\Models\User;
use App\Services\SalesService;

use function Pest\Laravel\actingAs;

/**
 * Pricing is commercial information. A technician carries a phone into a
 * customer's building all day; what the company charges, and what its margin
 * is, has no business being on it.
 */
beforeEach(function () {
    $this->sales = app(SalesService::class);
    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
});

function quotationFor(Customer $customer): Quotation
{
    $quotation = Quotation::create(['customer_id' => $customer->id, 'title' => 'عرض']);
    $quotation->lines()->create([
        'description' => 'جهاز', 'qty' => 1, 'unit_price' => 5000, 'line_total' => 5000,
    ]);

    return test()->sales->recalculateQuotation($quotation);
}

/* ── Technicians are kept out entirely ───────────────────── */

it('stops a technician listing quotations', function () {
    actingAs($this->technician)->getJson('/api/quotations')->assertForbidden();
});

it('stops a technician opening a quotation', function () {
    $quotation = quotationFor($this->customer);

    actingAs($this->technician)->getJson("/api/quotations/{$quotation->id}")->assertForbidden();
});

it('stops a technician creating a quotation', function () {
    actingAs($this->technician)
        ->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'lines' => [['description' => 'x', 'qty' => 1, 'unit_price' => 100]],
        ])
        ->assertForbidden();
});

it('stops a technician accepting a quotation on the customer behalf', function () {
    $sent = $this->sales->send(quotationFor($this->customer));

    actingAs($this->technician)
        ->postJson("/api/quotations/{$sent->id}/accept")
        ->assertForbidden();
});

it('stops a technician listing sales orders', function () {
    actingAs($this->technician)->getJson('/api/sales-orders')->assertForbidden();
});

/* ── Dispatchers can run the whole chain ─────────────────── */

it('lets a manager create and send a quotation', function () {
    $response = actingAs($this->manager)
        ->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'title' => 'توريد جهاز UPS',
            'tax_rate' => 14,
            'valid_until' => now()->addDays(10)->toDateString(),
            'lines' => [
                ['description' => 'UPS 10kVA', 'qty' => 1, 'unit_price' => 40000],
                ['description' => 'تركيب', 'qty' => 1, 'unit_price' => 5000],
            ],
        ])
        ->assertCreated();

    // 45000 + 14% = 51300, computed by the server rather than trusted.
    // Cast because JSON renders a whole number without its decimal part.
    expect((float) $response->json('data.total'))->toBe(51300.0);

    actingAs($this->manager)
        ->postJson("/api/quotations/{$response->json('data.id')}/send")
        ->assertOk()
        ->assertJsonPath('data.status', 'sent');
});

it('ignores a total posted by the client', function () {
    // A total that can be set independently of its lines is indefensible.
    $response = actingAs($this->manager)
        ->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'total' => 999999,
            'lines' => [['description' => 'بند', 'qty' => 2, 'unit_price' => 100]],
        ])
        ->assertCreated();

    expect((float) $response->json('data.total'))->toBe(200.0);
});

it('refuses to edit a quotation after it has been sent', function () {
    $sent = $this->sales->send(quotationFor($this->customer));

    actingAs($this->manager)
        ->putJson("/api/quotations/{$sent->id}", [
            'customer_id' => $this->customer->id,
            'lines' => [['description' => 'أرخص', 'qty' => 1, 'unit_price' => 1]],
        ])
        ->assertStatus(422);

    expect((float) $sent->fresh()->total)->toBe(5000.0);
});

it('walks a quotation through to an invoice', function () {
    $sent = $this->sales->send(quotationFor($this->customer));

    $accepted = actingAs($this->manager)
        ->postJson("/api/quotations/{$sent->id}/accept")
        ->assertCreated();

    $orderId = $accepted->json('data.sales_order_id');

    $invoice = actingAs($this->manager)
        ->postJson("/api/sales-orders/{$orderId}/invoice")
        ->assertCreated();

    expect((float) $invoice->json('total'))->toBe(5000.0)
        ->and($invoice->json('status'))->toBe('draft');

    actingAs($this->manager)
        ->getJson("/api/sales-orders/{$orderId}")
        ->assertOk()
        ->assertJsonPath('data.billing_state', 'invoiced');
});

it('surfaces a lapsed quotation as expired to the manager', function () {
    $sent = $this->sales->send(quotationFor($this->customer));
    $sent->forceFill(['valid_until' => now()->subDay()->toDateString()])->save();

    actingAs($this->manager)
        ->getJson("/api/quotations/{$sent->id}")
        ->assertOk()
        ->assertJsonPath('data.effective_status', 'expired')
        // The stored status is untouched — only the reading changes.
        ->assertJsonPath('data.status', 'sent');
});

it('lets an admin do everything a manager can', function () {
    actingAs($this->admin)->getJson('/api/quotations')->assertOk();
    actingAs($this->admin)->getJson('/api/sales-orders')->assertOk();
});

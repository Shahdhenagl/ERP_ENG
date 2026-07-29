<?php

use App\Models\Branch;
use App\Models\Customer;
use App\Models\User;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();

    $this->branch = Branch::create([
        'customer_id' => $this->customer->id, 'name' => 'فرع المعادي', 'is_active' => true,
    ]);
});

/** @return array<string, mixed> */
function branchQuotePayload(array $overrides = []): array
{
    return [
        'customer_id' => test()->customer->id,
        'title' => 'توريد جهاز UPS',
        'lines' => [['description' => 'UPS 10kVA', 'qty' => 1, 'unit_price' => 50000]],
        ...$overrides,
    ];
}

it('quotes a specific site and reads it back', function () {
    $body = actingAs($this->manager)
        ->postJson('/api/quotations', branchQuotePayload(['branch_id' => $this->branch->id]))
        ->assertCreated()
        ->json('data');

    expect($body['branch_id'])->toBe($this->branch->id)
        ->and($body['branch'])->toBe('فرع المعادي');
});

it('refuses a branch that belongs to another customer', function () {
    $other = Branch::create([
        'customer_id' => Customer::factory()->create()->id,
        'name' => 'فرع عميل آخر',
        'is_active' => true,
    ]);

    actingAs($this->manager)
        ->postJson('/api/quotations', branchQuotePayload(['branch_id' => $other->id]))
        ->assertStatus(422)
        ->assertJsonValidationErrors('branch_id');
});

it('carries the quoted site onto the sales order', function () {
    $quotation = actingAs($this->manager)
        ->postJson('/api/quotations', branchQuotePayload(['branch_id' => $this->branch->id]))
        ->json('data');

    actingAs($this->manager)->postJson("/api/quotations/{$quotation['id']}/send")->assertOk();

    $accepted = actingAs($this->manager)
        ->postJson("/api/quotations/{$quotation['id']}/accept")
        ->assertCreated()
        ->json('data');

    $order = actingAs($this->manager)
        ->getJson("/api/sales-orders/{$accepted['sales_order_id']}")
        ->assertOk()
        ->json('data');

    // The site that was quoted is the site that gets delivered to.
    expect($order['branch_id'])->toBe($this->branch->id)
        ->and($order['branch'])->toBe('فرع المعادي');
});

it('leaves the site empty when the deal is with the head office', function () {
    $body = actingAs($this->manager)
        ->postJson('/api/quotations', branchQuotePayload())
        ->assertCreated()
        ->json('data');

    expect($body['branch_id'])->toBeNull()
        ->and($body['branch'])->toBeNull();
});

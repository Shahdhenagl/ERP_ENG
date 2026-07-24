<?php

use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\SupplierQuote;
use App\Models\User;
use App\Models\Supplier;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->supplierA = Supplier::create(['name' => 'النور']);
    $this->supplierB = Supplier::create(['name' => 'الشروق']);
    $this->battery = Item::factory()->create(['name' => 'بطارية 100Ah']);
});

function quotePayload(Supplier $supplier, float $price, array $extra = []): array
{
    return [
        'supplier_id' => $supplier->id,
        'tax_rate' => 10,
        'lines' => [
            ['item_id' => test()->battery->id, 'qty' => 10, 'unit_price' => $price],
        ],
        ...$extra,
    ];
}

it('records a quote and totals it from the lines with tax', function () {
    $response = actingAs($this->manager)
        ->postJson('/api/supplier-quotes', quotePayload($this->supplierA, 900))
        ->assertCreated();

    // 10 × 900 = 9000, + 10% = 9900
    expect($response->json('data.subtotal'))->toEqual(9000)
        ->and($response->json('data.total'))->toEqual(9900)
        ->and($response->json('data.code'))->toStartWith('SQ-')
        ->and($response->json('data.status'))->toBe('received');
});

it('filters quotes by the request they answer', function () {
    $request = \App\Models\PurchaseRequest::create([
        'requested_by' => $this->manager->id,
    ]);

    actingAs($this->manager)->postJson('/api/supplier-quotes',
        quotePayload($this->supplierA, 900, ['purchase_request_id' => $request->id]))->assertCreated();
    actingAs($this->manager)->postJson('/api/supplier-quotes', quotePayload($this->supplierB, 950))->assertCreated();

    $rows = actingAs($this->manager)
        ->getJson("/api/supplier-quotes?purchase_request_id={$request->id}")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['supplier'])->toBe('النور');
});

it('turns the chosen quote into a draft order and rejects the rivals', function () {
    $request = \App\Models\PurchaseRequest::create([
        'requested_by' => $this->manager->id,
    ]);

    $winner = actingAs($this->manager)->postJson('/api/supplier-quotes',
        quotePayload($this->supplierA, 900, ['purchase_request_id' => $request->id]))->json('data');
    $loser = actingAs($this->manager)->postJson('/api/supplier-quotes',
        quotePayload($this->supplierB, 950, ['purchase_request_id' => $request->id]))->json('data');

    $response = actingAs($this->manager)
        ->postJson("/api/supplier-quotes/{$winner['id']}/select")
        ->assertOk();

    $poCode = $response->json('purchase_order.code');
    expect($poCode)->toStartWith('PO-');

    $order = PurchaseOrder::where('code', $poCode)->first();
    expect($order->supplier_id)->toBe($this->supplierA->id)
        ->and((float) $order->lines()->sum('qty'))->toBe(10.0)
        ->and(SupplierQuote::find($winner['id'])->status)->toBe('selected')
        ->and(SupplierQuote::find($loser['id'])->status)->toBe('rejected');
});

it('refuses to select a quote with no catalogue items', function () {
    $quote = actingAs($this->manager)->postJson('/api/supplier-quotes', [
        'supplier_id' => $this->supplierA->id,
        'lines' => [['description' => 'خدمة تركيب', 'qty' => 1, 'unit_price' => 500]],
    ])->json('data');

    actingAs($this->manager)->postJson("/api/supplier-quotes/{$quote['id']}/select")
        ->assertStatus(422);
});

it('bars a technician from supplier quotes', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->postJson('/api/supplier-quotes', quotePayload($this->supplierA, 900))
        ->assertForbidden();
});

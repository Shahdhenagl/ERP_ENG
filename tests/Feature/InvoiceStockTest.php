<?php

use App\Enums\MovementType;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\StockLevel;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

/**
 * Selling stock has to move stock. An invoice that names an item and leaves the
 * shelf untouched is how a store reads as full while it is empty, so these fix
 * the three things that must hold: issuing draws the goods, a shelf that cannot
 * cover the line refuses the document outright, and voiding puts back exactly
 * what that invoice took — no more, and not twice.
 */
beforeEach(function () {
    $this->ledger = app(StockLedger::class);
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    $this->store = Warehouse::main();
});

/** Stock on hand for one item in the default store. */
function onHand(Item $item): float
{
    return (float) (StockLevel::where('item_id', $item->id)
        ->where('warehouse_id', Warehouse::main()->id)
        ->value('qty') ?? 0);
}

/** A draft invoice for one stocked line. */
function draftFor(Item $item, float $qty, ?int $warehouseId = null): int
{
    return test()->postJson('/api/invoices', [
        'customer_id' => test()->customer->id,
        'warehouse_id' => $warehouseId,
        'lines' => [[
            'item_id' => $item->id,
            'description' => $item->name,
            'qty' => $qty,
            'unit_price' => 1200,
        ]],
    ])->assertCreated()->json('id');
}

/* ── Issuing draws the goods ─────────────────────────────── */

it('takes the sold quantity off the shelf when the invoice is issued', function () {
    $item = Item::factory()->create(['name' => 'بطارية 100 أمبير']);
    $this->ledger->receive($item, $this->store, 10, 900, $this->manager);

    actingAs($this->manager);
    $id = draftFor($item, 4);

    // A draft is not a sale — nothing moves until it is issued.
    expect(onHand($item))->toBe(10.0);

    actingAs($this->manager)->postJson("/api/invoices/{$id}/issue")->assertOk();

    expect(onHand($item))->toBe(6.0);

    $movement = Invoice::find($id)->stockMovements()->first();
    expect($movement->type)->toBe(MovementType::Sale)
        ->and((float) $movement->qty)->toBe(4.0)
        ->and($movement->from_warehouse_id)->toBe($this->store->id);
});

it('leaves free-text lines alone', function () {
    actingAs($this->manager);

    $id = $this->postJson('/api/invoices', [
        'customer_id' => $this->customer->id,
        'lines' => [['description' => 'مصنعية تركيب', 'qty' => 1, 'unit_price' => 500]],
    ])->assertCreated()->json('id');

    $this->postJson("/api/invoices/{$id}/issue")->assertOk();

    expect(Invoice::find($id)->stockMovements()->count())->toBe(0);
});

it('counts the same item on two lines as one draw', function () {
    $item = Item::factory()->create();
    $this->ledger->receive($item, $this->store, 5, 900, $this->manager);

    actingAs($this->manager);
    $id = $this->postJson('/api/invoices', [
        'customer_id' => $this->customer->id,
        'lines' => [
            ['item_id' => $item->id, 'description' => 'دفعة أولى', 'qty' => 3, 'unit_price' => 1200],
            ['item_id' => $item->id, 'description' => 'دفعة ثانية', 'qty' => 2, 'unit_price' => 1200],
        ],
    ])->assertCreated()->json('id');

    $this->postJson("/api/invoices/{$id}/issue")->assertOk();

    expect(onHand($item))->toBe(0.0)
        ->and(Invoice::find($id)->stockMovements()->count())->toBe(1);
});

/* ── A shelf that cannot cover it refuses the document ───── */

it('refuses to issue an invoice the warehouse cannot cover, and leaves it a draft', function () {
    $item = Item::factory()->create(['name' => 'مروحة تبريد']);
    $this->ledger->receive($item, $this->store, 2, 300, $this->manager);

    actingAs($this->manager);
    $id = draftFor($item, 5);

    $this->postJson("/api/invoices/{$id}/issue")->assertStatus(422);

    // Nothing half-done: the stock is untouched and the invoice is still a draft
    // the salesperson can fix.
    expect(onHand($item))->toBe(2.0)
        ->and(Invoice::find($id)->status->value)->toBe('draft');
});

it('refuses when two lines are each affordable but their sum is not', function () {
    $item = Item::factory()->create();
    $this->ledger->receive($item, $this->store, 4, 300, $this->manager);

    actingAs($this->manager);
    $id = $this->postJson('/api/invoices', [
        'customer_id' => $this->customer->id,
        'lines' => [
            ['item_id' => $item->id, 'description' => 'أ', 'qty' => 3, 'unit_price' => 500],
            ['item_id' => $item->id, 'description' => 'ب', 'qty' => 3, 'unit_price' => 500],
        ],
    ])->assertCreated()->json('id');

    $this->postJson("/api/invoices/{$id}/issue")->assertStatus(422);

    expect(onHand($item))->toBe(4.0);
});

/* ── The warehouse is the document's ─────────────────────── */

it('draws from the warehouse named on the invoice, not the default store', function () {
    $second = Warehouse::create(['name' => 'مخزن فرع أكتوبر', 'type' => 'store']);
    $item = Item::factory()->create();
    $this->ledger->receive($item, $this->store, 5, 900, $this->manager);
    $this->ledger->receive($item, $second, 5, 900, $this->manager);

    actingAs($this->manager);
    $id = draftFor($item, 2, $second->id);
    $this->postJson("/api/invoices/{$id}/issue")->assertOk();

    $branchQty = (float) StockLevel::where('item_id', $item->id)
        ->where('warehouse_id', $second->id)->value('qty');

    expect($branchQty)->toBe(3.0)
        // The main store is untouched.
        ->and(onHand($item))->toBe(5.0);
});

/* ── Voiding puts back exactly what left ─────────────────── */

it('puts the goods back when the invoice is voided', function () {
    $item = Item::factory()->create();
    $this->ledger->receive($item, $this->store, 10, 900, $this->manager);

    actingAs($this->manager);
    $id = draftFor($item, 4);
    $this->postJson("/api/invoices/{$id}/issue")->assertOk();
    expect(onHand($item))->toBe(6.0);

    $this->postJson("/api/invoices/{$id}/void", ['reason' => 'طلب العميل الإلغاء'])->assertOk();

    expect(onHand($item))->toBe(10.0)
        ->and(Invoice::find($id)->stockMovements()->where('type', MovementType::SaleVoid)->count())->toBe(1);
});

it('does not put the same goods back twice', function () {
    $item = Item::factory()->create();
    $this->ledger->receive($item, $this->store, 10, 900, $this->manager);

    actingAs($this->manager);
    $id = draftFor($item, 4);
    $this->postJson("/api/invoices/{$id}/issue")->assertOk();

    $invoice = Invoice::find($id);
    app(\App\Services\BillingService::class)->void($invoice, 'مرة');
    app(\App\Services\BillingService::class)->void($invoice->fresh(), 'مرة تانية');

    expect(onHand($item))->toBe(10.0);
});

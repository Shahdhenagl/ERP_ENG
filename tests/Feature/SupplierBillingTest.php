<?php

use App\Models\Account;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Item;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\PurchasingService;
use App\Services\SupplierBilling;
use App\Services\ChartOfAccounts;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->billing = app(SupplierBilling::class);
    $this->purchasing = app(PurchasingService::class);
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    $this->supplier = Supplier::create(['name' => 'النور للبطاريات']);
    $this->item = Item::factory()->create(['name' => 'بطارية 100 أمبير']);
    $this->store = Warehouse::main();

    // Paying a supplier is refused when the box is short, so the till needs an
    // opening float before any of the payment cases can run at all.
    CashMovement::create([
        'cash_box_id' => CashBox::default()->id,
        'direction' => 'in',
        'amount' => 50000,
        'source' => 'opening',
        'note' => 'رصيد افتتاحي للاختبار',
    ]);
});

/** Book goods in from the fixture supplier and hand back the movement. */
function receive_(float $qty, float $cost)
{
    return test()->purchasing->receiveDirect(
        test()->supplier,
        test()->item,
        $qty,
        $cost,
        test()->manager,
    );
}

/** The payable account's balance straight off the journal. */
function payableBalance(): float
{
    app(ChartOfAccounts::class)->ensure();

    return round(Account::key('payable')->balance(), 2);
}

/* ── The debt already exists before the bill ─────────────── */

it('owes for goods the moment they arrive, with no bill yet', function () {
    receive_(10, 500);

    expect(test()->supplier->balance())->toBe(5000.0)
        ->and(test()->supplier->uninvoicedTotal())->toBe(5000.0);
});

it('does not double the debt when the bill matches the delivery', function () {
    // The receipt already credited payables. A bill adding its total again is
    // the single most expensive mistake this module could make.
    $receipt = receive_(10, 500);

    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'receipt_ids' => [$receipt->id],
    ], $this->manager);

    $this->billing->post($invoice);

    expect($invoice->fresh()->total)->toBe('5000.00')
        ->and($invoice->fresh()->accrual())->toBe(0.0)
        ->and($this->supplier->fresh()->balance())->toBe(5000.0);
});

it('stops counting a delivery as uninvoiced once a bill covers it', function () {
    $receipt = receive_(10, 500);

    $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'receipt_ids' => [$receipt->id],
    ], $this->manager);

    expect($this->supplier->fresh()->uninvoicedTotal())->toBe(0.0);
});

it('builds the bill lines from what actually arrived', function () {
    $receipt = receive_(4, 250);

    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'receipt_ids' => [$receipt->id],
    ], $this->manager);

    expect($invoice->lines)->toHaveCount(1)
        ->and((float) $invoice->lines[0]->qty)->toBe(4.0)
        ->and((float) $invoice->lines[0]->unit_price)->toBe(250.0);
});

/* ── What the bill adds on top ───────────────────────────── */

it('adds the tax to the debt but not the goods again', function () {
    $receipt = receive_(10, 500);

    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'receipt_ids' => [$receipt->id],
        'tax_rate' => 14,
    ], $this->manager);

    $this->billing->post($invoice);

    expect($invoice->fresh()->accrual())->toBe(700.0)
        ->and($this->supplier->fresh()->balance())->toBe(5700.0);
});

it('carries a price difference the supplier charged', function () {
    // Booked in at 500, invoiced at 520 — the twenty is real and has to land
    // somewhere rather than being typed over the receipt.
    $receipt = receive_(10, 500);

    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'receipt_ids' => [$receipt->id],
        'lines' => [[
            'item_id' => $this->item->id,
            'description' => 'بطارية',
            'qty' => 10,
            'unit_price' => 520,
        ]],
    ], $this->manager);

    $this->billing->post($invoice);

    expect($invoice->fresh()->accrual())->toBe(200.0)
        ->and($this->supplier->fresh()->balance())->toBe(5200.0);
});

it('charges a bill with no delivery behind it in full', function () {
    // Carriage, a service call — nothing was received, so nothing was owed yet.
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'مصاريف نقل', 'qty' => 1, 'unit_price' => 800]],
    ], $this->manager);

    $this->billing->post($invoice);

    expect($invoice->fresh()->accrual())->toBe(800.0)
        ->and($this->supplier->fresh()->balance())->toBe(800.0);
});

/* ── Guards ──────────────────────────────────────────────── */

it('refuses to bill the same delivery twice', function () {
    $receipt = receive_(10, 500);

    $this->billing->draft([
        'supplier_id' => $this->supplier->id, 'receipt_ids' => [$receipt->id],
    ], $this->manager);

    $this->billing->draft([
        'supplier_id' => $this->supplier->id, 'receipt_ids' => [$receipt->id],
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses a delivery that belongs to another supplier', function () {
    $receipt = receive_(5, 100);
    $other = Supplier::create(['name' => 'مورّد آخر']);

    $this->billing->draft([
        'supplier_id' => $other->id, 'receipt_ids' => [$receipt->id],
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to post a bill with no lines', function () {
    $invoice = $this->billing->draft(['supplier_id' => $this->supplier->id], $this->manager);

    $this->billing->post($invoice);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to edit the lines of a posted bill', function () {
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'نقل', 'qty' => 1, 'unit_price' => 100]],
    ], $this->manager);

    $this->billing->post($invoice);
    $this->billing->syncLines($invoice->fresh(), []);
})->throws(Illuminate\Validation\ValidationException::class);

it('releases the deliveries when a bill is voided', function () {
    // Otherwise a typo would strand the delivery as permanently uninvoiceable.
    $receipt = receive_(10, 500);

    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id, 'receipt_ids' => [$receipt->id],
    ], $this->manager);

    $this->billing->post($invoice);
    $this->billing->void($invoice->fresh(), 'فاتورة مكررة');

    expect($receipt->fresh()->supplier_invoice_id)->toBeNull()
        ->and($this->supplier->fresh()->uninvoicedTotal())->toBe(5000.0);
});

it('refuses to void a bill that has been paid', function () {
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'نقل', 'qty' => 1, 'unit_price' => 400]],
    ], $this->manager);

    $this->billing->post($invoice);

    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'supplier_invoice_id' => $invoice->id,
        'amount' => 400,
    ], $this->manager);

    $this->billing->void($invoice->fresh(), 'خطأ');
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Paying against a bill ───────────────────────────────── */

it('allocates a payment to the bill it settles', function () {
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'نقل', 'qty' => 1, 'unit_price' => 1000]],
    ], $this->manager);
    $this->billing->post($invoice);

    $payment = $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'supplier_invoice_id' => $invoice->id,
        'amount' => 400,
    ], $this->manager);

    expect($payment->supplier_invoice_id)->toBe($invoice->id)
        ->and($invoice->fresh()->balance())->toBe(600.0)
        ->and($invoice->fresh()->paymentState())->toBe('partly_paid');
});

it('refuses to pay more than a bill asks for', function () {
    // Nearly always the wrong bill. An advance is recorded unallocated instead.
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'نقل', 'qty' => 1, 'unit_price' => 500]],
    ], $this->manager);
    $this->billing->post($invoice);

    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'supplier_invoice_id' => $invoice->id,
        'amount' => 900,
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to pay against a draft bill', function () {
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'نقل', 'qty' => 1, 'unit_price' => 500]],
    ], $this->manager);

    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'supplier_invoice_id' => $invoice->id,
        'amount' => 100,
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('reads a settled bill as paid and an overdue one as overdue', function () {
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'due_date' => now()->subWeek()->toDateString(),
        'lines' => [['description' => 'نقل', 'qty' => 1, 'unit_price' => 300]],
    ], $this->manager);
    $this->billing->post($invoice);

    expect($invoice->fresh()->paymentState())->toBe('overdue');

    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'supplier_invoice_id' => $invoice->id,
        'amount' => 300,
    ], $this->manager);

    expect($invoice->fresh()->paymentState())->toBe('paid');
});

/* ── Returns ─────────────────────────────────────────────── */

it('takes the goods off the shelf and the debt off the supplier', function () {
    receive_(10, 500);

    $return = $this->billing->draftReturn([
        'supplier_id' => $this->supplier->id,
        'reason' => 'بطاريات معيبة',
        'lines' => [['item_id' => $this->item->id, 'qty' => 3]],
    ], $this->manager);

    $this->billing->postReturn($return, $this->manager);

    expect((float) $return->fresh()->total)->toBe(1500.0)
        ->and($this->supplier->fresh()->balance())->toBe(3500.0)
        ->and((float) $this->item->fresh()->levels()->sum('qty'))->toBe(7.0);
});

it('refuses to return more than the store holds', function () {
    receive_(2, 500);

    $return = $this->billing->draftReturn([
        'supplier_id' => $this->supplier->id,
        'reason' => 'معيب',
        'lines' => [['item_id' => $this->item->id, 'qty' => 5]],
    ], $this->manager);

    $this->billing->postReturn($return, $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('moves nothing until the return is posted', function () {
    receive_(10, 500);

    $this->billing->draftReturn([
        'supplier_id' => $this->supplier->id,
        'reason' => 'معيب',
        'lines' => [['item_id' => $this->item->id, 'qty' => 3]],
    ], $this->manager);

    expect((float) $this->item->fresh()->levels()->sum('qty'))->toBe(10.0)
        ->and($this->supplier->fresh()->balance())->toBe(5000.0);
});

it('refuses to post the same return twice', function () {
    receive_(10, 500);

    $return = $this->billing->draftReturn([
        'supplier_id' => $this->supplier->id,
        'reason' => 'معيب',
        'lines' => [['item_id' => $this->item->id, 'qty' => 2]],
    ], $this->manager);

    $this->billing->postReturn($return, $this->manager);
    $this->billing->postReturn($return->fresh(), $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── The balance agrees with the ledger ──────────────────── */

it('keeps the supplier balance equal to the payable account', function () {
    // The whole point. If these two ever disagree, one of them is lying to the
    // person deciding who to pay.
    $receipt = receive_(10, 500);

    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'receipt_ids' => [$receipt->id],
        'tax_rate' => 14,
    ], $this->manager);
    $this->billing->post($invoice);

    $return = $this->billing->draftReturn([
        'supplier_id' => $this->supplier->id,
        'reason' => 'معيب',
        'lines' => [['item_id' => $this->item->id, 'qty' => 2]],
    ], $this->manager);
    $this->billing->postReturn($return, $this->manager);

    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'amount' => 1000,
    ], $this->manager);

    expect($this->supplier->fresh()->balance())->toBe(payableBalance());
});

it('keeps them equal for a service bill with no goods', function () {
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'تركيب', 'qty' => 1, 'unit_price' => 1200]],
        'tax_rate' => 14,
    ], $this->manager);
    $this->billing->post($invoice);

    expect($this->supplier->fresh()->balance())->toBe(payableBalance());
});

it('unwinds the ledger when a bill is voided', function () {
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'نقل', 'qty' => 1, 'unit_price' => 600]],
    ], $this->manager);
    $this->billing->post($invoice);

    expect(payableBalance())->toBe(600.0);

    $this->billing->void($invoice->fresh(), 'مكررة');

    expect(payableBalance())->toBe(0.0)
        ->and($this->supplier->fresh()->balance())->toBe(0.0);
});

/* ── Statement ───────────────────────────────────────────── */

it('carries the balance down a supplier statement', function () {
    $receipt = receive_(10, 500);
    $invoice = $this->billing->draft([
        'supplier_id' => $this->supplier->id,
        'receipt_ids' => [$receipt->id],
        'tax_rate' => 14,
    ], $this->manager);
    $this->billing->post($invoice);

    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id,
        'supplier_invoice_id' => $invoice->id,
        'amount' => 2000,
    ], $this->manager);

    $statement = $this->billing->statement($this->supplier);

    expect($statement['rows'])->toHaveCount(3)
        ->and($statement['closing_balance'])->toBe(3700.0)
        ->and($statement['closing_balance'])->toBe($this->supplier->fresh()->balance());
});

it('shows an unallocated payment as on account', function () {
    receive_(2, 100);
    $this->purchasing->paySupplier([
        'supplier_id' => $this->supplier->id, 'amount' => 50,
    ], $this->manager);

    $statement = $this->billing->statement($this->supplier);
    $payment = collect($statement['rows'])->firstWhere('type', 'payment');

    expect($payment['note'])->toBe('دفعة تحت الحساب');
});

it('opens a windowed statement with what came before it', function () {
    $old = receive_(4, 500);
    // Straight to the table: `created_at` is not fillable, so a model update
    // would drop it and the window would prove nothing.
    StockMovement::where('id', $old->id)->update(['created_at' => now()->subMonths(2)]);
    receive_(2, 500);

    $statement = $this->billing->statement(
        $this->supplier,
        now()->startOfMonth()->toDateString(),
    );

    expect($statement['opening_balance'])->toBe(2000.0)
        ->and($statement['rows'])->toHaveCount(1)
        ->and($statement['closing_balance'])->toBe(3000.0);
});

/* ── Through the API ─────────────────────────────────────── */

it('drafts and posts a bill through the API', function () {
    $receipt = receive_(10, 500);

    $id = actingAs($this->manager)
        ->postJson('/api/supplier-invoices', [
            'supplier_id' => $this->supplier->id,
            'supplier_ref' => 'INV-9981',
            'receipt_ids' => [$receipt->id],
            'tax_rate' => 14,
        ])
        ->assertCreated()
        ->json('data.id');

    actingAs($this->manager)
        ->postJson("/api/supplier-invoices/{$id}/post")
        ->assertOk()
        ->assertJsonPath('data.status', 'posted')
        ->assertJsonPath('data.payment_state', 'unpaid');

    expect(SupplierInvoice::find($id)->accrual())->toBe(700.0);
});

it('lists the deliveries still waiting for a bill', function () {
    receive_(10, 500);
    receive_(4, 250);

    $response = actingAs($this->manager)
        ->getJson("/api/suppliers/{$this->supplier->id}/uninvoiced")
        ->assertOk();

    expect($response->json('data'))->toHaveCount(2)
        ->and((float) $response->json('total'))->toBe(6000.0);
});

it('posts a return through the API', function () {
    receive_(10, 500);

    $id = actingAs($this->manager)
        ->postJson('/api/purchase-returns', [
            'supplier_id' => $this->supplier->id,
            'reason' => 'بطاريات معيبة',
            'lines' => [['item_id' => $this->item->id, 'qty' => 3]],
        ])
        ->assertCreated()
        ->json('data.id');

    actingAs($this->manager)
        ->postJson("/api/purchase-returns/{$id}/post")
        ->assertOk()
        ->assertJsonPath('data.status', 'posted');

    expect($this->supplier->fresh()->balance())->toBe(3500.0);
});

it('refuses to delete a posted return', function () {
    receive_(10, 500);

    $return = $this->billing->draftReturn([
        'supplier_id' => $this->supplier->id,
        'reason' => 'معيب',
        'lines' => [['item_id' => $this->item->id, 'qty' => 1]],
    ], $this->manager);
    $this->billing->postReturn($return, $this->manager);

    actingAs($this->manager)
        ->deleteJson("/api/purchase-returns/{$return->id}")
        ->assertStatus(422);
});

it('serves a supplier statement through the API', function () {
    receive_(3, 400);

    actingAs($this->manager)
        ->getJson("/api/suppliers/{$this->supplier->id}/statement")
        ->assertOk()
        ->assertJsonPath('data.closing_balance', 1200);
});

it('keeps a technician out of supplier billing', function () {
    actingAs($this->technician)->getJson('/api/supplier-invoices')->assertForbidden();
    actingAs($this->technician)->getJson('/api/purchase-returns')->assertForbidden();
    actingAs($this->technician)
        ->getJson("/api/suppliers/{$this->supplier->id}/statement")
        ->assertForbidden();
});

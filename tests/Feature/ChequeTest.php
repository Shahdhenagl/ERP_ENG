<?php

use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Cheque;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Supplier;
use App\Models\User;
use App\Services\BillingService;
use App\Services\ChequeRegister;
use App\Services\SupplierBilling;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->cheques = app(ChequeRegister::class);
    $this->billing = app(BillingService::class);

    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create(['name' => 'بنك القاهرة']);
    $this->supplier = Supplier::create(['name' => 'النور للبطاريات']);

    $this->bank = CashBox::create(['name' => 'حساب البنك الأهلي', 'type' => 'bank']);
});

/** An issued invoice for the fixture customer. */
function billed(float $amount = 5000): Invoice
{
    $invoice = Invoice::create([
        'customer_id' => test()->customer->id,
        'issue_date' => now()->toDateString(),
    ]);

    $invoice->lines()->create([
        'description' => 'خدمة', 'qty' => 1, 'unit_price' => $amount, 'line_total' => $amount,
    ]);

    return test()->billing->issue(test()->billing->recalculate($invoice));
}

/** A cheque from the fixture customer against that invoice. */
function chequeFor(Invoice $invoice, string $number = 'A-100', ?string $due = null): Cheque
{
    return test()->cheques->receive([
        'invoice_id' => $invoice->id,
        'cheque_number' => $number,
        'bank_name' => 'بنك مصر',
        'due_date' => $due ?? now()->addMonth()->toDateString(),
        'amount' => (float) $invoice->total,
    ], test()->manager);
}

/* ── A cheque is not money ───────────────────────────────── */

it('leaves the treasury alone while a cheque is only held', function () {
    // The whole point. A company that counts uncleared cheques as collected
    // plans against money it does not have.
    $invoice = billed(5000);
    chequeFor($invoice);

    expect($this->bank->fresh()->balance())->toBe(0.0)
        ->and(CashMovement::count())->toBe(0);
});

it('leaves the invoice outstanding until the cheque clears', function () {
    $invoice = billed(5000);
    chequeFor($invoice);

    expect($invoice->fresh()->balance())->toBe(5000.0)
        ->and($invoice->fresh()->paymentState())->toBe('unpaid');
});

it('still shows nothing banked after the cheque is deposited', function () {
    // With the bank is not the same as cleared by the bank.
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);

    $this->cheques->deposit($cheque, $this->bank);

    expect($cheque->fresh()->status)->toBe('deposited')
        ->and($this->bank->fresh()->balance())->toBe(0.0)
        ->and($invoice->fresh()->balance())->toBe(5000.0);
});

/* ── Clearing is what moves the money ────────────────────── */

it('produces a receipt and the cash when it clears', function () {
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);
    $this->cheques->deposit($cheque, $this->bank);

    $cleared = $this->cheques->clear($cheque->fresh(), $this->manager);

    expect($cleared->status)->toBe('cleared')
        ->and($cleared->payment_id)->not->toBeNull()
        ->and($this->bank->fresh()->balance())->toBe(5000.0)
        ->and($invoice->fresh()->balance())->toBe(0.0)
        ->and($invoice->fresh()->paymentState())->toBe('paid');
});

it('puts the cheque number on the receipt', function () {
    // What the bank and the customer both refer to.
    $invoice = billed(5000);
    $cheque = chequeFor($invoice, 'B-777');
    $cleared = $this->cheques->clear($cheque, $this->manager, $this->bank);

    expect($cleared->payment->reference)->toBe('B-777')
        ->and($cleared->payment->method->value)->toBe('cheque');
});

it('refuses to clear without saying which account', function () {
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);

    $this->cheques->clear($cheque, $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to clear the same cheque twice', function () {
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);
    $this->cheques->clear($cheque, $this->manager, $this->bank);

    $this->cheques->clear($cheque->fresh(), $this->manager, $this->bank);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Bouncing ────────────────────────────────────────────── */

it('needs nothing reversed when a cheque bounces', function () {
    // The reward for never having counted it: the invoice was never marked
    // paid and the cash was never raised.
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);
    $this->cheques->deposit($cheque, $this->bank);

    $bounced = $this->cheques->bounce($cheque->fresh(), 'رصيد غير كافٍ');

    expect($bounced->status)->toBe('bounced')
        ->and($bounced->bounce_reason)->toBe('رصيد غير كافٍ')
        ->and($this->bank->fresh()->balance())->toBe(0.0)
        ->and($invoice->fresh()->balance())->toBe(5000.0);
});

it('refuses to bounce a cheque that already cleared', function () {
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);
    $this->cheques->clear($cheque, $this->manager, $this->bank);

    $this->cheques->bounce($cheque->fresh(), 'متأخر');
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Guards ──────────────────────────────────────────────── */

it('refuses the same cheque number twice while one is still open', function () {
    // Two records of one cheque is how it gets banked twice.
    $invoice = billed(5000);
    chequeFor($invoice, 'A-100');
    chequeFor($invoice, 'A-100');
})->throws(Illuminate\Validation\ValidationException::class);

it('allows the number again once the first one is closed', function () {
    $invoice = billed(5000);
    $first = chequeFor($invoice, 'A-100');
    $this->cheques->bounce($first, 'مرتد');

    $second = chequeFor($invoice, 'A-100');

    expect($second)->toBeInstanceOf(Cheque::class);
});

it('refuses a cheque against a draft invoice', function () {
    $draft = Invoice::create(['customer_id' => $this->customer->id]);

    $this->cheques->receive([
        'invoice_id' => $draft->id,
        'cheque_number' => 'X-1',
        'due_date' => now()->addMonth()->toDateString(),
        'amount' => 100,
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses an incoming cheque from nobody', function () {
    $this->cheques->receive([
        'cheque_number' => 'X-1',
        'due_date' => now()->addMonth()->toDateString(),
        'amount' => 100,
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('takes the payer’s name when it is not the customer', function () {
    // A cheque from a third party is common, and the difference matters when
    // one bounces.
    $invoice = billed(5000);

    $cheque = $this->cheques->receive([
        'invoice_id' => $invoice->id,
        'cheque_number' => 'C-9',
        'party_name' => 'شركة الأصدقاء للتجارة',
        'due_date' => now()->addMonth()->toDateString(),
        'amount' => 5000,
    ], $this->manager);

    expect($cheque->party_name)->toBe('شركة الأصدقاء للتجارة')
        ->and($cheque->customer_id)->toBe($this->customer->id);
});

/* ── Cheques we write ────────────────────────────────────── */

it('does not spend the money when a cheque is written', function () {
    CashMovement::create([
        'cash_box_id' => $this->bank->id,
        'direction' => 'in', 'amount' => 20000, 'source' => 'opening',
    ]);

    $this->cheques->issue([
        'supplier_id' => $this->supplier->id,
        'cash_box_id' => $this->bank->id,
        'cheque_number' => 'OUT-1',
        'due_date' => now()->addMonth()->toDateString(),
        'amount' => 8000,
    ], $this->manager);

    expect($this->bank->fresh()->balance())->toBe(20000.0)
        ->and($this->supplier->fresh()->balance())->toBe(0.0);
});

it('pays the supplier when the outgoing cheque clears', function () {
    CashMovement::create([
        'cash_box_id' => $this->bank->id,
        'direction' => 'in', 'amount' => 20000, 'source' => 'opening',
    ]);

    $cheque = $this->cheques->issue([
        'supplier_id' => $this->supplier->id,
        'cash_box_id' => $this->bank->id,
        'cheque_number' => 'OUT-1',
        'due_date' => now()->addMonth()->toDateString(),
        'amount' => 8000,
    ], $this->manager);

    $cleared = $this->cheques->clear($cheque, $this->manager);

    expect($cleared->supplier_payment_id)->not->toBeNull()
        ->and($this->bank->fresh()->balance())->toBe(12000.0)
        ->and($this->supplier->fresh()->balance())->toBe(-8000.0);
});

it('settles an outgoing cheque against the bill it was written for', function () {
    $payables = app(SupplierBilling::class);

    CashMovement::create([
        'cash_box_id' => $this->bank->id,
        'direction' => 'in', 'amount' => 20000, 'source' => 'opening',
    ]);

    $bill = $payables->draft([
        'supplier_id' => $this->supplier->id,
        'lines' => [['description' => 'نقل', 'qty' => 1, 'unit_price' => 3000]],
    ], $this->manager);
    $payables->post($bill);

    $cheque = $this->cheques->issue([
        'supplier_invoice_id' => $bill->id,
        'cheque_number' => 'OUT-2',
        'due_date' => now()->addMonth()->toDateString(),
        'amount' => 3000,
    ], $this->manager);

    $this->cheques->clear($cheque, $this->manager, $this->bank);

    expect($bill->fresh()->balance())->toBe(0.0)
        ->and($bill->fresh()->paymentState())->toBe('paid');
});

/* ── What is coming ──────────────────────────────────────── */

it('totals what is due to arrive and what has to be covered', function () {
    $invoice = billed(5000);
    chequeFor($invoice, 'IN-1', now()->addDays(10)->toDateString());
    chequeFor($invoice, 'IN-2', now()->addMonths(4)->toDateString());

    $this->cheques->issue([
        'supplier_id' => $this->supplier->id,
        'cheque_number' => 'OUT-1',
        'due_date' => now()->addDays(5)->toDateString(),
        'amount' => 2000,
    ], $this->manager);

    $outlook = $this->cheques->outlook(30);

    expect($outlook['incoming_total'])->toBe(10000.0)
        // Only the one falling inside the window.
        ->and($outlook['incoming_due'])->toBe(5000.0)
        ->and($outlook['outgoing_due'])->toBe(2000.0);
});

it('counts a cheque past its date and still unbanked', function () {
    $invoice = billed(5000);
    chequeFor($invoice, 'OLD-1', now()->subWeek()->toDateString());

    expect($this->cheques->outlook()['overdue_incoming'])->toBe(1);
});

it('reads an overdue cheque as due', function () {
    $invoice = billed(5000);
    $cheque = chequeFor($invoice, 'OLD-1', now()->subWeek()->toDateString());

    expect($cheque->isDue())->toBeTrue()
        ->and($cheque->daysToDue())->toBeLessThan(0);
});

/* ── Bank reconciliation ─────────────────────────────────── */

it('separates what the bank has shown from what it has not', function () {
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);
    $this->cheques->clear($cheque, $this->manager, $this->bank);

    $response = actingAs($this->manager)
        ->getJson("/api/treasury/boxes/{$this->bank->id}/reconciliation")
        ->assertOk();

    expect((float) $response->json('book_balance'))->toBe(5000.0)
        ->and((float) $response->json('reconciled_balance'))->toBe(0.0)
        ->and((float) $response->json('unreconciled_total'))->toBe(5000.0);
});

it('ticks a movement off and closes the difference', function () {
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);
    $this->cheques->clear($cheque, $this->manager, $this->bank);

    $movement = CashMovement::where('cash_box_id', $this->bank->id)->first();

    actingAs($this->manager)
        ->postJson('/api/treasury/reconcile', ['ids' => [$movement->id], 'reconciled' => true])
        ->assertOk();

    $response = actingAs($this->manager)
        ->getJson("/api/treasury/boxes/{$this->bank->id}/reconciliation?statement_balance=5000")
        ->assertOk();

    expect((float) $response->json('reconciled_balance'))->toBe(5000.0)
        ->and((float) $response->json('unreconciled_total'))->toBe(0.0)
        // Agreeing with the statement is the whole output.
        ->and((float) $response->json('difference'))->toBe(0.0);
});

it('records when a movement was agreed, not merely that it was', function () {
    $invoice = billed(5000);
    $this->cheques->clear(chequeFor($invoice), $this->manager, $this->bank);

    $movement = CashMovement::where('cash_box_id', $this->bank->id)->first();

    actingAs($this->manager)
        ->postJson('/api/treasury/reconcile', ['ids' => [$movement->id], 'reconciled' => true])
        ->assertOk();

    expect($movement->fresh()->reconciled_at)->not->toBeNull()
        ->and($movement->fresh()->reconciled_by)->toBe($this->manager->id);
});

it('unticks a movement again', function () {
    $invoice = billed(5000);
    $this->cheques->clear(chequeFor($invoice), $this->manager, $this->bank);
    $movement = CashMovement::where('cash_box_id', $this->bank->id)->first();

    actingAs($this->manager)
        ->postJson('/api/treasury/reconcile', ['ids' => [$movement->id], 'reconciled' => true]);
    actingAs($this->manager)
        ->postJson('/api/treasury/reconcile', ['ids' => [$movement->id], 'reconciled' => false])
        ->assertOk();

    expect($movement->fresh()->reconciled_at)->toBeNull();
});

/* ── Through the API ─────────────────────────────────────── */

it('walks an incoming cheque from the drawer to the bank', function () {
    $invoice = billed(5000);

    $id = actingAs($this->manager)
        ->postJson('/api/cheques', [
            'direction' => 'incoming',
            'invoice_id' => $invoice->id,
            'cheque_number' => 'API-1',
            'bank_name' => 'بنك مصر',
            'due_date' => now()->addMonth()->toDateString(),
            'amount' => 5000,
        ])
        ->assertCreated()
        ->json('data.id');

    actingAs($this->manager)
        ->postJson("/api/cheques/{$id}/transition", [
            'action' => 'deposit',
            'cash_box_id' => $this->bank->id,
        ])
        ->assertOk()
        ->assertJsonPath('data.status', 'deposited');

    actingAs($this->manager)
        ->postJson("/api/cheques/{$id}/transition", ['action' => 'clear'])
        ->assertOk()
        ->assertJsonPath('data.status', 'cleared');

    expect($invoice->fresh()->balance())->toBe(0.0);
});

it('requires a reason to bounce through the API', function () {
    $invoice = billed(5000);
    $cheque = chequeFor($invoice);

    actingAs($this->manager)
        ->postJson("/api/cheques/{$cheque->id}/transition", ['action' => 'bounce'])
        ->assertStatus(422);
});

it('carries the outlook alongside the list', function () {
    $invoice = billed(5000);
    chequeFor($invoice, 'IN-1', now()->addDays(3)->toDateString());

    $response = actingAs($this->manager)->getJson('/api/cheques?open=1')->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and((float) $response->json('meta.incoming_due'))->toBe(5000.0);
});

it('keeps a technician out of the cheque book', function () {
    actingAs($this->technician)->getJson('/api/cheques')->assertForbidden();
    actingAs($this->technician)
        ->postJson('/api/cheques', ['direction' => 'incoming'])
        ->assertForbidden();
    actingAs($this->technician)
        ->postJson('/api/treasury/reconcile', ['ids' => [1], 'reconciled' => true])
        ->assertForbidden();
});

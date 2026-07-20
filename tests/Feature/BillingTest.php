<?php

use App\Enums\InvoiceStatus;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Payment;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\BillingService;
use App\Services\StockLedger;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->billing = app(BillingService::class);
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    $this->box = CashBox::default();
});

function draft(array $lines = [['qty' => 2, 'unit_price' => 500]], float $taxRate = 0): Invoice
{
    $invoice = Invoice::create([
        'customer_id' => test()->customer->id,
        'tax_rate' => $taxRate,
        'created_by' => test()->manager->id,
    ]);

    foreach ($lines as $index => $line) {
        $invoice->lines()->create([
            'description' => $line['description'] ?? 'بند',
            'qty' => $line['qty'],
            'unit_price' => $line['unit_price'],
            'line_total' => round($line['qty'] * $line['unit_price'], 2),
            'sort' => $index,
        ]);
    }

    return test()->billing->recalculate($invoice);
}

/* ── Totals come from the lines ──────────────────────────── */

it('totals an invoice from its lines', function () {
    $invoice = draft([['qty' => 2, 'unit_price' => 500], ['qty' => 3, 'unit_price' => 100]]);

    expect((float) $invoice->subtotal)->toBe(1300.0)
        ->and((float) $invoice->total)->toBe(1300.0);
});

it('applies VAT to the amount after discount', function () {
    // 1000 − 100 = 900, + 14% = 1026
    $invoice = draft([['qty' => 1, 'unit_price' => 1000]], 14);
    $invoice->forceFill(['discount' => 100])->save();
    $invoice = $this->billing->recalculate($invoice);

    expect((float) $invoice->tax_amount)->toBe(126.0)
        ->and((float) $invoice->total)->toBe(1026.0);
});

it('never lets a discount exceed the subtotal', function () {
    $invoice = draft([['qty' => 1, 'unit_price' => 300]]);
    $invoice->forceFill(['discount' => 1000])->save();
    $invoice = $this->billing->recalculate($invoice);

    expect((float) $invoice->discount)->toBe(300.0)
        ->and((float) $invoice->total)->toBe(0.0);
});

it('recomputes totals when a line changes', function () {
    // A total that can drift from its lines is a total nobody can defend.
    $invoice = draft([['qty' => 1, 'unit_price' => 100]]);
    $invoice->lines()->first()->update(['qty' => 5, 'line_total' => 500]);

    expect((float) $this->billing->recalculate($invoice)->total)->toBe(500.0);
});

/* ── Issuing ─────────────────────────────────────────────── */

it('refuses to issue an invoice with no lines', function () {
    $invoice = Invoice::create(['customer_id' => $this->customer->id]);

    expect(fn () => $this->billing->issue($invoice))->toThrow(ValidationException::class);
});

it('refuses to issue the same invoice twice', function () {
    $invoice = $this->billing->issue(draft());

    expect(fn () => $this->billing->issue($invoice))->toThrow(ValidationException::class);
});

/* ── Payment state is derived, not stored ────────────────── */

it('treats a draft as not yet receivable', function () {
    $invoice = draft();

    expect($invoice->paymentState())->toBe('draft')
        ->and($invoice->balance())->toBe(0.0);
});

it('reports an issued invoice with no receipts as unpaid', function () {
    $invoice = $this->billing->issue(draft());

    expect($invoice->paymentState())->toBe('unpaid')
        ->and($invoice->balance())->toBe(1000.0);
});

it('reports a part payment and the remaining balance', function () {
    $invoice = $this->billing->issue(draft());

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 400, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    expect($invoice->fresh()->paymentState())->toBe('partly_paid')
        ->and($invoice->fresh()->balance())->toBe(600.0);
});

it('settles an invoice once the balance reaches zero', function () {
    $invoice = $this->billing->issue(draft());

    foreach ([400, 600] as $amount) {
        $this->billing->receivePayment([
            'invoice_id' => $invoice->id, 'amount' => $amount, 'cash_box_id' => $this->box->id,
        ], $this->manager);
    }

    expect($invoice->fresh()->paymentState())->toBe('paid')
        ->and($invoice->fresh()->balance())->toBe(0.0);
});

it('refuses to collect more than is outstanding', function () {
    // Overpayment hides a mistake inside a balance that then reads as a credit.
    $invoice = $this->billing->issue(draft());

    expect(fn () => $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 1500, 'cash_box_id' => $this->box->id,
    ], $this->manager))->toThrow(ValidationException::class);

    expect($invoice->fresh()->balance())->toBe(1000.0);
});

it('refuses to collect against a draft', function () {
    $invoice = draft();

    expect(fn () => $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 100, 'cash_box_id' => $this->box->id,
    ], $this->manager))->toThrow(ValidationException::class);
});

it('flags an issued invoice past its due date as overdue', function () {
    $invoice = $this->billing->issue(draft());
    $invoice->forceFill(['due_date' => now()->subDays(3)->toDateString()])->save();

    expect($invoice->fresh()->paymentState())->toBe('overdue');
});

/* ── Void ────────────────────────────────────────────────── */

it('refuses to void an invoice that has been collected against', function () {
    $invoice = $this->billing->issue(draft());
    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 100, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    expect(fn () => $this->billing->void($invoice, 'خطأ'))->toThrow(ValidationException::class);
});

it('drops a voided invoice out of the receivable balance', function () {
    $invoice = $this->billing->issue(draft());
    $this->billing->void($invoice, 'صدرت بالخطأ');

    expect($invoice->fresh()->status)->toBe(InvoiceStatus::Void)
        ->and($invoice->fresh()->balance())->toBe(0.0)
        ->and($this->billing->customerBalance($this->customer->id))->toBe(0.0);
});

/* ── Treasury ────────────────────────────────────────────── */

it('adds a receipt to the box it was paid into', function () {
    $invoice = $this->billing->issue(draft());

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 750, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    expect($this->box->fresh()->balance())->toBe(750.0);
});

it('takes an expense back out of the box', function () {
    $invoice = $this->billing->issue(draft());
    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 1000, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    $this->billing->recordExpense($this->box, 250, $this->manager, ['category' => 'وقود']);

    expect($this->box->fresh()->balance())->toBe(750.0);
});

it('refuses to spend more than the box holds', function () {
    expect(fn () => $this->billing->recordExpense($this->box, 50, $this->manager))
        ->toThrow(ValidationException::class);
});

it('moves money between boxes without creating or destroying any', function () {
    $bank = CashBox::create(['name' => 'حساب البنك', 'type' => 'bank']);
    $invoice = $this->billing->issue(draft());

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 1000, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    $this->billing->transferBetweenBoxes($this->box, $bank, 400, $this->manager, 'إيداع');

    expect($this->box->fresh()->balance())->toBe(600.0)
        ->and($bank->fresh()->balance())->toBe(400.0);
});

it('can rebuild a box balance from its movements alone', function () {
    // If these two can drift, neither number is evidence of anything.
    $bank = CashBox::create(['name' => 'حساب البنك', 'type' => 'bank']);
    $invoice = $this->billing->issue(draft());

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 1000, 'cash_box_id' => $this->box->id,
    ], $this->manager);
    $this->billing->recordExpense($this->box, 120, $this->manager);
    $this->billing->transferBetweenBoxes($this->box, $bank, 300, $this->manager);

    $replay = fn (CashBox $b) => round(
        CashMovement::where('cash_box_id', $b->id)->get()->sum(fn ($m) => $m->signedAmount()),
        2,
    );

    expect($replay($this->box))->toBe($this->box->fresh()->balance())
        ->and($replay($bank))->toBe($bank->fresh()->balance());
});

it('leaves the reversal in the ledger when a receipt is cancelled', function () {
    $invoice = $this->billing->issue(draft());
    $payment = $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 500, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    $this->billing->reversePayment($payment, $this->manager);

    expect($this->box->fresh()->balance())->toBe(0.0)
        ->and($invoice->fresh()->balance())->toBe(1000.0)
        // Nothing is erased: both lines stay so the correction is auditable.
        ->and(CashMovement::where('payment_id', $payment->id)->count())->toBe(2)
        ->and(Payment::withTrashed()->find($payment->id)->trashed())->toBeTrue();
});

/* ── Billing a finished job ──────────────────────────────── */

it('drafts an invoice from the parts a job consumed', function () {
    $ledger = app(StockLedger::class);
    $technician = User::factory()->technician()->create();
    $item = Item::factory()->create(['name' => 'بطارية 100Ah']);
    $van = Warehouse::forTechnician($technician);

    $ledger->receive($item, Warehouse::main(), 10, 900, $this->manager);
    $ledger->transfer($item, Warehouse::main(), $van, 5, $this->manager);

    $task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'assigned_to' => $technician->id,
    ]);

    $ledger->issueToTask($item, $van, 3, $task, $technician);

    $invoice = $this->billing->draftFromTask($task, $this->manager, 14);

    // Three batteries at the average cost, plus the labour line.
    expect($invoice->lines)->toHaveCount(2)
        ->and((float) $invoice->subtotal)->toBe(2700.0)
        ->and($invoice->task_id)->toBe($task->id)
        ->and($invoice->status)->toBe(InvoiceStatus::Draft);
});

it('nets off parts the technician handed back', function () {
    $ledger = app(StockLedger::class);
    $technician = User::factory()->technician()->create();
    $item = Item::factory()->create();
    $van = Warehouse::forTechnician($technician);

    $ledger->receive($item, Warehouse::main(), 10, 100, $this->manager);
    $ledger->transfer($item, Warehouse::main(), $van, 6, $this->manager);

    $task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'assigned_to' => $technician->id,
        'status' => \App\Enums\TaskStatus::InProgress,
    ]);

    // Reported 4, corrected down to 1 — the customer owes for one.
    $ledger->syncTaskConsumption($task, [['item_id' => $item->id, 'qty' => 4]], $technician);
    $ledger->syncTaskConsumption($task, [['item_id' => $item->id, 'qty' => 1]], $technician);

    $invoice = $this->billing->draftFromTask($task, $this->manager);

    expect((float) $invoice->subtotal)->toBe(100.0);
});

it('refuses to bill the same job twice', function () {
    $task = Task::factory()->create(['customer_id' => $this->customer->id]);

    $this->billing->draftFromTask($task, $this->manager);

    expect(fn () => $this->billing->draftFromTask($task, $this->manager))
        ->toThrow(ValidationException::class);
});

/* ── Customer balance ────────────────────────────────────── */

it('sums what a customer owes across their invoices', function () {
    $first = $this->billing->issue(draft([['qty' => 1, 'unit_price' => 1000]]));
    $second = $this->billing->issue(draft([['qty' => 1, 'unit_price' => 500]]));

    $this->billing->receivePayment([
        'invoice_id' => $first->id, 'amount' => 300, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    expect($this->billing->customerBalance($this->customer->id))->toBe(1200.0);
});

it('counts money taken on account against the customer balance', function () {
    // Paid before an invoice existed — still reduces what they owe.
    $this->billing->issue(draft([['qty' => 1, 'unit_price' => 1000]]));

    $this->billing->receivePayment([
        'customer_id' => $this->customer->id, 'amount' => 250, 'cash_box_id' => $this->box->id,
    ], $this->manager);

    expect($this->billing->customerBalance($this->customer->id))->toBe(750.0);
});

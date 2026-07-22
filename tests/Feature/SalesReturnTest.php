<?php

use App\Models\Account;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\SalesReturn;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\BillingService;
use App\Services\ChartOfAccounts;
use App\Services\SalesReturnService;
use App\Services\StockLedger;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->returns = app(SalesReturnService::class);
    $this->billing = app(BillingService::class);
    $this->stock = app(StockLedger::class);

    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create(['name' => 'بنك القاهرة']);
    $this->store = Warehouse::main();
    $this->item = Item::factory()->create(['name' => 'بطارية 100 أمبير']);
});

/**
 * Sell something: an issued invoice with one stock line and one labour line.
 *
 * @param  array<string, mixed>  $attributes
 */
function sold(float $price = 1000, float $qty = 2, array $attributes = []): Invoice
{
    $invoice = Invoice::create([
        'customer_id' => test()->customer->id,
        'issue_date' => now()->toDateString(),
        ...$attributes,
    ]);

    $invoice->lines()->create([
        'item_id' => test()->item->id,
        'description' => 'بطارية 100 أمبير',
        'qty' => $qty,
        'unit_price' => $price,
        'line_total' => $qty * $price,
    ]);

    $invoice->lines()->create([
        'description' => 'أجر زيارة',
        'qty' => 1,
        'unit_price' => 300,
        'line_total' => 300,
    ]);

    return test()->billing->issue(test()->billing->recalculate($invoice));
}

/** The receivable account's balance straight off the journal. */
function receivableBalance(): float
{
    app(ChartOfAccounts::class)->ensure();

    return round(Account::key('receivable')->balance(), 2);
}

/* ── Drafting ────────────────────────────────────────────── */

it('prices the return at what the line was sold for', function () {
    $invoice = sold(1000, 2);
    $line = $invoice->lines->first();

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'بطارية معيبة',
        'lines' => [['invoice_line_id' => $line->id, 'qty' => 1]],
    ], $this->manager);

    expect((float) $return->subtotal)->toBe(1000.0)
        ->and((float) $return->lines[0]->unit_price)->toBe(1000.0);
});

it('reverses the tax that was charged, not today’s rate', function () {
    // A later change to the company's rate is irrelevant to a sale that has
    // already happened.
    $invoice = sold(1000, 1, ['tax_rate' => 14]);
    $line = $invoice->lines->first();

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $line->id, 'qty' => 1]],
    ], $this->manager);

    expect((float) $return->tax_rate)->toBe(14.0)
        ->and((float) $return->tax_amount)->toBe(140.0)
        ->and((float) $return->total)->toBe(1140.0);
});

it('refuses a return against an invoice that was never issued', function () {
    $invoice = Invoice::create(['customer_id' => $this->customer->id]);
    $invoice->lines()->create([
        'description' => 'خدمة', 'qty' => 1, 'unit_price' => 100, 'line_total' => 100,
    ]);

    $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['qty' => 1, 'unit_price' => 100, 'description' => 'خدمة']],
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to send back more than was sold', function () {
    // The one check that stops a credit note being a way to hand money back
    // with no record of what for.
    $invoice = sold(1000, 2);

    $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 5]],
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('counts earlier returns when judging what is left', function () {
    $invoice = sold(1000, 3);
    $line = $invoice->lines->first();

    $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'أول مرتجع',
        'lines' => [['invoice_line_id' => $line->id, 'qty' => 2]],
    ], $this->manager);

    $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'ثاني مرتجع',
        'lines' => [['invoice_line_id' => $line->id, 'qty' => 2]],
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses a line that belongs to a different invoice', function () {
    $invoice = sold();
    $other = sold();

    $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $other->lines->first()->id, 'qty' => 1]],
    ], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('never marks a labour line as restockable', function () {
    // There is nothing to put back on a shelf, and a movement for an item that
    // does not exist would fail at the worst moment.
    $invoice = sold();
    $labour = $invoice->lines->last();

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'إلغاء الزيارة',
        'lines' => [['invoice_line_id' => $labour->id, 'qty' => 1, 'restock' => true]],
    ], $this->manager);

    expect($return->lines[0]->restock)->toBeFalse();
});

/* ── Nothing moves until it is posted ────────────────────── */

it('leaves the invoice and the shelf alone while it is a draft', function () {
    $this->stock->receive($this->item, $this->store, 10, 400, $this->manager);
    $invoice = sold(1000, 2);

    $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);

    expect($invoice->fresh()->balance())->toBe(2300.0)
        ->and($invoice->fresh()->creditedTotal())->toBe(0.0)
        ->and((float) $this->item->fresh()->levels()->sum('qty'))->toBe(10.0);
});

/* ── Posting ─────────────────────────────────────────────── */

it('reduces what the customer owes', function () {
    $invoice = sold(1000, 2);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'بطارية معيبة',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);

    $this->returns->post($return, $this->manager);

    expect($invoice->fresh()->creditedTotal())->toBe(1000.0)
        ->and($invoice->fresh()->balance())->toBe(1300.0);
});

it('puts restocked goods back on the shelf', function () {
    $this->stock->receive($this->item, $this->store, 10, 400, $this->manager);
    $invoice = sold(1000, 2);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'لم تُستخدم',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 2]],
    ], $this->manager);

    $this->returns->post($return, $this->manager);

    expect((float) $this->item->fresh()->levels()->sum('qty'))->toBe(12.0);
});

it('keeps scrap off the shelf', function () {
    // A burnt-out unit taken back out of goodwill is worth nothing, and letting
    // it become inventory is how a valuation quietly fills with rubbish.
    $this->stock->receive($this->item, $this->store, 10, 400, $this->manager);
    $invoice = sold(1000, 2);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'محترقة',
        'lines' => [[
            'invoice_line_id' => $invoice->lines->first()->id,
            'qty' => 2,
            'restock' => false,
        ]],
    ], $this->manager);

    $this->returns->post($return, $this->manager);

    expect((float) $this->item->fresh()->levels()->sum('qty'))->toBe(10.0)
        // The customer is still credited — the goods were still handed back.
        ->and($invoice->fresh()->creditedTotal())->toBe(2000.0);
});

it('values the goods at what they cost when they were sold', function () {
    // Not today's average: the entry that put them into cost of sales has to
    // unwind by the same amount, or the margin never comes back.
    $this->stock->receive($this->item, $this->store, 10, 400, $this->manager);

    $task = Task::factory()->create(['customer_id' => $this->customer->id]);
    $this->stock->issueToTask($this->item, $this->store, 2, $task, $this->manager);

    $invoice = sold(1000, 2, ['task_id' => $task->id]);

    // A later purchase moves the average well away from 400.
    $this->stock->receive($this->item, $this->store, 10, 900, $this->manager);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 2]],
    ], $this->manager);

    $this->returns->post($return, $this->manager);

    expect((float) $return->fresh()->lines[0]->unit_cost)->toBe(400.0);
});

it('refuses to post the same return twice', function () {
    $invoice = sold();

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);

    $this->returns->post($return, $this->manager);
    $this->returns->post($return->fresh(), $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to credit more than the invoice is worth', function () {
    $invoice = sold(1000, 1);

    // Two drafts, each defensible alone, together more than the invoice.
    $first = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'أول',
        'lines' => [['description' => 'تسوية', 'qty' => 1, 'unit_price' => 900]],
    ], $this->manager);

    $second = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'ثاني',
        'lines' => [['description' => 'تسوية', 'qty' => 1, 'unit_price' => 900]],
    ], $this->manager);

    $this->returns->post($first, $this->manager);
    $this->returns->post($second, $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to delete a posted return', function () {
    $invoice = sold();

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);

    $this->returns->post($return, $this->manager);
    $this->returns->discard($return->fresh());
})->throws(Illuminate\Validation\ValidationException::class);

/* ── What the invoice reads as ───────────────────────────── */

it('reads a fully returned invoice as credited, not paid', function () {
    // Calling it paid would hide a returned sale inside the collection figures.
    $invoice = sold(1000, 1);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'إلغاء البيع',
        'lines' => [
            ['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1],
            ['invoice_line_id' => $invoice->lines->last()->id, 'qty' => 1],
        ],
    ], $this->manager);

    $this->returns->post($return, $this->manager);

    expect($invoice->fresh()->paymentState())->toBe('credited')
        ->and($invoice->fresh()->balance())->toBe(0.0);
});

it('settles an invoice that was part paid and part returned', function () {
    $invoice = sold(1000, 1);

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'amount' => 300,
    ], $this->manager);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);
    $this->returns->post($return, $this->manager);

    expect($invoice->fresh()->balance())->toBe(0.0)
        ->and($invoice->fresh()->paymentState())->toBe('paid');
});

it('drops a fully credited invoice off the chase list', function () {
    // Otherwise it keeps appearing as receivable, including in the figure the
    // treasury screen reports.
    $invoice = sold(1000, 1);

    expect(Invoice::query()->outstanding()->count())->toBe(1);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'إلغاء',
        'lines' => [
            ['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1],
            ['invoice_line_id' => $invoice->lines->last()->id, 'qty' => 1],
        ],
    ], $this->manager);
    $this->returns->post($return, $this->manager);

    expect(Invoice::query()->outstanding()->count())->toBe(0);
});

/* ── The books ───────────────────────────────────────────── */

it('unwinds the receivable in the ledger', function () {
    $invoice = sold(1000, 1);

    expect(receivableBalance())->toBe(1300.0);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);
    $this->returns->post($return, $this->manager);

    expect(receivableBalance())->toBe(300.0)
        ->and(receivableBalance())->toBe($invoice->fresh()->balance());
});

it('keeps the return visible instead of netting it off revenue', function () {
    // A month with heavy returns should not look like a quiet month with the
    // same net, so the debit lands on contra-revenue.
    $invoice = sold(1000, 1);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);
    $this->returns->post($return, $this->manager);

    app(ChartOfAccounts::class)->ensure();

    expect(round(Account::key('sales_return')->movement()['debit'], 2))->toBe(1000.0)
        ->and(round(Account::key('sales_revenue')->movement()['credit'], 2))->toBe(1300.0);
});

it('reverses cost of sales by what the goods cost', function () {
    $this->stock->receive($this->item, $this->store, 10, 400, $this->manager);

    $task = Task::factory()->create(['customer_id' => $this->customer->id]);
    $this->stock->issueToTask($this->item, $this->store, 2, $task, $this->manager);

    $invoice = sold(1000, 2, ['task_id' => $task->id]);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 2]],
    ], $this->manager);
    $this->returns->post($return, $this->manager);

    app(ChartOfAccounts::class)->ensure();

    // 800 out on the job, 800 back on the return — nothing left in cost of
    // sales for a job whose goods all came back.
    expect(round(Account::key('cogs')->balance(), 2))->toBe(0.0);
});

/* ── Through the API ─────────────────────────────────────── */

it('says what is still returnable on an invoice', function () {
    $invoice = sold(1000, 3);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);
    $this->returns->post($return, $this->manager);

    $response = actingAs($this->manager)
        ->getJson("/api/invoices/{$invoice->id}/returnable")
        ->assertOk();

    expect((float) $response->json('lines.0.remaining'))->toBe(2.0)
        ->and((float) $response->json('lines.0.returned'))->toBe(1.0)
        ->and((float) $response->json('invoice.credited'))->toBe(1000.0);
});

it('drafts and posts a credit note through the API', function () {
    $invoice = sold(1000, 2);

    $id = actingAs($this->manager)
        ->postJson('/api/sales-returns', [
            'invoice_id' => $invoice->id,
            'reason' => 'بطارية معيبة',
            'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
        ])
        ->assertCreated()
        ->json('data.id');

    actingAs($this->manager)
        ->postJson("/api/sales-returns/{$id}/post")
        ->assertOk()
        ->assertJsonPath('data.status', 'posted');

    expect($invoice->fresh()->balance())->toBe(1300.0);
});

it('shows the credit on the customer statement', function () {
    $invoice = sold(1000, 1);

    $return = $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);
    $this->returns->post($return, $this->manager);

    $response = actingAs($this->manager)
        ->getJson("/api/customers/{$this->customer->id}/statement")
        ->assertOk();

    $credit = collect($response->json('data'))->firstWhere('type', 'credit');

    expect($credit)->not->toBeNull()
        ->and((float) $credit['credit'])->toBe(1000.0)
        ->and((float) $response->json('meta.balance'))->toBe(300.0);
});

it('keeps a technician out of credit notes', function () {
    actingAs($this->technician)->getJson('/api/sales-returns')->assertForbidden();
    actingAs($this->technician)
        ->postJson('/api/sales-returns', ['invoice_id' => 1, 'reason' => 'x', 'lines' => []])
        ->assertForbidden();
});

it('lists credit notes for a manager', function () {
    $invoice = sold();

    $this->returns->draft([
        'invoice_id' => $invoice->id,
        'reason' => 'مرتجع',
        'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => 1]],
    ], $this->manager);

    $response = actingAs($this->manager)->getJson('/api/sales-returns')->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('data.0.status_label'))->toBe('مسودة');
});

it('numbers credit notes in sequence for the year', function () {
    $invoice = sold(1000, 3);

    foreach ([1, 1] as $qty) {
        $this->returns->draft([
            'invoice_id' => $invoice->id,
            'reason' => 'مرتجع',
            'lines' => [['invoice_line_id' => $invoice->lines->first()->id, 'qty' => $qty]],
        ], $this->manager);
    }

    expect(SalesReturn::orderByDesc('id')->first()->code)->toBe('CN-'.now()->year.'-0002');
});

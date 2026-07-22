<?php

use App\Models\Account;
use App\Models\CashBox;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\BillingService;
use App\Services\ChartOfAccounts;
use App\Services\FinancialReports;
use App\Services\Ledger;
use App\Services\StockLedger;
use Illuminate\Validation\ValidationException;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    app(ChartOfAccounts::class)->ensure();

    $this->ledger = app(Ledger::class);
    $this->billing = app(BillingService::class);
    $this->stock = app(StockLedger::class);
    $this->reports = app(FinancialReports::class);

    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->till = CashBox::default();
});

/** An issued invoice for a plain sale, no tax, no discount. */
function bill(float $amount, float $taxRate = 0, float $discount = 0): Invoice
{
    $invoice = Invoice::create([
        'customer_id' => Customer::factory()->create()->id,
        'tax_rate' => $taxRate,
        'discount' => $discount,
    ]);

    $invoice->lines()->create([
        'description' => 'خدمة', 'qty' => 1, 'unit_price' => $amount, 'line_total' => $amount,
    ]);

    return test()->billing->issue(test()->billing->recalculate($invoice));
}

function balanceOf(string $key): float
{
    return Account::key($key)->balance();
}

/** Money in the till, so the tests that spend it have something to spend. */
function fund(float $amount): void
{
    test()->billing->receivePayment([
        'customer_id' => Customer::factory()->create()->id,
        'cash_box_id' => test()->till->id,
        'amount' => $amount,
    ], test()->manager);
}

/* ── The chart ───────────────────────────────────────────── */

it('seeds a chart whose every rule has an account to post to', function () {
    foreach (array_filter(array_column(ChartOfAccounts::DEFAULT, 3)) as $key) {
        expect(Account::key($key))->toBeInstanceOf(Account::class);
    }
});

it('gives each cash box its own account, under cash or under staff custody', function () {
    $technician = User::factory()->technician()->create();
    $float = CashBox::create(['name' => 'عهدة', 'type' => 'custody', 'user_id' => $technician->id]);

    app(ChartOfAccounts::class)->syncCashBoxes();

    expect($this->till->fresh()->account->parent->key)->toBe('cash')
        ->and($float->fresh()->account->parent->key)->toBe('staff_custody');
});

/* ── The two rules the ledger exists to enforce ──────────── */

it('refuses an entry that does not balance', function () {
    $this->ledger->post([
        ['account' => 'receivable', 'debit' => 100],
        ['account' => 'sales_revenue', 'credit' => 90],
    ]);
})->throws(ValidationException::class);

it('refuses to post onto a heading', function () {
    $this->ledger->post([
        ['account' => 'cash', 'debit' => 100],
        ['account' => 'sales_revenue', 'credit' => 100],
    ]);
})->throws(ValidationException::class);

it('posts a document event once however many times it is asked', function () {
    $invoice = bill(1000);
    $poster = app(App\Services\LedgerPoster::class);

    $poster->invoice($invoice);
    $poster->invoice($invoice);
    $poster->invoice($invoice);

    expect(JournalEntry::where('sourceable_id', $invoice->id)
        ->where('sourceable_type', $invoice->getMorphClass())
        ->where('event', 'issued')
        ->count())->toBe(1);
});

/* ── What each document means ────────────────────────────── */

it('debits the customer and credits revenue and tax when an invoice is issued', function () {
    // 1000 of work, 100 off, 14% on what is left.
    bill(1000, taxRate: 14, discount: 100);

    expect(balanceOf('receivable'))->toBe(1026.0)      // 900 + 126
        ->and(balanceOf('sales_revenue'))->toBe(1000.0)
        ->and(balanceOf('sales_discount'))->toBe(-100.0)
        ->and(balanceOf('vat_output'))->toBe(126.0);
});

it('bills a job against service revenue rather than sales', function () {
    $invoice = bill(500);
    expect(balanceOf('service_revenue'))->toBe(0.0);

    $invoice->forceFill(['task_id' => null])->save();
    expect(balanceOf('sales_revenue'))->toBe(500.0);
});

it('moves a receipt from the customer into the box it was paid into', function () {
    $invoice = bill(1000);

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id,
        'cash_box_id' => $this->till->id,
        'amount' => 400,
    ], $this->manager);

    expect(balanceOf('receivable'))->toBe(600.0)
        ->and($this->till->fresh()->account->balance())->toBe(400.0);
});

it('posts a transfer once, on the leg that paid', function () {
    $bank = CashBox::create(['name' => 'البنك الأهلي', 'type' => 'bank']);

    fund(5000);

    $before = JournalEntry::count();
    $this->billing->transferBetweenBoxes($this->till, $bank, 3000, $this->manager);

    // Two treasury movements, one journal entry — the receiving leg says
    // nothing the paying leg has not already said.
    expect(JournalEntry::count() - $before)->toBe(1)
        ->and($bank->fresh()->account->balance())->toBe(3000.0)
        ->and($this->till->fresh()->account->balance())->toBe(2000.0);
});

it('charges an expense to the heading whose name was typed', function () {
    fund(5000);

    $this->billing->recordExpense($this->till, 800, $this->manager, ['category' => 'إيجارات']);

    expect(Account::where('name', 'إيجارات')->first()->balance())->toBe(800.0)
        ->and(balanceOf('general_expense'))->toBe(0.0);
});

it('falls back to the general heading rather than losing an expense', function () {
    fund(5000);

    $this->billing->recordExpense($this->till, 250, $this->manager, ['category' => 'حاجة غريبة']);

    expect(balanceOf('general_expense'))->toBe(250.0);
});

it('books stock in against the supplier and out against cost of sales', function () {
    $item = Item::factory()->create();
    $supplier = Supplier::create(['name' => 'مورد البطاريات']);

    app(App\Services\PurchasingService::class)
        ->receiveDirect($supplier, $item, 10, 50, $this->manager);

    expect(balanceOf('inventory'))->toBe(500.0)
        ->and(balanceOf('payable'))->toBe(500.0);

    // What the ledger says is owed and what the supplier card says must be the
    // same number, or one of the two screens is lying.
    expect(balanceOf('payable'))->toBe($supplier->balance());

    $technician = User::factory()->technician()->create();
    $van = Warehouse::forTechnician($technician);
    $this->stock->transfer($item, Warehouse::main(), $van, 3, $this->manager);
    $task = App\Models\Task::factory()->create();
    $this->stock->issueToTask($item, $van, 3, $task, $technician);

    expect(balanceOf('cogs'))->toBe(150.0)
        ->and(balanceOf('inventory'))->toBe(350.0);
});

it('does not post a transfer between a store and a van', function () {
    $item = Item::factory()->create();
    $store = Warehouse::main();
    $technician = User::factory()->technician()->create();
    $van = Warehouse::forTechnician($technician);

    $this->stock->receive($item, $store, 10, 50, $this->manager);
    $before = JournalEntry::count();

    $this->stock->transfer($item, $store, $van, 4, $this->manager);

    // The company owns the same goods either way.
    expect(JournalEntry::count())->toBe($before)
        ->and(balanceOf('inventory'))->toBe(500.0);
});

/* ── Undoing things ──────────────────────────────────────── */

it('undoes a void with a mirror entry and leaves the original standing', function () {
    $invoice = bill(1000);
    $issued = JournalEntry::where('sourceable_id', $invoice->id)->where('event', 'issued')->first();

    $this->billing->void($invoice->fresh(), 'خطأ في الإصدار');

    $mirror = JournalEntry::where('reverses_id', $issued->id)->first();

    expect($mirror)->not->toBeNull()
        ->and($issued->fresh()->is_void)->toBeFalse()
        ->and($mirror->is_void)->toBeFalse()
        // Both count, and together they come to nothing.
        ->and(balanceOf('receivable'))->toBe(0.0)
        ->and(balanceOf('sales_revenue'))->toBe(0.0);
});

it('refuses to void an entry a document is answerable for', function () {
    $invoice = bill(1000);
    $entry = JournalEntry::where('sourceable_id', $invoice->id)->first();

    $this->ledger->void($entry);
})->throws(ValidationException::class);

/* ── The statements ──────────────────────────────────────── */

it('keeps the trial balance level through a full trading cycle', function () {
    $item = Item::factory()->create();
    $store = Warehouse::main();

    $this->stock->receive($item, $store, 20, 30, $this->manager);
    $invoice = bill(2000, taxRate: 14);
    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'cash_box_id' => $this->till->id, 'amount' => 1000,
    ], $this->manager);
    $this->billing->recordExpense($this->till, 300, $this->manager, ['category' => 'وقود وانتقالات']);

    $trial = $this->reports->trialBalance();

    expect($trial['difference'])->toBe(0.0)
        ->and($trial['debit_total'])->toBe($trial['credit_total']);
});

it('balances the sheet without anyone having to close the year', function () {
    $item = Item::factory()->create();
    $store = Warehouse::main();
    $technician = User::factory()->technician()->create();

    $this->stock->receive($item, $store, 20, 30, $this->manager);
    $invoice = bill(2000, taxRate: 14);
    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'cash_box_id' => $this->till->id, 'amount' => 1500,
    ], $this->manager);
    $this->billing->recordExpense($this->till, 300, $this->manager, ['category' => 'رواتب وأجور']);

    $sheet = $this->reports->balanceSheet();

    expect($sheet['difference'])->toBe(0.0)
        ->and($sheet['assets_total'])->toBe($sheet['liabilities_and_equity_total']);
});

it('reports profit as revenue less cost of sales less expenses', function () {
    $item = Item::factory()->create();
    $store = Warehouse::main();
    $technician = User::factory()->technician()->create();
    $van = Warehouse::forTechnician($technician);

    $supplier = Supplier::create(['name' => 'مورد']);
    app(App\Services\PurchasingService::class)
        ->receiveDirect($supplier, $item, 10, 40, $this->manager);
    $this->stock->transfer($item, $store, $van, 5, $this->manager);

    bill(1000);
    fund(500);
    $this->billing->recordExpense($this->till, 100, $this->manager, ['category' => 'إيجارات']);

    $income = $this->reports->incomeStatement();

    // The 500 funding receipt is a customer paying on account, not revenue.
    expect($income['revenue_total'])->toBe(1000.0)
        ->and($income['expenses_total'])->toBe(100.0)
        ->and($income['net_profit'])->toBe(900.0);
});

it('leaves nothing behind once the backfill has run', function () {
    $item = Item::factory()->create();
    $this->stock->receive($item, Warehouse::main(), 5, 100, $this->manager);
    bill(1000);

    // Wipe the journal as though the module had only just been installed.
    JournalEntry::query()->delete();

    app(App\Services\LedgerBackfill::class)->run($this->admin);

    expect(array_sum($this->reports->unposted()))->toBe(0)
        ->and($this->reports->balanceSheet()['difference'])->toBe(0.0);
});

/* ── Who may do what ─────────────────────────────────────── */

it('lets a manager read the statements but not touch the chart', function () {
    actingAs($this->manager)->getJson('/api/accounting/trial-balance')->assertOk();
    actingAs($this->manager)->getJson('/api/accounting/balance-sheet')->assertOk();

    actingAs($this->manager)->postJson('/api/accounting/accounts', [
        'code' => '5299', 'name' => 'حساب', 'type' => 'expense',
    ])->assertForbidden();
});

it('keeps a technician out of the books entirely', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/accounting/summary')->assertForbidden();
    actingAs($technician)->getJson('/api/accounting/entries')->assertForbidden();
});

it('serves every accounting screen with a period on it', function () {
    // A trading cycle first, so each endpoint has something to render rather
    // than passing on an empty chart.
    $item = Item::factory()->create();
    app(App\Services\PurchasingService::class)
        ->receiveDirect(Supplier::create(['name' => 'مورد']), $item, 5, 60, $this->manager);
    $invoice = bill(1500, taxRate: 14);
    $this->billing->receivePayment([
        'invoice_id' => $invoice->id, 'cash_box_id' => $this->till->id, 'amount' => 500,
    ], $this->manager);

    $range = ['from' => now()->startOfYear()->toDateString(), 'to' => now()->toDateString()];
    $receivable = Account::key('receivable');

    foreach ([
        '/api/accounting/summary',
        '/api/accounting/accounts',
        '/api/accounting/entries',
        '/api/accounting/cost-centers',
        '/api/accounting/trial-balance',
        '/api/accounting/income-statement',
        "/api/accounting/accounts/{$receivable->id}/ledger",
    ] as $url) {
        actingAs($this->admin)->getJson($url.'?'.http_build_query($range))->assertOk();
    }

    actingAs($this->admin)
        ->getJson('/api/accounting/balance-sheet?as_of='.$range['to'])
        ->assertOk()
        ->assertJsonPath('data.difference', 0);
});

it('refuses to delete an account the posting rules depend on', function () {
    $receivable = Account::key('receivable');

    actingAs($this->admin)
        ->deleteJson("/api/accounting/accounts/{$receivable->id}")
        ->assertStatus(422);
});

it('accepts a hand-written entry that balances and refuses one that does not', function () {
    $capital = Account::key('capital');
    $box = app(ChartOfAccounts::class)->accountFor($this->till);

    actingAs($this->admin)->postJson('/api/accounting/entries', [
        'entry_date' => now()->toDateString(),
        'memo' => 'رأس مال مودع',
        'lines' => [
            ['account_id' => $box->id, 'debit' => 50000],
            ['account_id' => $capital->id, 'credit' => 50000],
        ],
    ])->assertCreated();

    actingAs($this->admin)->postJson('/api/accounting/entries', [
        'entry_date' => now()->toDateString(),
        'lines' => [
            ['account_id' => $box->id, 'debit' => 100],
            ['account_id' => $capital->id, 'credit' => 90],
        ],
    ])->assertStatus(422);

    expect($capital->balance())->toBe(50000.0);
});

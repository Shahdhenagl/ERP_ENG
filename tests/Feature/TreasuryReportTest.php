<?php

use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use App\Services\BillingService;
use App\Services\TreasuryReport;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->report = app(TreasuryReport::class);
    $this->billing = app(BillingService::class);
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->till = CashBox::default();
});

/** Money in, through a real collection, dated. */
function collect_(float $amount, ?string $on = null, ?CashBox $box = null): void
{
    $invoice = Invoice::create(['customer_id' => Customer::factory()->create()->id]);
    $invoice->lines()->create([
        'description' => 'خدمة', 'qty' => 1, 'unit_price' => $amount, 'line_total' => $amount,
    ]);

    $payment = test()->billing->receivePayment([
        'invoice_id' => test()->billing->issue(test()->billing->recalculate($invoice))->id,
        'cash_box_id' => ($box ?? test()->till)->id,
        'amount' => $amount,
    ], test()->manager);

    if ($on) {
        // The ledger is read by movement date, so backdate both together.
        CashMovement::where('payment_id', $payment->id)->update(['created_at' => $on]);
    }
}

/* ── The period bounds what is counted ───────────────────── */

it('counts only what happened inside the window', function () {
    collect_(1000, now()->subMonths(2)->toDateTimeString());
    collect_(400, now()->toDateTimeString());

    $report = $this->report->forPeriod([
        'from' => now()->startOfMonth()->toDateString(),
        'to' => now()->endOfMonth()->toDateString(),
    ]);

    expect($report['income_total'])->toBe(400.0);
});

it('opens the period with everything that came before it', function () {
    // A statement without its opening figure says nothing about the balance.
    collect_(1000, now()->subMonths(2)->toDateTimeString());
    collect_(400, now()->toDateTimeString());

    $report = $this->report->forPeriod(['from' => now()->startOfMonth()->toDateString()]);

    expect($report['opening_balance'])->toBe(1000.0)
        ->and($report['closing_balance'])->toBe(1400.0);
});

it('counts everything when no window is given', function () {
    collect_(1000, now()->subYear()->toDateTimeString());
    collect_(400);

    expect($this->report->forPeriod()['income_total'])->toBe(1400.0);
});

/* ── Income and expense are broken down by cause ─────────── */

it('groups income by what caused it', function () {
    collect_(1000);

    $income = $this->report->forPeriod()['income'];

    expect($income)->toHaveCount(1)
        ->and($income[0]['source'])->toBe('payment')
        ->and($income[0]['label'])->toBe('تحصيل من العملاء')
        ->and($income[0]['total'])->toBe(1000.0);
});

it('separates an expense from a supplier payment', function () {
    collect_(5000);
    $this->billing->recordExpense($this->till, 300, $this->manager, ['category' => 'وقود']);

    $supplier = \App\Models\Supplier::create(['name' => 'مورّد']);
    app(\App\Services\PurchasingService::class)->paySupplier([
        'supplier_id' => $supplier->id,
        'cash_box_id' => $this->till->id,
        'amount' => 1200,
    ], $this->manager);

    $expense = collect($this->report->forPeriod()['expense'])->keyBy('source');

    expect($expense['expense']['total'])->toBe(300.0)
        ->and($expense['supplier_payment']['total'])->toBe(1200.0)
        ->and($this->report->forPeriod()['expense_total'])->toBe(1500.0);
});

it('nets to income minus expense', function () {
    collect_(5000);
    $this->billing->recordExpense($this->till, 800, $this->manager);

    expect($this->report->forPeriod()['net'])->toBe(4200.0);
});

/* ── Transfers are not income ────────────────────────────── */

it('leaves transfers out of a company-wide total', function () {
    // Moving money between our own boxes is neither earned nor spent; counting
    // it would report a day of banking as a day of trading.
    collect_(5000);
    $bank = CashBox::create(['name' => 'حساب البنك', 'type' => 'bank']);

    $this->billing->transferBetweenBoxes($this->till, $bank, 2000, $this->manager);

    $report = $this->report->forPeriod();

    expect($report['income_total'])->toBe(5000.0)
        ->and($report['expense_total'])->toBe(0.0)
        ->and($report['closing_balance'])->toBe(5000.0);
});

it('shows the transfer when looking at one box', function () {
    // Per box it is real movement — the till genuinely lost 2000.
    collect_(5000);
    $bank = CashBox::create(['name' => 'حساب البنك', 'type' => 'bank']);
    $this->billing->transferBetweenBoxes($this->till, $bank, 2000, $this->manager);

    $report = $this->report->forPeriod(['cash_box_id' => $this->till->id]);

    expect(collect($report['expense'])->firstWhere('source', 'transfer')['total'])->toBe(2000.0)
        ->and($report['boxes'])->toHaveCount(1);
});

/* ── One box's statement ─────────────────────────────────── */

it('carries the balance down a box statement', function () {
    collect_(1000);
    $this->billing->recordExpense($this->till, 250, $this->manager, ['category' => 'مواصلات']);

    $statement = $this->report->statement($this->till);

    expect($statement['rows'])->toHaveCount(2)
        ->and($statement['rows'][0]['balance'])->toBe(1000.0)
        ->and($statement['rows'][1]['balance'])->toBe(750.0)
        ->and($statement['in_total'])->toBe(1000.0)
        ->and($statement['out_total'])->toBe(250.0)
        ->and($statement['closing_balance'])->toBe(750.0);
});

it('starts a windowed statement from the balance before it', function () {
    collect_(1000, now()->subMonths(2)->toDateTimeString());
    collect_(500, now()->toDateTimeString());

    $statement = $this->report->statement($this->till, now()->startOfMonth()->toDateString());

    expect($statement['opening_balance'])->toBe(1000.0)
        ->and($statement['rows'])->toHaveCount(1)
        ->and($statement['closing_balance'])->toBe(1500.0);
});

it('reports an empty box without failing', function () {
    $statement = $this->report->statement($this->till);

    expect($statement['rows'])->toHaveCount(0)
        ->and($statement['closing_balance'])->toBe(0.0);
});

/* ── Through the API ─────────────────────────────────────── */

it('serves the analysis with the summary', function () {
    collect_(3000);
    $this->billing->recordExpense($this->till, 500, $this->manager);

    $response = actingAs($this->manager)->getJson('/api/treasury/summary')->assertOk();

    expect((float) $response->json('analysis.income_total'))->toBe(3000.0)
        ->and((float) $response->json('analysis.expense_total'))->toBe(500.0)
        ->and((float) $response->json('analysis.net'))->toBe(2500.0);
});

it('narrows the analysis to a window through the API', function () {
    collect_(3000, now()->subYear()->toDateTimeString());
    collect_(700, now()->toDateTimeString());

    $response = actingAs($this->manager)
        ->getJson('/api/treasury/summary?from='.now()->startOfMonth()->toDateString())
        ->assertOk();

    expect((float) $response->json('analysis.income_total'))->toBe(700.0)
        ->and((float) $response->json('analysis.opening_balance'))->toBe(3000.0);
});

it('serves one box statement through the API', function () {
    collect_(900);

    $response = actingAs($this->manager)
        ->getJson("/api/treasury/boxes/{$this->till->id}/statement")
        ->assertOk();

    expect($response->json('data.rows'))->toHaveCount(1)
        ->and((float) $response->json('data.closing_balance'))->toBe(900.0);
});

it('lets a manager open another box', function () {
    actingAs($this->manager)
        ->postJson('/api/treasury/boxes', [
            'name' => 'حساب البنك الأهلي',
            'type' => 'bank',
            'account_number' => '1234567890',
        ])
        ->assertCreated();

    expect(CashBox::where('name', 'حساب البنك الأهلي')->exists())->toBeTrue();
});

it('keeps a technician out of the treasury', function () {
    actingAs($this->technician)->getJson('/api/treasury/summary')->assertForbidden();
    actingAs($this->technician)
        ->getJson("/api/treasury/boxes/{$this->till->id}/statement")
        ->assertForbidden();
});

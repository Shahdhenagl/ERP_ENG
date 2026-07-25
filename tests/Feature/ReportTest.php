<?php

use App\Models\Asset;
use App\Models\CashBox;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\LeaveRequest;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\BillingService;
use App\Services\CustodyService;
use App\Services\FinancialReports;
use App\Services\PayrollService;
use App\Services\ReportService;
use App\Services\StockLedger;
use App\Services\WarrantyService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->reports = app(ReportService::class);
    $this->billing = app(BillingService::class);
    $this->stock = app(StockLedger::class);

    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create(['name' => 'بنك القاهرة']);
    $this->store = Warehouse::main();
});

/** Raise, issue and optionally collect against an invoice. */
function sell_(float $amount, ?Task $task = null, ?string $on = null): Invoice
{
    $invoice = Invoice::create([
        'customer_id' => test()->customer->id,
        'task_id' => $task?->id,
        'issue_date' => $on ?? now()->toDateString(),
    ]);

    $invoice->lines()->create([
        'description' => 'خدمة', 'qty' => 1,
        'unit_price' => $amount, 'line_total' => $amount,
    ]);

    return test()->billing->issue(test()->billing->recalculate($invoice));
}

/* ── Sales ───────────────────────────────────────────────── */

it('counts only invoices that were issued', function () {
    // A draft is a document nobody has been told about. Counting it reports a
    // sale that has not happened.
    sell_(1000);

    Invoice::create(['customer_id' => test()->customer->id])
        ->lines()->create([
            'description' => 'مسودة', 'qty' => 1, 'unit_price' => 9999, 'line_total' => 9999,
        ]);

    $report = $this->reports->sales();

    expect($report['invoices'])->toBe(1)
        ->and($report['total'])->toBe(1000.0);
});

it('bounds sales by the window', function () {
    sell_(1000, on: now()->subMonths(3)->toDateString());
    sell_(500);

    $report = $this->reports->sales(now()->startOfMonth()->toDateString());

    expect($report['invoices'])->toBe(1)
        ->and($report['total'])->toBe(500.0);
});

it('splits what was collected from what is still owed', function () {
    $invoice = sell_(1000);

    $this->billing->receivePayment([
        'invoice_id' => $invoice->id,
        'amount' => 400,
    ], $this->manager);

    $report = $this->reports->sales();

    expect($report['collected'])->toBe(400.0)
        ->and($report['outstanding'])->toBe(600.0);
});

it('ranks customers by what they were invoiced', function () {
    sell_(1000);

    $second = Customer::factory()->create(['name' => 'مصنع الدلتا']);
    $invoice = Invoice::create(['customer_id' => $second->id, 'issue_date' => now()->toDateString()]);
    $invoice->lines()->create([
        'description' => 'خدمة', 'qty' => 1, 'unit_price' => 5000, 'line_total' => 5000,
    ]);
    $this->billing->issue($this->billing->recalculate($invoice));

    $report = $this->reports->sales();

    expect($report['by_customer'][0]['name'])->toBe('مصنع الدلتا')
        ->and($report['by_customer'][0]['total'])->toBe(5000.0)
        ->and($report['by_customer'][1]['name'])->toBe('بنك القاهرة');
});

it('averages nothing rather than dividing by zero', function () {
    expect($this->reports->sales()['average_invoice'])->toBe(0.0);
});

/* ── Profitability ───────────────────────────────────────── */

it('takes the period figures from the books, not from its own sum', function () {
    // If these two ever disagree, one of them is lying — so the report reads
    // the income statement rather than recomputing revenue.
    sell_(2000);

    $report = $this->reports->profitability();
    $statement = app(FinancialReports::class)->incomeStatement();

    expect($report['revenue'])->toBe($statement['revenue_total'])
        ->and($report['net_profit'])->toBe($statement['net_profit'])
        ->and($report['gross_profit'])->toBe($statement['gross_profit']);
});

it('sets a job revenue against the parts it consumed', function () {
    $item = Item::factory()->create();
    $this->stock->receive($item, $this->store, 10, 100, $this->manager);

    $task = Task::factory()->create(['customer_id' => $this->customer->id]);
    $this->stock->issueToTask($item, $this->store, 3, $task, $this->manager);

    sell_(1000, $task);

    $job = $this->reports->profitability()['jobs'][0];

    expect($job['revenue'])->toBe(1000.0)
        ->and($job['parts_cost'])->toBe(300.0)
        ->and($job['margin'])->toBe(700.0)
        ->and($job['margin_pct'])->toBe(70.0);
});

it('reports a job billed at nothing without dividing by zero', function () {
    $task = Task::factory()->create(['customer_id' => $this->customer->id]);
    sell_(0, $task);

    expect($this->reports->profitability()['jobs'][0]['margin_pct'])->toBe(0.0);
});

/* ── Stock ───────────────────────────────────────────────── */

it('values the stock by warehouse', function () {
    $item = Item::factory()->create();
    $this->stock->receive($item, $this->store, 10, 250, $this->manager);

    $report = $this->reports->stock();

    expect($report['total_value'])->toBe(2500.0)
        ->and($report['by_warehouse'][0]['value'])->toBe(2500.0)
        ->and($report['by_warehouse'][0]['type_label'])->toBe('مخزن');
});

it('finds stock nobody has touched', function () {
    // Money sitting in a corner, invisible on a total.
    $moving = Item::factory()->create(['name' => 'بطارية متحركة']);
    $idle = Item::factory()->create(['name' => 'صنف راكد']);

    $this->stock->receive($moving, $this->store, 5, 100, $this->manager);
    $old = $this->stock->receive($idle, $this->store, 5, 200, $this->manager);

    \App\Models\StockMovement::where('id', $old->id)
        ->update(['created_at' => now()->subMonths(6)]);

    $report = $this->reports->stock(90);

    expect($report['idle'])->toHaveCount(1)
        ->and($report['idle'][0]['name'])->toBe('صنف راكد')
        ->and($report['idle_value'])->toBe(1000.0);
});

it('leaves an item with no stock out of the idle list', function () {
    // Nothing on the shelf is not money sitting still; it is just an item.
    Item::factory()->create();

    expect($this->reports->stock(1)['idle'])->toHaveCount(0);
});

it('lists what is below its reorder level with the shortfall', function () {
    $item = Item::factory()->create(['reorder_level' => 10]);
    $this->stock->receive($item, $this->store, 4, 100, $this->manager);

    $below = $this->reports->stock()['below_reorder'];

    expect($below)->toHaveCount(1)
        ->and($below[0]['shortfall'])->toBe(6.0);
});

it('ranks the parts that get consumed most', function () {
    $item = Item::factory()->create(['name' => 'بطارية 100 أمبير']);
    $this->stock->receive($item, $this->store, 20, 300, $this->manager);

    $task = Task::factory()->create(['customer_id' => $this->customer->id]);
    $this->stock->issueToTask($item, $this->store, 5, $task, $this->manager);

    $consumed = $this->reports->stock()['most_consumed'];

    expect($consumed[0]['name'])->toBe('بطارية 100 أمبير')
        ->and($consumed[0]['value'])->toBe(1500.0);
});

/* ── Custody ─────────────────────────────────────────────── */

it('totals what every technician is holding', function () {
    $custody = app(CustodyService::class);

    // Fund the till first, or advancing a float is refused.
    \App\Models\CashMovement::create([
        'cash_box_id' => CashBox::default()->id,
        'direction' => 'in', 'amount' => 10000, 'source' => 'opening',
    ]);

    $custody->advanceCash($this->technician, 1500, CashBox::default(), $this->manager);

    $report = $this->reports->custody();

    expect($report['cash_total'])->toBe(1500.0)
        ->and($report['total_value'])->toBe(1500.0)
        ->and($report['technicians'])->toHaveCount(1);
});

/* ── Contracts ───────────────────────────────────────────── */

it('measures whether a contract is being honoured', function () {
    $contract = Contract::factory()->create([
        'customer_id' => $this->customer->id,
        'status' => 'active',
        'starts_on' => now()->subMonths(6),
        'ends_on' => now()->addMonths(6),
        'visits_per_year' => 4,
    ]);

    $contract->visits()->create(['sequence' => 1, 'planned_for' => now()->subMonths(3), 'status' => 'done']);
    $contract->visits()->create(['sequence' => 2, 'planned_for' => now()->subMonth(), 'status' => 'planned']);
    $contract->visits()->create(['sequence' => 3, 'planned_for' => now()->addMonth(), 'status' => 'planned']);

    $row = collect($this->reports->contracts()['rows'])->firstWhere('code', $contract->code);

    expect($row['visits'])->toBe(3)
        ->and($row['visits_done'])->toBe(1)
        // Planned, in the past, not done — the number that matters.
        ->and($row['visits_overdue'])->toBe(1)
        ->and($row['compliance_pct'])->toBe(33.3);
});

it('lists the contracts about to run out', function () {
    Contract::factory()->create([
        'customer_id' => $this->customer->id,
        'status' => 'active',
        'starts_on' => now()->subYear(),
        'ends_on' => now()->addDays(20),
    ]);

    Contract::factory()->create([
        'customer_id' => $this->customer->id,
        'status' => 'active',
        'starts_on' => now(),
        'ends_on' => now()->addYears(2),
    ]);

    expect($this->reports->contracts(60)['expiring'])->toHaveCount(1);
});

/* ── Warranties ──────────────────────────────────────────── */

it('lists cover about to lapse and counts what claims cost', function () {
    $warranties = app(WarrantyService::class);
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);

    $warranties->register([
        'asset_id' => $asset->id,
        'ends_on' => now()->addDays(20)->toDateString(),
    ], $this->manager);

    $claim = $warranties->claim([
        'asset_id' => $asset->id, 'fault' => 'لا يشحن',
    ], $this->manager);
    $warranties->approve($claim);
    $task = $warranties->raiseRepairOrder($claim->fresh(), [], $this->manager);

    // Parts consumed honouring the cover — work done and never billed.
    $item = Item::factory()->create();
    $this->stock->receive($item, $this->store, 10, 400, $this->manager);
    $this->stock->issueToTask($item, $this->store, 2, $task, $this->manager);

    $report = $this->reports->warranties(60);

    expect($report['expiring'])->toHaveCount(1)
        ->and($report['claims_total'])->toBe(1)
        ->and($report['claims_open'])->toBe(1)
        ->and($report['repair_cost'])->toBe(800.0);
});

it('groups claims by the model that keeps failing', function () {
    $warranties = app(WarrantyService::class);

    foreach (range(1, 2) as $ignored) {
        $asset = Asset::factory()->create([
            'customer_id' => $this->customer->id,
            'brand' => 'APC',
            'model' => 'Symmetra LX',
        ]);

        $warranties->register(['asset_id' => $asset->id, 'months' => 12], $this->manager);
        $warranties->claim(['asset_id' => $asset->id, 'fault' => 'عطل'], $this->manager);
    }

    $byModel = $this->reports->warranties()['by_model'];

    expect($byModel[0]['model'])->toBe('APC Symmetra LX')
        ->and($byModel[0]['claims'])->toBe(2);
});

/* ── HR ──────────────────────────────────────────────────── */

it('counts the workforce by department and totals its payroll cost', function () {
    Employee::factory()->create(['status' => 'active', 'department' => 'الفنيون', 'basic_salary' => 5000, 'allowances' => null]);
    Employee::factory()->create(['status' => 'active', 'department' => 'الفنيون', 'basic_salary' => 3000, 'allowances' => null]);
    Employee::factory()->create(['status' => 'terminated', 'department' => 'الإدارة']);

    $report = $this->reports->hr();

    expect($report['headcount'])->toBe(2);

    $dept = collect($report['by_department'])->firstWhere('department', 'الفنيون');
    expect($dept['count'])->toBe(2)
        ->and($dept['payroll'])->toBe(8000.0);
});

it('sums a window\'s payroll off the frozen slips, not the salaries', function () {
    Employee::factory()->create([
        'status' => 'active', 'basic_salary' => 6000, 'allowances' => null,
        'insurance_rate' => 0, 'tax_rate' => 0,
    ]);

    app(PayrollService::class)->open(2026, 8, $this->manager);

    $report = $this->reports->hr('2026-08-01', '2026-08-31');

    expect($report['payroll']['runs'])->toBe(1)
        ->and($report['payroll']['net'])->toBe(6000.0);
});

it('leaves a run in another month out of the window', function () {
    Employee::factory()->create(['status' => 'active', 'basic_salary' => 6000, 'allowances' => null]);
    app(PayrollService::class)->open(2026, 8, $this->manager);

    expect($this->reports->hr('2026-09-01', '2026-09-30')['payroll']['runs'])->toBe(0);
});

it('summarises approved leave in the window by type', function () {
    $employee = Employee::factory()->create();

    LeaveRequest::create([
        'employee_id' => $employee->id, 'type' => 'annual',
        'from_date' => '2026-08-04', 'to_date' => '2026-08-06', 'days' => 3, 'status' => 'approved',
    ]);
    // Pending leave is not counted — it has not been granted.
    LeaveRequest::create([
        'employee_id' => $employee->id, 'type' => 'sick',
        'from_date' => '2026-08-10', 'to_date' => '2026-08-11', 'days' => 2, 'status' => 'pending',
    ]);

    $leave = collect($this->reports->hr('2026-08-01', '2026-08-31')['leave']);

    expect($leave->firstWhere('type', 'annual')['days'])->toBe(3)
        ->and($leave->firstWhere('type', 'sick'))->toBeNull();
});

/* ── Maintenance ─────────────────────────────────────────── */

it('counts work orders by status', function () {
    Task::factory()->create(['customer_id' => $this->customer->id, 'status' => 'pending']);
    Task::factory()->create(['customer_id' => $this->customer->id, 'status' => 'completed', 'completed_at' => now()]);

    $report = $this->reports->maintenance();

    expect($report['tasks']['total'])->toBe(2)
        ->and($report['tasks']['open'])->toBe(1);

    $completed = collect($report['tasks']['by_status'])->firstWhere('status', 'completed');
    expect($completed['count'])->toBe(1);
});

it('flags planned visits that are past due', function () {
    $contract = Contract::factory()->create([
        'customer_id' => $this->customer->id, 'status' => 'active',
        'starts_on' => now()->subMonths(6), 'ends_on' => now()->addMonths(6),
    ]);

    $contract->visits()->create(['sequence' => 1, 'planned_for' => now()->subMonth(), 'status' => 'planned']);
    $contract->visits()->create(['sequence' => 2, 'planned_for' => now()->subMonths(2), 'status' => 'done']);

    $ppm = $this->reports->maintenance()['ppm'];

    expect($ppm['visits_overdue'])->toBe(1)
        ->and($ppm['visits_done'])->toBe(1);
});

/* ── Custom reports: raw dataset export ──────────────────── */

it('lists the datasets a custom export can pull', function () {
    $rows = actingAs($this->manager)->getJson('/api/reports/datasets')->assertOk()->json('data');

    expect(collect($rows)->pluck('key'))->toContain('customers', 'invoices', 'employees');
});

it('exports a dataset\'s raw rows as a spreadsheet', function () {
    $response = actingAs($this->manager)
        ->get('/api/reports/custom/customers/export')
        ->assertOk()
        ->assertHeader('content-type', 'text/csv; charset=UTF-8');

    $body = $response->streamedContent();

    expect($body)->toStartWith("\xEF\xBB\xBF")
        ->and($body)->toContain('بنك القاهرة');
});

it('refuses to export an unknown dataset', function () {
    actingAs($this->manager)->get('/api/reports/custom/nonsense/export')->assertNotFound();
});

it('keeps a technician out of the custom export', function () {
    actingAs($this->technician)->getJson('/api/reports/datasets')->assertForbidden();
    actingAs($this->technician)->get('/api/reports/custom/customers/export')->assertForbidden();
});

/* ── Through the API ─────────────────────────────────────── */

it('serves every report to a manager', function () {
    foreach (['sales', 'profitability', 'stock', 'custody', 'contracts', 'warranties', 'hr', 'maintenance'] as $report) {
        actingAs($this->manager)->getJson("/api/reports/{$report}")->assertOk();
    }
});

it('narrows a report to a window through the API', function () {
    sell_(1000, on: now()->subYear()->toDateString());
    sell_(500);

    $response = actingAs($this->manager)
        ->getJson('/api/reports/sales?from='.now()->startOfMonth()->toDateString())
        ->assertOk();

    expect($response->json('data.invoices'))->toBe(1);
});

it('exports a report as a spreadsheet Excel can read', function () {
    sell_(1000);

    $response = actingAs($this->manager)
        ->get('/api/reports/sales/export')
        ->assertOk()
        ->assertHeader('content-type', 'text/csv; charset=UTF-8');

    $body = $response->streamedContent();

    // Without the byte-order mark Excel reads the Arabic as mojibake.
    expect($body)->toStartWith("\xEF\xBB\xBF")
        ->and($body)->toContain('بنك القاهرة');
});

it('refuses to export a report that does not exist', function () {
    actingAs($this->manager)->get('/api/reports/nonsense/export')->assertNotFound();
});

it('keeps a technician out of the reports', function () {
    foreach (['sales', 'profitability', 'stock', 'custody', 'contracts', 'warranties', 'hr', 'maintenance'] as $report) {
        actingAs($this->technician)->getJson("/api/reports/{$report}")->assertForbidden();
    }
});

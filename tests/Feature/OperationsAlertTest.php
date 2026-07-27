<?php

use App\Models\AlertDispatch;
use App\Models\Asset;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use App\Notifications\OperationsAlert;
use App\Services\BillingService;
use App\Services\WarrantyService;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\artisan;

/**
 * The daily sweep raises an alert for each standing operational condition, sends
 * it to the managers, and — the point of the ledger — never raises it twice.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
});

it('alerts the manager to an overdue invoice, once', function () {
    Notification::fake();

    $billing = app(BillingService::class);
    $invoice = Invoice::create([
        'customer_id' => $this->customer->id,
        'issue_date' => now()->subMonths(2)->toDateString(),
        'due_date' => now()->subMonth()->toDateString(),
    ]);
    $invoice->lines()->create(['description' => 'خدمة', 'qty' => 1, 'unit_price' => 1000, 'line_total' => 1000]);
    $billing->issue($billing->recalculate($invoice));

    artisan('alerts:sweep')->assertSuccessful();

    Notification::assertSentTo($this->manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'invoice.overdue');
    // Not to a technician.
    Notification::assertNotSentTo($this->technician, OperationsAlert::class);

    // A second sweep finds the same invoice but raises nothing new.
    Notification::fake();
    artisan('alerts:sweep')->assertSuccessful();
    Notification::assertNothingSent();
});

it('alerts to a warranty about to lapse', function () {
    Notification::fake();

    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);
    app(WarrantyService::class)->register([
        'asset_id' => $asset->id,
        'ends_on' => now()->addDays(10)->toDateString(),
    ], $this->manager);

    artisan('alerts:sweep')->assertSuccessful();

    Notification::assertSentTo($this->manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'warranty.expiring');
});

it('alerts to a periodic visit coming up', function () {
    Notification::fake();

    $contract = Contract::factory()->for($this->customer)->create(['status' => 'active']);
    $contract->visits()->create([
        'sequence' => 1,
        'planned_for' => now()->addDays(3)->toDateString(),
        'status' => 'planned',
    ]);

    artisan('alerts:sweep')->assertSuccessful();

    Notification::assertSentTo($this->manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'ppm.due');
});

it('alerts to a reported device fault', function () {
    Notification::fake();

    \App\Models\Task::factory()->create([
        'customer_id' => $this->customer->id,
        'type' => \App\Enums\TaskType::Repair,
        'status' => \App\Enums\TaskStatus::Pending,
    ]);

    artisan('alerts:sweep')->assertSuccessful();

    Notification::assertSentTo($this->manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'device.fault');
});

it('alerts to a newly issued invoice', function () {
    Notification::fake();

    $billing = app(BillingService::class);
    $invoice = Invoice::create([
        'customer_id' => $this->customer->id,
        'issue_date' => now()->toDateString(), 'due_date' => now()->addDays(15)->toDateString(),
    ]);
    $invoice->lines()->create(['description' => 'خدمة', 'qty' => 1, 'unit_price' => 500, 'line_total' => 500]);
    $billing->issue($billing->recalculate($invoice));

    artisan('alerts:sweep')->assertSuccessful();

    Notification::assertSentTo($this->manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'invoice.created');
});

it('alerts when a leave request is waiting on approval', function () {
    Notification::fake();

    $employee = \App\Models\Employee::factory()->create();
    \App\Models\LeaveRequest::create([
        'employee_id' => $employee->id, 'type' => 'annual',
        'from_date' => now()->addWeek()->toDateString(), 'to_date' => now()->addWeek()->toDateString(),
        'days' => 1, 'status' => 'pending',
    ]);

    artisan('alerts:sweep')->assertSuccessful();

    Notification::assertSentTo($this->manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'approval.needed');
});

it('names a UPS stock shortage as a device shortage', function () {
    Notification::fake();

    // A UPS catalogue item below its reorder level.
    \App\Models\Item::factory()->create([
        'category' => 'ups', 'name' => 'UPS 10kVA', 'reorder_level' => 5,
    ]);

    artisan('alerts:sweep')->assertSuccessful();

    Notification::assertSentTo($this->manager, OperationsAlert::class,
        fn (OperationsAlert $a) => $a->type === 'stock.low' && $a->title === 'نقص أجهزة UPS');
});

it('records a dispatch key so the condition is not re-raised', function () {
    $contract = Contract::factory()->for($this->customer)->create(['status' => 'active']);
    $visit = $contract->visits()->create([
        'sequence' => 1, 'planned_for' => now()->addDays(2)->toDateString(), 'status' => 'planned',
    ]);

    artisan('alerts:sweep')->assertSuccessful();

    expect(AlertDispatch::where('key', "ppm-due:{$visit->id}")->exists())->toBeTrue();
});

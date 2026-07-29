<?php

use App\Models\Asset;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\SalesOrder;
use App\Models\Task;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
});

/** A live warranty claim standing behind one job. */
function claimFor(Task $job): WarrantyClaim
{
    $asset = Asset::factory()->create(['customer_id' => test()->customer->id]);

    $warranty = Warranty::create([
        'asset_id' => $asset->id,
        'customer_id' => test()->customer->id,
        'starts_on' => now()->subMonth()->toDateString(),
        'ends_on' => now()->addMonths(11)->toDateString(),
    ]);

    return WarrantyClaim::create([
        'warranty_id' => $warranty->id,
        'asset_id' => $asset->id,
        'reported_on' => now()->toDateString(),
        'fault' => 'عطل',
        'status' => 'approved',
        'task_id' => $job->id,
    ]);
}

function invoiceWith(array $attributes): Invoice
{
    return Invoice::create([
        'customer_id' => test()->customer->id,
        'issue_date' => now()->toDateString(),
        'created_by' => test()->manager->id,
        ...$attributes,
    ]);
}

it('sorts every invoice into exactly one bucket', function () {
    $contract = Contract::factory()->for($this->customer)->create();
    $order = SalesOrder::create([
        'customer_id' => $this->customer->id,
        'order_date' => now()->toDateString(),
        'created_by' => $this->manager->id,
    ]);

    $job = Task::factory()->for($this->customer)->create();
    $warrantyJob = Task::factory()->for($this->customer)->create();
    claimFor($warrantyJob);

    $sales = invoiceWith(['sales_order_id' => $order->id]);
    $contractInvoice = invoiceWith(['contract_id' => $contract->id]);
    $warranty = invoiceWith(['task_id' => $warrantyJob->id]);
    $service = invoiceWith(['task_id' => $job->id]);
    $manual = invoiceWith([]);

    expect($sales->source())->toBe('sales')
        ->and($contractInvoice->source())->toBe('contract')
        ->and($warranty->source())->toBe('warranty')
        ->and($service->source())->toBe('service')
        ->and($manual->source())->toBe('manual');

    // The buckets partition the table — every invoice lands in one and only one.
    $counted = collect(array_keys(Invoice::SOURCES))
        ->sum(fn (string $source) => Invoice::ofSource($source)->count());

    expect($counted)->toBe(Invoice::count());
});

it('filters the list down to one kind of invoice', function () {
    $contract = Contract::factory()->for($this->customer)->create();

    invoiceWith(['contract_id' => $contract->id]);
    invoiceWith([]);

    $body = actingAs($this->manager)
        ->getJson('/api/invoices?source=contract')
        ->assertOk()
        ->json();

    expect($body['data'])->toHaveCount(1)
        ->and($body['data'][0]['source'])->toBe('contract')
        ->and($body['data'][0]['source_label'])->toBe('عقود صيانة');
});

it('bills warranty work as warranty even though it arrives as a job', function () {
    $contract = Contract::factory()->for($this->customer)->create();
    $job = Task::factory()->for($this->customer)->create(['contract_id' => $contract->id]);
    claimFor($job);

    $invoice = invoiceWith(['task_id' => $job->id, 'contract_id' => $contract->id]);

    expect($invoice->source())->toBe('warranty')
        ->and(Invoice::ofSource('contract')->pluck('id'))->not->toContain($invoice->id);
});

<?php

use App\Models\Customer;
use App\Models\TechnicianMonthlyReport;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

beforeEach(function () {
    $this->admin = User::factory()->create(['role' => 'admin']);
    $this->customer = Customer::factory()->create();
    $this->actingAs($this->admin);
});

it('keeps the listing available while the location migration is pending', function () {
    Schema::shouldReceive('hasColumns')
        ->once()
        ->with('technician_monthly_reports', ['customer_id', 'branch_id'])
        ->andReturnFalse();

    $response = $this->getJson('/api/technician-reports?period=2026-08')->assertOk();

    expect($response->json('data'))->toBeArray()
        ->and($response->getContent())->not->toContain('SQLSTATE');
});

it('returns a clear Arabic validation message when the location migration is pending', function () {
    Schema::shouldReceive('hasColumns')
        ->once()
        ->with('technician_monthly_reports', ['customer_id', 'branch_id'])
        ->andReturnFalse();

    $response = $this->postJson('/api/technician-reports', [
        'technician_id' => User::factory()->create(['role' => 'technician'])->id,
        'period' => '2026-08',
        'customer_id' => $this->customer->id,
    ])->assertStatus(422)->assertJsonValidationErrors('customer_id');

    expect($response->getContent())->not->toContain('SQLSTATE')
        ->and($response->json('errors.customer_id.0'))->toContain('تحتاج إلى تحديث');
});

it('lists every received report for the month, including multiple reports from one technician', function () {
    $technician = User::factory()->create(['role' => 'technician', 'name' => 'محمود']);
    User::factory()->create(['role' => 'technician', 'name' => 'أحمد']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'customer_id' => $this->customer->id,
    ])->assertCreated();

    $secondCustomer = Customer::factory()->create();
    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'customer_id' => $secondCustomer->id,
        'received_on' => '2026-08-31',
    ])->assertCreated();

    $response = $this->getJson('/api/technician-reports?period=2026-08')->assertOk();

    expect($response->json('data'))->toHaveCount(2)
        ->and($response->json('meta.received'))->toBe(1)
        ->and($response->json('meta.reports_total'))->toBe(2)
        ->and($response->json('meta.total'))->toBe(2)
        ->and($response->json('data.0.report.customer'))->toBe($secondCustomer->name);
});

it('names whoever took the paperwork and records the customer and branch', function () {
    $technician = User::factory()->create(['role' => 'technician']);
    $clerk = User::factory()->create(['role' => 'manager', 'name' => 'سلمى']);
    $branch = $this->customer->branches()->create(['name' => 'فرع مدينة نصر']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'customer_id' => $this->customer->id,
        'branch_id' => $branch->id,
        'received_by_user_id' => $clerk->id,
        'received_on' => '2026-09-02',
        'notes' => 'التقرير ناقص يوم واحد.',
    ])->assertCreated();

    $row = $this->getJson('/api/technician-reports?period=2026-08')
        ->assertOk()
        ->json('data.0.report');

    expect($row['received_by'])->toBe('سلمى')
        ->and($row['received_on'])->toBe('2026-09-02')
        ->and($row['customer'])->toBe($this->customer->name)
        ->and($row['branch'])->toBe('فرع مدينة نصر')
        ->and($row['notes'])->toBe('التقرير ناقص يوم واحد.');
});

it('allows more than one report from the same technician in the same month', function () {
    $technician = User::factory()->create(['role' => 'technician']);
    $secondCustomer = Customer::factory()->create();

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'customer_id' => $this->customer->id,
    ])->assertCreated();

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'customer_id' => $secondCustomer->id,
    ])->assertCreated();

    expect(TechnicianMonthlyReport::where('technician_id', $technician->id)->count())->toBe(2);
});

it('can correct one report without changing the other report', function () {
    $technician = User::factory()->create(['role' => 'technician']);
    $secondCustomer = Customer::factory()->create();

    $first = $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'customer_id' => $this->customer->id,
        'notes' => 'قديم',
    ])->assertCreated()->json('data');

    $this->postJson('/api/technician-reports', [
        'report_id' => $first['id'],
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'customer_id' => $secondCustomer->id,
        'notes' => 'محدّث',
    ])->assertOk();

    expect(TechnicianMonthlyReport::where('technician_id', $technician->id)->count())->toBe(1)
        ->and(TechnicianMonthlyReport::first()->customer_id)->toBe($secondCustomer->id)
        ->and(TechnicianMonthlyReport::first()->notes)->toBe('محدّث');
});

it('defaults the month to this one', function () {
    $technician = User::factory()->create(['role' => 'technician']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => now()->format('Y-m'),
        'customer_id' => $this->customer->id,
    ])->assertCreated();

    expect($this->getJson('/api/technician-reports')->json('meta.period'))
        ->toBe(now()->format('Y-m'));
});

it('refuses a month that is not a month', function () {
    $technician = User::factory()->create(['role' => 'technician']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => 'أغسطس',
        'customer_id' => $this->customer->id,
    ])->assertStatus(422)->assertJsonValidationErrors('period');
});

it('refuses a branch belonging to another customer', function () {
    $technician = User::factory()->create(['role' => 'technician']);
    $otherCustomer = Customer::factory()->create();
    $branch = $otherCustomer->branches()->create(['name' => 'فرع عميل آخر']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'customer_id' => $this->customer->id,
        'branch_id' => $branch->id,
    ])->assertStatus(422)->assertJsonValidationErrors('branch_id');
});

it('keeps the record away from anyone who does not manage people', function () {
    $this->actingAs(User::factory()->create(['role' => 'manager', 'position' => 'storekeeper']));

    $this->getJson('/api/technician-reports')->assertForbidden();
    $this->postJson('/api/technician-reports', [
        'technician_id' => $this->admin->id,
        'period' => '2026-08',
        'customer_id' => $this->customer->id,
    ])->assertForbidden();
});

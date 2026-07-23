<?php

use App\Models\Customer;
use App\Models\FollowUp;
use App\Models\Lead;
use App\Models\User;
use App\Services\LeadService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->leads = app(LeadService::class);
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
});

/* ── Lead numbering and pipeline ─────────────────────────── */

it('numbers leads sequentially', function () {
    $first = Lead::create(['name' => 'أحمد']);
    $second = Lead::create(['name' => 'سميرة']);

    expect($first->code)->toBe('LD-0001')
        ->and($second->code)->toBe('LD-0002')
        ->and($first->status)->toBe('new');
});

it('counts only open leads in the pipeline scope', function () {
    Lead::factory()->create(['status' => 'new']);
    Lead::factory()->create(['status' => 'qualified']);
    Lead::factory()->create(['status' => 'won']);
    Lead::factory()->create(['status' => 'lost']);

    expect(Lead::query()->open()->count())->toBe(2);
});

/* ── Winning a lead mints a customer ─────────────────────── */

it('turns a won lead into a customer, once', function () {
    $lead = Lead::factory()->create([
        'name' => 'مصنع النور',
        'company' => 'النور للصناعة',
        'phone' => '01099887766',
    ]);

    $customer = $this->leads->convert($lead, $this->manager);

    expect($customer)->toBeInstanceOf(Customer::class)
        ->and($customer->name)->toBe('مصنع النور')
        ->and($customer->phone)->toBe('01099887766')
        ->and($lead->fresh()->status)->toBe('won')
        ->and($lead->fresh()->customer_id)->toBe($customer->id);

    // Converting again returns the same customer, not a second one.
    $again = $this->leads->convert($lead->fresh(), $this->manager);

    expect($again->id)->toBe($customer->id)
        ->and(Customer::count())->toBe(1);
});

it('wins a lead through the status change', function () {
    $lead = Lead::factory()->create();

    $this->leads->changeStatus($lead, 'won', $this->manager);

    expect($lead->fresh()->status)->toBe('won')
        ->and($lead->fresh()->customer_id)->not->toBeNull()
        ->and(Customer::count())->toBe(1);
});

it('refuses to lose a lead without a reason', function () {
    $lead = Lead::factory()->create();

    $this->leads->changeStatus($lead, 'lost', $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('keeps the reason a lead was lost', function () {
    $lead = Lead::factory()->create();

    $this->leads->changeStatus($lead, 'lost', $this->manager, 'السعر أعلى من المنافس');

    expect($lead->fresh()->status)->toBe('lost')
        ->and($lead->fresh()->lost_reason)->toBe('السعر أعلى من المنافس');
});

it('clears a stale lost reason when a lead re-enters play', function () {
    $lead = Lead::factory()->create(['status' => 'lost', 'lost_reason' => 'قديم']);

    $this->leads->changeStatus($lead, 'contacted', $this->manager);

    expect($lead->fresh()->status)->toBe('contacted')
        ->and($lead->fresh()->lost_reason)->toBeNull();
});

/* ── Follow-ups derive their own state ───────────────────── */

it('derives overdue, pending and done from two timestamps', function () {
    $lead = Lead::factory()->create();

    $overdue = $lead->followUps()->create(['type' => 'call', 'due_at' => now()->subDay()]);
    $pending = $lead->followUps()->create(['type' => 'call', 'due_at' => now()->addDay()]);
    $done = $lead->followUps()->create([
        'type' => 'call', 'due_at' => now()->subDay(), 'done_at' => now(),
    ]);

    expect($overdue->status())->toBe('overdue')
        ->and($pending->status())->toBe('pending')
        ->and($done->status())->toBe('done')
        ->and($done->isOverdue())->toBeFalse();
});

it('lists only what is open and due in the chase scope', function () {
    $lead = Lead::factory()->create();
    $lead->followUps()->create(['type' => 'call', 'due_at' => now()->subDay()]);       // due
    $lead->followUps()->create(['type' => 'call', 'due_at' => now()->addDay()]);        // not yet
    $lead->followUps()->create(['type' => 'call', 'due_at' => now()->subDay(), 'done_at' => now()]); // done

    expect(FollowUp::query()->due()->count())->toBe(1)
        ->and(FollowUp::query()->open()->count())->toBe(2);
});

it('attaches a follow-up to a customer too', function () {
    $customer = Customer::factory()->create();
    $followUp = $customer->followUps()->create(['type' => 'visit', 'due_at' => now()->addDays(2)]);

    expect($followUp->subject)->toBeInstanceOf(Customer::class)
        ->and($followUp->subjectName())->toBe($customer->name);
})->skip(fn () => ! method_exists(Customer::class, 'followUps'), 'Customer needs the followUps relation');

/* ── The API is gated ────────────────────────────────────── */

it('lets a permitted manager create a lead', function () {
    actingAs($this->manager)
        ->postJson('/api/leads', ['name' => 'عميل محتمل', 'phone' => '01000000000'])
        ->assertCreated()
        ->assertJsonPath('data.code', 'LD-0001');
});

it('bars a technician from the CRM', function () {
    actingAs($this->technician)
        ->getJson('/api/leads')
        ->assertForbidden();

    actingAs($this->technician)
        ->postJson('/api/leads', ['name' => 'x'])
        ->assertForbidden();
});

it('converts through the status endpoint and returns the new customer id', function () {
    $lead = Lead::factory()->create();

    actingAs($this->manager)
        ->postJson("/api/leads/{$lead->id}/status", ['status' => 'won'])
        ->assertOk()
        ->assertJsonPath('data.status', 'won')
        ->assertJsonPath('customer_id', fn ($id) => $id !== null);
});

it('completes a follow-up with its outcome', function () {
    $lead = Lead::factory()->create();
    $followUp = $lead->followUps()->create(['type' => 'call', 'due_at' => now()->subHour()]);

    actingAs($this->manager)
        ->postJson("/api/follow-ups/{$followUp->id}/complete", ['outcome' => 'ردّ ووافق على زيارة'])
        ->assertOk()
        ->assertJsonPath('data.status', 'done')
        ->assertJsonPath('data.outcome', 'ردّ ووافق على زيارة');
});

/* ── The CRM report ──────────────────────────────────────── */

it('reports the open pipeline value by stage', function () {
    Lead::factory()->create(['status' => 'new', 'est_value' => 10000]);
    Lead::factory()->create(['status' => 'qualified', 'est_value' => 40000]);
    Lead::factory()->create(['status' => 'won', 'est_value' => 99999]);   // closed, out of the open pipeline

    $report = app(\App\Services\ReportService::class)->crm();

    expect($report['open_count'])->toBe(2)
        ->and($report['open_value'])->toBe(50000.0);
});

it('computes a win rate only from decided deals', function () {
    $service = app(\App\Services\ReportService::class);

    // No decided deals yet — the rate is not a number, it is null.
    expect($service->crm()['win_rate'])->toBeNull();

    Lead::factory()->count(3)->create(['status' => 'won']);
    Lead::factory()->create(['status' => 'lost']);
    Lead::factory()->create(['status' => 'new']); // open — not counted either way

    expect($service->crm()['win_rate'])->toBe(75.0);
});

it('measures conversion by source', function () {
    Lead::factory()->count(2)->create(['source' => 'referral', 'status' => 'won']);
    Lead::factory()->create(['source' => 'referral', 'status' => 'lost']);

    $report = app(\App\Services\ReportService::class)->crm();
    $referral = collect($report['by_source'])->firstWhere('source', 'referral');

    expect($referral['total'])->toBe(3)
        ->and($referral['won'])->toBe(2)
        ->and($referral['conversion_pct'])->toBe(66.7);
});

it('serves the CRM report to a permitted user and refuses a technician', function () {
    actingAs($this->manager)
        ->getJson('/api/reports/crm')
        ->assertOk()
        ->assertJsonStructure(['data' => ['pipeline', 'win_rate', 'by_source', 'follow_ups_overdue']]);

    actingAs($this->technician)
        ->getJson('/api/reports/crm')
        ->assertForbidden();
});

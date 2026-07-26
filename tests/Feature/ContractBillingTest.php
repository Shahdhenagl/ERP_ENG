<?php

use App\Models\CashBox;
use App\Models\Contract;
use App\Models\ContractPayment;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use App\Services\MaintenancePlanner;

use function Pest\Laravel\actingAs;

/**
 * A maintenance contract is collected in instalments tied to its visits: the
 * first with activation, the rest as their visits come round — and a visit's
 * work order is held until its instalment is paid.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    CashBox::default();
});

/** A draft contract through the API, so the schedule is built the real way. */
function draftContract(array $overrides = []): Contract
{
    actingAs(test()->manager)->postJson('/api/contracts', [
        'customer_id' => test()->customer->id,
        'title' => 'عقد صيانة',
        // Spanning "now" so an activated contract is live today and its visits
        // can materialise — the term dates the hold logic actually runs against.
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->addYear()->subDay()->toDateString(),
        'visits_per_year' => 12,
        'value' => 40000,
        'billing_frequency' => 'quarterly',
        ...$overrides,
    ])->assertCreated();

    return Contract::latest('id')->first();
}

/* ── The schedule ────────────────────────────────────────── */

it('splits a quarterly contract into four instalments on visits 3, 6 and 9', function () {
    $contract = draftContract();
    $schedule = $contract->payments()->orderBy('sequence')->get();

    expect($schedule)->toHaveCount(4)
        ->and($schedule->pluck('amount')->map(fn ($a) => (float) $a)->all())->toBe([10000.0, 10000.0, 10000.0, 10000.0])
        // First falls with activation (no visit); the rest evenly across visits.
        ->and($schedule->pluck('due_visit_sequence')->all())->toBe([null, 3, 6, 9]);
});

it('makes an upfront contract a single instalment', function () {
    $contract = draftContract(['billing_frequency' => 'upfront']);

    expect($contract->payments()->count())->toBe(1)
        ->and((float) $contract->payments()->first()->amount)->toBe(40000.0)
        ->and($contract->payments()->first()->due_visit_sequence)->toBeNull();
});

it('rebuilds the schedule when the value changes on a draft', function () {
    $contract = draftContract();

    actingAs($this->manager)->putJson("/api/contracts/{$contract->id}", [
        'customer_id' => $this->customer->id,
        'starts_on' => '2026-09-01', 'ends_on' => '2027-08-31',
        'visits_per_year' => 12, 'value' => 60000, 'billing_frequency' => 'quarterly',
    ])->assertOk();

    expect((float) $contract->payments()->where('sequence', 1)->first()->amount)->toBe(15000.0);
});

/* ── Activation gate ─────────────────────────────────────── */

it('refuses to activate before the first instalment is collected', function () {
    $contract = draftContract();

    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/activate")
        ->assertStatus(422)
        ->assertJsonValidationErrors('payment');

    expect($contract->fresh()->status->value)->toBe('draft');
});

it('activates once the first instalment is collected', function () {
    $contract = draftContract();
    $first = $contract->payments()->where('sequence', 1)->first();

    actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/payments/{$first->id}/collect", [])
        ->assertOk();

    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/activate")
        ->assertOk()
        ->assertJsonPath('data.status', 'active');
});

/* ── Collection moves real money ─────────────────────────── */

it('raises an invoice and receipt into the treasury on collection', function () {
    $contract = draftContract();
    $first = $contract->payments()->where('sequence', 1)->first();
    $before = CashBox::default()->balance();

    actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/payments/{$first->id}/collect", [
            'method' => 'cash',
        ])->assertOk();

    $first->refresh();
    $invoice = Invoice::where('contract_id', $contract->id)->first();

    expect($first->status)->toBe('collected')
        ->and($first->invoice_id)->toBe($invoice->id)
        ->and($first->payment_id)->not->toBeNull()
        ->and((float) $invoice->total)->toBe(10000.0)
        // The money actually landed in the till.
        ->and(CashBox::default()->fresh()->balance())->toBe(round($before + 10000, 2));
});

it('refuses to collect the same instalment twice', function () {
    $contract = draftContract();
    $first = $contract->payments()->where('sequence', 1)->first();

    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/payments/{$first->id}/collect", [])->assertOk();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/payments/{$first->id}/collect", [])
        ->assertStatus(422);
});

/* ── The visit hold ──────────────────────────────────────── */

it('holds a visit whose instalment is unpaid, and releases it once collected', function () {
    $contract = draftContract();
    $planner = app(MaintenancePlanner::class);

    // Collect the first instalment and activate — this lays out the visits.
    $first = $contract->payments()->where('sequence', 1)->first();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/payments/{$first->id}/collect", [])->assertOk();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/activate")->assertOk();

    // Bring the milestone visit (3, which the 2nd instalment gates) into range.
    $milestone = $contract->visits()->where('sequence', 3)->first();
    $milestone->update(['planned_for' => now()->toDateString(), 'status' => 'planned', 'task_id' => null]);

    $planner->materialiseDueVisits();

    // Held: no work order was cut for it.
    expect($milestone->fresh()->task_id)->toBeNull();

    // Collect the instalment that gates visit 3, then sweep again.
    $second = $contract->payments()->where('sequence', 2)->first();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/payments/{$second->id}/collect", [])->assertOk();

    // Collection itself released it (the controller re-sweeps).
    expect($milestone->fresh()->task_id)->not->toBeNull();
});

it('does not hold a visit that carries no instalment', function () {
    $contract = draftContract();
    $planner = app(MaintenancePlanner::class);

    $first = $contract->payments()->where('sequence', 1)->first();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/payments/{$first->id}/collect", [])->assertOk();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/activate")->assertOk();

    // Visit 2 gates no payment (payments land on 3, 6, 9), so it flows.
    $free = $contract->visits()->where('sequence', 2)->first();
    $free->update(['planned_for' => now()->toDateString(), 'status' => 'planned', 'task_id' => null]);

    $planner->materialiseDueVisits();

    expect($free->fresh()->task_id)->not->toBeNull();
});

it('never rewrites a schedule once money has been taken', function () {
    $contract = draftContract();
    $first = $contract->payments()->where('sequence', 1)->first();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/payments/{$first->id}/collect", [])->assertOk();

    // Editing the value now must not wipe the collected instalment.
    actingAs($this->manager)->putJson("/api/contracts/{$contract->id}", [
        'customer_id' => $this->customer->id,
        'starts_on' => '2026-09-01', 'ends_on' => '2027-08-31',
        'visits_per_year' => 12, 'value' => 99999, 'billing_frequency' => 'annual',
    ])->assertOk();

    expect($contract->payments()->where('status', 'collected')->count())->toBe(1)
        ->and($contract->payments()->count())->toBe(4);   // unchanged
});

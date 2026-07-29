<?php

use App\Models\Contract;
use App\Models\Customer;
use App\Models\User;
use App\Services\MaintenancePlanner;
use Illuminate\Support\Facades\Cache;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    Cache::flush();

    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    $this->planner = app(MaintenancePlanner::class);
});

it('starts the plan on the agreed date, then keeps the cadence', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => '2026-07-30',
        'ends_on' => '2027-07-29',
        'visits_per_year' => 12,
        'first_visit_on' => '2026-08-03',
    ]);

    $this->planner->plan($contract);

    $dates = $contract->visits()->orderBy('sequence')->pluck('planned_for')
        ->map->toDateString()->all();

    expect($dates)->toHaveCount(12);

    // The first round is the date that was agreed, not a fortnight after the
    // term opened. Working-day nudging may move it a day, never a season.
    expect(abs(strtotime($dates[0]) - strtotime('2026-08-03')) / 86400)->toBeLessThanOrEqual(2.0);

    // And the rest follow a month apart rather than bunching up.
    $gap = (strtotime($dates[1]) - strtotime($dates[0])) / 86400;
    expect($gap)->toBeGreaterThan(25.0)->toBeLessThan(36.0);
});

it('spreads across the term when no date is agreed', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => '2026-07-30',
        'ends_on' => '2027-07-29',
        'visits_per_year' => 12,
    ]);

    $this->planner->plan($contract);

    $first = $contract->visits()->orderBy('sequence')->value('planned_for');

    // The unchanged behaviour: a midpoint, roughly half an interval in.
    expect($first->toDateString())->toBeGreaterThan('2026-08-08');
});

it('keeps every planned round inside the term', function () {
    $contract = Contract::factory()->active()->for($this->customer)->create([
        'starts_on' => '2026-07-30',
        'ends_on' => '2027-07-29',
        'visits_per_year' => 12,
        // Agreed late, so the cadence would otherwise run past the end date.
        'first_visit_on' => '2027-05-01',
    ]);

    $this->planner->plan($contract);

    foreach ($contract->visits as $visit) {
        expect($visit->planned_for->toDateString())->toBeLessThanOrEqual('2027-07-29');
    }
});

it('refuses a first visit outside the term', function () {
    actingAs($this->manager)
        ->postJson('/api/contracts', [
            'customer_id' => $this->customer->id,
            'starts_on' => '2026-07-30',
            'ends_on' => '2027-07-29',
            'visits_per_year' => 12,
            'first_visit_on' => '2026-07-01',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('first_visit_on');
});

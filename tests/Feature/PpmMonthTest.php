<?php

use App\Models\Contract;
use App\Models\Customer;
use App\Services\MaintenancePlanner;

/**
 * A month's periodic visit is done within that month: the plan spreads a year of
 * visits one to a month, and working-day nudging never spills one into the next.
 */
it('keeps each monthly visit inside its own month', function () {
    $customer = Customer::factory()->create();
    $contract = Contract::factory()->for($customer)->create([
        'status' => 'active',
        'starts_on' => '2026-09-01',
        'ends_on' => '2027-08-31',
        'visits_per_year' => 12,
    ]);

    app(MaintenancePlanner::class)->plan($contract);

    $months = $contract->visits()->get()
        ->map(fn ($visit) => $visit->planned_for->format('Y-m'))
        ->unique()
        ->values();

    // Twelve visits, one in each of the twelve months — none pushed into another.
    expect($contract->visits()->count())->toBe(12)
        ->and($months)->toHaveCount(12);
});

it('never plans a visit on a Friday or Saturday', function () {
    $customer = Customer::factory()->create();
    $contract = Contract::factory()->for($customer)->create([
        'status' => 'active',
        'starts_on' => '2026-09-01',
        'ends_on' => '2027-08-31',
        'visits_per_year' => 12,
    ]);

    app(MaintenancePlanner::class)->plan($contract);

    $contract->visits()->get()->each(function ($visit) {
        expect($visit->planned_for->isFriday())->toBeFalse()
            ->and($visit->planned_for->isSaturday())->toBeFalse();
    });
});

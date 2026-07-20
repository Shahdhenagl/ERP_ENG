<?php

use App\Models\Contract;
use App\Services\MaintenancePlanner;
use Carbon\CarbonImmutable;

/*
|--------------------------------------------------------------------------
| Visit distribution
|--------------------------------------------------------------------------
| The dates a contract promises. Everything downstream — the plan, the work
| orders, the SLA clock — hangs off getting these right.
*/

beforeEach(function () {
    $this->planner = app(MaintenancePlanner::class);
});

it('spaces visits at the midpoint of each slice, not on the term boundaries', function () {
    $from = CarbonImmutable::parse('2026-01-01');
    $until = CarbonImmutable::parse('2026-12-31');

    $dates = $this->planner->distribute($from, $until, 4);

    expect($dates)->toHaveCount(4);

    // Never the first day: that is usually the installation itself, and a
    // maintenance visit on the day of handover means nothing.
    expect($dates[0]->toDateString())->not->toBe('2026-01-01');
    // Never the last day either, or the first slip pushes it out of the term.
    expect($dates[3]->lessThan($until))->toBeTrue();

    foreach ($dates as $date) {
        expect($date->between($from, $until))->toBeTrue();
    }
});

it('spaces visits evenly', function () {
    $dates = $this->planner->distribute(
        CarbonImmutable::parse('2026-01-01'),
        CarbonImmutable::parse('2026-12-31'),
        4,
    );

    $gaps = [];

    for ($i = 1; $i < count($dates); $i++) {
        $gaps[] = $dates[$i - 1]->diffInDays($dates[$i]);
    }

    // Weekend nudging moves a date by up to two days, so the gaps are close
    // rather than identical.
    foreach ($gaps as $gap) {
        expect($gap)->toBeGreaterThan(85)->toBeLessThan(97);
    }
});

it('handles a frequency that does not divide the year evenly', function () {
    // Five a year is the case that breaks month arithmetic — 12/5 is not a
    // whole number of months. Splitting by days needs no special case.
    $dates = $this->planner->distribute(
        CarbonImmutable::parse('2026-01-01'),
        CarbonImmutable::parse('2026-12-31'),
        5,
    );

    expect($dates)->toHaveCount(5);

    foreach ($dates as $date) {
        expect($date->year)->toBe(2026);
    }
});

it('never plans a visit on the weekend', function () {
    $dates = $this->planner->distribute(
        CarbonImmutable::parse('2026-01-01'),
        CarbonImmutable::parse('2027-12-31'),
        24,
    );

    foreach ($dates as $date) {
        expect($date->dayOfWeek)
            ->not->toBe(CarbonImmutable::FRIDAY)
            ->not->toBe(CarbonImmutable::SATURDAY);
    }
});

it('returns nothing when asked for no visits', function () {
    $dates = $this->planner->distribute(
        CarbonImmutable::parse('2026-01-01'),
        CarbonImmutable::parse('2026-12-31'),
        0,
    );

    expect($dates)->toBe([]);
});

/*
|--------------------------------------------------------------------------
| Term arithmetic
|--------------------------------------------------------------------------
*/

it('scales the visit count to the length of the term', function () {
    $twoYears = Contract::factory()->make([
        'starts_on' => '2026-01-01',
        'ends_on' => '2027-12-31',
        'visits_per_year' => 4,
    ]);

    $halfYear = Contract::factory()->make([
        'starts_on' => '2026-01-01',
        'ends_on' => '2026-06-30',
        'visits_per_year' => 4,
    ]);

    expect($this->planner->visitCountFor($twoYears))->toBe(8)
        ->and($this->planner->visitCountFor($halfYear))->toBe(2);
});

it('always owes at least one visit, however short the term', function () {
    $contract = Contract::factory()->make([
        'starts_on' => '2026-01-01',
        'ends_on' => '2026-01-20',
        'visits_per_year' => 1,
    ]);

    expect($this->planner->visitCountFor($contract))->toBe(1);
});

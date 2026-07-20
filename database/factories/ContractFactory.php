<?php

namespace Database\Factories;

use App\Enums\ContractStatus;
use App\Models\Contract;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Contract> */
class ContractFactory extends Factory
{
    protected $model = Contract::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $startsOn = fake()->dateTimeBetween('-6 months', '+1 month');

        return [
            // `code` is left to the model hook, as with every other entity.
            'customer_id' => Customer::factory(),
            'title' => fake()->randomElement([
                'عقد صيانة سنوي',
                'عقد صيانة وقائية',
                'عقد شامل قطع الغيار',
            ]),
            'starts_on' => $startsOn,
            'ends_on' => (clone $startsOn)->modify('+1 year -1 day'),
            'visits_per_year' => fake()->randomElement([2, 4, 6, 12]),
            'status' => ContractStatus::Draft,
            'value' => fake()->numberBetween(10, 200) * 1000,
            'currency' => 'EGP',
            'sla_response_hours' => fake()->randomElement([4, 8, 24]),
            'sla_resolution_hours' => fake()->randomElement([24, 48, 72]),
        ];
    }

    public function active(): static
    {
        return $this->state(fn () => [
            'status' => ContractStatus::Active,
            'starts_on' => now()->subMonths(2)->toDateString(),
            'ends_on' => now()->addMonths(10)->toDateString(),
        ]);
    }

    public function cancelled(): static
    {
        return $this->state(fn () => ['status' => ContractStatus::Cancelled]);
    }

    /** A term that has already run out — the derived "expired" state. */
    public function expired(): static
    {
        return $this->state(fn () => [
            'status' => ContractStatus::Active,
            'starts_on' => now()->subYears(2)->toDateString(),
            'ends_on' => now()->subMonth()->toDateString(),
        ]);
    }
}

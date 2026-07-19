<?php

namespace Database\Factories;

use App\Enums\AssetStatus;
use App\Models\Asset;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Asset> */
class AssetFactory extends Factory
{
    protected $model = Asset::class;

    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'serial' => strtoupper(fake()->unique()->bothify('???-#####')),
            'brand' => fake()->randomElement(['APC', 'Eaton', 'Vertiv']),
            'model' => fake()->randomElement(['Symmetra LX', '9PX', 'Liebert GXT5', 'Smart-UPS SRT']),
            'capacity' => fake()->randomElement(['10 kVA', '20 kVA', '60 kVA']),
            'status' => AssetStatus::Active,
            // Warranty is left unset by default so tests have to opt into it —
            // "unknown" is the honest default for a device nobody has priced.
            'sold_at' => null,
            'warranty_months' => null,
        ];
    }

    public function underWarranty(): static
    {
        return $this->state(fn () => [
            'sold_at' => now()->subMonths(6),
            'warranty_months' => 24,
        ]);
    }

    public function warrantyExpired(): static
    {
        return $this->state(fn () => [
            'sold_at' => now()->subMonths(40),
            'warranty_months' => 24,
        ]);
    }
}

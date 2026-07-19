<?php

namespace Database\Factories;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Customer> */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    public function definition(): array
    {
        return [
            'name' => fake()->company(),
            'company' => fake()->optional()->company(),
            'phone' => '010'.fake()->numerify('########'),
            'whatsapp' => null,
            'email' => fake()->optional()->safeEmail(),
            'address' => fake()->address(),
            'city' => fake()->city(),
            'lat' => fake()->latitude(29, 31),
            'lng' => fake()->longitude(30, 32),
            'is_active' => true,
        ];
    }

    public function withoutLocation(): static
    {
        return $this->state(fn () => ['lat' => null, 'lng' => null, 'address' => null]);
    }
}

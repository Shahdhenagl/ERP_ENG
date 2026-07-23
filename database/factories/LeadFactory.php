<?php

namespace Database\Factories;

use App\Models\Lead;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Lead> */
class LeadFactory extends Factory
{
    protected $model = Lead::class;

    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'company' => fake()->optional()->company(),
            'phone' => '010'.fake()->numerify('########'),
            'source' => fake()->randomElement(['referral', 'call', 'walk_in', 'social', 'website']),
            'status' => 'new',
            'est_value' => fake()->optional()->randomFloat(2, 5000, 200000),
        ];
    }
}

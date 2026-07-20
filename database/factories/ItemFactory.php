<?php

namespace Database\Factories;

use App\Enums\ItemCategory;
use App\Models\Item;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Item> */
class ItemFactory extends Factory
{
    protected $model = Item::class;

    public function definition(): array
    {
        return [
            'name' => fake()->randomElement(['بطارية 12V 100Ah', 'مروحة تبريد', 'فيوز 32A', 'كابل نحاس 16mm']),
            'category' => ItemCategory::SparePart,
            'unit' => 'قطعة',
            // Zero until something is received: an item nobody has bought yet
            // has no cost, and pretending otherwise skews the first average.
            'avg_cost' => 0,
            'reorder_level' => 0,
        ];
    }

    public function battery(): static
    {
        return $this->state(fn () => [
            'name' => 'بطارية 12V 100Ah',
            'category' => ItemCategory::Battery,
        ]);
    }
}

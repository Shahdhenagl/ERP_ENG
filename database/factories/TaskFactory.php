<?php

namespace Database\Factories;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Asset;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Task> */
class TaskFactory extends Factory
{
    protected $model = Task::class;

    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'created_by' => User::factory()->manager(),
            'assigned_to' => null,
            'title' => fake()->sentence(4),
            'description' => fake()->optional()->paragraph(),
            'type' => fake()->randomElement(TaskType::cases()),
            'priority' => TaskPriority::Normal,
            'status' => TaskStatus::Pending,
            'asset_id' => null,
            'scheduled_at' => fake()->optional()->dateTimeBetween('now', '+2 weeks'),
        ];
    }

    /** Attaches a device owned by the same customer the job is for. */
    public function withAsset(): static
    {
        return $this->afterCreating(function (Task $task) {
            $task->update([
                'asset_id' => Asset::factory()->create(['customer_id' => $task->customer_id])->id,
            ]);
        });
    }

    public function assignedTo(User $technician): static
    {
        return $this->state(fn () => ['assigned_to' => $technician->id]);
    }

    public function status(TaskStatus $status): static
    {
        return $this->state(function () use ($status) {
            $state = ['status' => $status];

            // Keep the timestamp trail consistent with the seeded status.
            if ($column = $status->timestampColumn()) {
                $state[$column] = now();
            }

            return $state;
        });
    }
}

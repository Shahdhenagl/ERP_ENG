<?php

namespace Database\Factories;

use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Employee> */
class EmployeeFactory extends Factory
{
    protected $model = Employee::class;

    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'job_title' => fake()->randomElement(['فني', 'سائق', 'محاسب', 'أمين مخزن']),
            'department' => fake()->randomElement(['الفنية', 'الإدارة', 'المخزن']),
            'hired_on' => now()->subYears(2),
            'employment_type' => 'full_time',
            'basic_salary' => 6000,
            'allowances' => [['name' => 'بدل انتقال', 'amount' => 1000]],
            'insurance_rate' => 0,
            'tax_rate' => 0,
            'annual_leave_days' => 21,
            'status' => 'active',
        ];
    }
}

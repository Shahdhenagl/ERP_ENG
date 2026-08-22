<?php

use App\Enums\TaskStatus;
use App\Models\Branch;
use App\Models\Contract;
use App\Models\ContractVisit;
use App\Models\Customer;
use App\Models\Task;
use App\Models\TaskReport;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    Cache::flush();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create(['name' => 'شركة الاختبار']);
    $this->contract = Contract::factory()->active()->for($this->customer)->create();
});

it('combines selected branches and compares the previous and current month', function () {
    $first = Branch::create([
        'customer_id' => $this->customer->id,
        'name' => 'فرع قطور',
        'address' => 'قطور، الغربية',
    ]);
    $second = Branch::create([
        'customer_id' => $this->customer->id,
        'name' => 'فرع طنطا',
        'address' => 'طنطا، الغربية',
    ]);

    $previousVisit = ContractVisit::create([
        'contract_id' => $this->contract->id,
        'sequence' => 1,
        'planned_for' => '2026-07-15',
        'status' => 'scheduled',
    ]);
    $currentVisit = ContractVisit::create([
        'contract_id' => $this->contract->id,
        'sequence' => 2,
        'planned_for' => '2026-08-15',
        'status' => 'scheduled',
    ]);

    Task::factory()->for($this->customer)->create([
        'branch_id' => $first->id,
        'contract_id' => $this->contract->id,
        'contract_visit_id' => $previousVisit->id,
        'scheduled_at' => '2026-07-15 09:00:00',
        'status' => TaskStatus::Completed,
        'completed_at' => '2026-07-15 12:00:00',
    ]);
    $currentTask = Task::factory()->for($this->customer)->assignedTo($this->technician)->create([
        'branch_id' => $first->id,
        'contract_id' => $this->contract->id,
        'contract_visit_id' => $currentVisit->id,
        'scheduled_at' => '2026-08-15 09:00:00',
        'status' => TaskStatus::Completed,
        'completed_at' => '2026-08-15 12:00:00',
    ]);
    TaskReport::create([
        'task_id' => $currentTask->id,
        'user_id' => $this->technician->id,
        'type' => 'completion',
    ]);
    Task::factory()->for($this->customer)->assignedTo($this->technician)->create([
        'branch_id' => $second->id,
        'contract_id' => $this->contract->id,
        'contract_visit_id' => $currentVisit->id,
        'scheduled_at' => '2026-08-18 09:00:00',
        'status' => TaskStatus::OnTheWay,
    ]);

    $body = actingAs($this->manager)
        ->getJson('/api/reports/periodic-maintenance?month=2026-08&branch_ids[]='.$first->id.'&branch_ids[]='.$second->id)
        ->assertOk()
        ->json('data');

    $rows = collect($body['rows'])->keyBy('branch');

    expect($body['selected_branches'])->toBe(2)
        ->and($body['previous_month'])->toBe('2026-07')
        ->and($body['summary']['previous_completed'])->toBe(1)
        ->and($body['summary']['current_tasks'])->toBe(2)
        ->and($body['summary']['current_completed'])->toBe(1)
        ->and($body['summary']['current_pending'])->toBe(1)
        ->and($body['summary']['current_reports_received'])->toBe(1)
        ->and($rows)->toHaveKeys(['فرع قطور', 'فرع طنطا'])
        ->and($rows['فرع قطور']['current']['status'])->toBe(TaskStatus::Completed->value)
        ->and($rows['فرع قطور']['current']['reports_received'])->toBe(1)
        ->and($rows['فرع طنطا']['current']['status'])->toBe(TaskStatus::OnTheWay->value);
});

it('requires at least one selected branch', function () {
    actingAs($this->manager)
        ->getJson('/api/reports/periodic-maintenance?month=2026-08')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['branch_ids']);
});

it('exports the selected branches as an Arabic csv', function () {
    $branch = Branch::create([
        'customer_id' => $this->customer->id,
        'name' => 'فرع التصدير',
    ]);

    $response = actingAs($this->manager)
        ->get('/api/reports/periodic-maintenance/export?month=2026-08&branch_ids[]='.$branch->id)
        ->assertOk();

    expect($response->headers->get('content-disposition'))->toContain('periodic-maintenance-2026-08.csv');
});

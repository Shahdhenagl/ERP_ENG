<?php

use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The service report as the paper sheet has it: voltage per phase, a site
 * checklist, a number the customer can quote, and readings kept before and
 * after so the visit shows it changed something.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    $this->task = Task::factory()->create([
        'created_by' => $this->manager->id,
        'status' => TaskStatus::InProgress,
    ]);
    $this->task->technicians()->attach($this->technician->id);
});

function fileServiceReport(array $data): \Illuminate\Testing\TestResponse
{
    return actingAs(test()->technician)
        ->postJson("/api/tasks/".test()->task->id."/reports", $data);
}

it('keeps the three input phases and three output phases', function () {
    fileServiceReport([
        'type' => 'diagnosis',
        'input_voltage' => 230, 'input_voltage_l2' => 231, 'input_voltage_l3' => 233,
        'output_voltage' => 230, 'output_voltage_l2' => 230, 'output_voltage_l3' => 230,
    ])->assertCreated();

    $report = $this->task->reports()->where('type', 'diagnosis')->first();

    expect((float) $report->input_voltage_l2)->toBe(231.0)
        ->and((float) $report->input_voltage_l3)->toBe(233.0)
        ->and((float) $report->output_voltage_l2)->toBe(230.0);
});

it('records the site inspection checklist', function () {
    fileServiceReport([
        'type' => 'diagnosis',
        'check_earthing' => 'ok',
        'check_environment' => 'ok',
        'check_charger' => 'ok',
        'check_accessories' => 'issue',
    ])->assertCreated();

    $report = $this->task->reports()->where('type', 'diagnosis')->first();

    expect($report->check_earthing)->toBe('ok')
        ->and($report->check_accessories)->toBe('issue');
});

it('refuses an unknown checklist verdict', function () {
    fileServiceReport(['type' => 'diagnosis', 'check_earthing' => 'maybe'])
        ->assertStatus(422);
});

it('stamps one service-report number on the visit and never changes it', function () {
    fileServiceReport(['type' => 'diagnosis'])->assertCreated();
    $first = $this->task->fresh()->service_report_no;

    expect($first)->toMatch('/^SR-\d{4}-\d{5}$/');

    // A second report on the same visit keeps the same number.
    fileServiceReport(['type' => 'completion'])->assertCreated();

    expect($this->task->fresh()->service_report_no)->toBe($first);
});

it('numbers each visit in sequence', function () {
    fileServiceReport(['type' => 'diagnosis'])->assertCreated();

    $second = Task::factory()->create([
        'status' => TaskStatus::InProgress,
    ]);
    $second->technicians()->attach($this->technician->id);

    actingAs($this->technician)->postJson("/api/tasks/{$second->id}/reports", ['type' => 'diagnosis'])
        ->assertCreated();

    $a = (int) substr($this->task->fresh()->service_report_no, -5);
    $b = (int) substr($second->fresh()->service_report_no, -5);

    expect($b)->toBe($a + 1);
});

it('does not reuse a report number when earlier numbers are missing', function () {
    $year = now()->year;
    Task::factory()->create([
        'service_report_no' => "SR-{$year}-00002",
        'status' => TaskStatus::Completed,
    ]);

    fileServiceReport(['type' => 'diagnosis'])->assertCreated();

    expect($this->task->fresh()->service_report_no)->toBe("SR-{$year}-00003");
});

it('serves the phases, checklist, number and visit timing back through the task', function () {
    fileServiceReport([
        'type' => 'diagnosis',
        'input_voltage' => 230, 'input_voltage_l2' => 231,
        'check_earthing' => 'ok',
    ])->assertCreated();
    fileServiceReport(['type' => 'completion', 'input_voltage' => 235])->assertCreated();

    $data = actingAs($this->manager)
        ->getJson("/api/tasks/{$this->task->id}")
        ->assertOk()
        ->json('data');

    expect($data['service_report_no'])->not->toBeNull()
        ->and($data['visit']['time_in'])->not->toBeNull()
        ->and($data['visit']['time_out'])->not->toBeNull();

    $diagnosis = collect($data['reports'])->firstWhere('type', 'diagnosis');
    expect($diagnosis['readings']['input_voltage_l2'])->toEqual(231)
        ->and($diagnosis['site_checks']['earthing'])->toBe('ok');
});

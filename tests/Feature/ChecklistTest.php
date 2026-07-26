<?php

use App\Enums\TaskStatus;
use App\Models\ChecklistItem;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The fixed periodic-maintenance checklist: the manager maintains the list, the
 * technician reads it on site and files their answers onto the visit's report.
 */
beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
});

it('lets the admin build the checklist', function () {
    actingAs($this->admin)->postJson('/api/checklist-items', ['label' => 'فحص المراوح'])->assertCreated();
    actingAs($this->admin)->postJson('/api/checklist-items', ['label' => 'شد التوصيلات'])->assertCreated();

    $items = actingAs($this->admin)->getJson('/api/checklist-items')->assertOk()->json('data');

    expect($items)->toHaveCount(2)
        ->and($items[0]['label'])->toBe('فحص المراوح');
});

it('keeps a plain manager out of editing the checklist', function () {
    // The checklist is company configuration, and configuration is admin-only.
    actingAs($this->manager)->postJson('/api/checklist-items', ['label' => 'x'])->assertForbidden();
});

it('keeps a technician from editing the checklist but lets them read it', function () {
    ChecklistItem::create(['label' => 'فحص البطاريات']);

    actingAs($this->technician)->postJson('/api/checklist-items', ['label' => 'x'])->assertForbidden();
    actingAs($this->technician)->getJson('/api/checklist-items')->assertOk()->assertJsonCount(1, 'data');
});

it('hides an inactive item from the technician list', function () {
    ChecklistItem::create(['label' => 'بند نشط']);
    ChecklistItem::create(['label' => 'بند موقوف', 'is_active' => false]);

    // The default list is the active one the technician fills.
    actingAs($this->technician)->getJson('/api/checklist-items')->assertJsonCount(1, 'data');
    // The manager can pull the whole template, inactive included.
    actingAs($this->manager)->getJson('/api/checklist-items?all=1')->assertJsonCount(2, 'data');
});

it('snapshots the checklist answers onto the visit report', function () {
    $task = Task::factory()->create([
        'assigned_to' => $this->technician->id,
        'type' => 'maintenance',
        'status' => TaskStatus::InProgress,
    ]);

    actingAs($this->technician)->postJson("/api/tasks/{$task->id}/reports", [
        'type' => 'completion',
        'ppm_checklist' => [
            ['label' => 'فحص المراوح', 'status' => 'ok'],
            ['label' => 'شد التوصيلات', 'status' => 'issue', 'note' => 'توصيلة مرتخية'],
        ],
    ])->assertCreated();

    $report = $task->reports()->where('type', 'completion')->first();

    expect($report->ppm_checklist)->toHaveCount(2)
        ->and($report->ppm_checklist[1]['status'])->toBe('issue')
        ->and($report->ppm_checklist[1]['note'])->toBe('توصيلة مرتخية');
});

it('rejects a checklist answer with no label', function () {
    $task = Task::factory()->create([
        'assigned_to' => $this->technician->id,
        'type' => 'maintenance',
        'status' => TaskStatus::InProgress,
    ]);

    actingAs($this->technician)->postJson("/api/tasks/{$task->id}/reports", [
        'type' => 'completion',
        'ppm_checklist' => [['status' => 'ok']],
    ])->assertStatus(422);
});

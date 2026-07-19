<?php

use App\Enums\TaskStatus;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskAssigned;
use App\Notifications\TaskStatusChanged;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create([
        'address' => 'شارع التحرير، الدقي',
        'lat' => 30.0385,
        'lng' => 31.2110,
    ]);
});

/* ── Creation ────────────────────────────────────────────── */

it('numbers jobs sequentially within the year', function () {
    $first = Task::factory()->create();
    $second = Task::factory()->create();

    $year = now()->year;

    expect($first->code)->toBe("WO-{$year}-0001")
        ->and($second->code)->toBe("WO-{$year}-0002");
});

it('inherits the site from the customer when the manager leaves it blank', function () {
    actingAs($this->manager)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'title' => 'صيانة',
            'type' => 'maintenance',
            'priority' => 'normal',
        ])
        ->assertCreated();

    $task = Task::first();

    expect($task->site_lat)->toBe(30.0385)
        ->and($task->site_address)->toBe('شارع التحرير، الدقي');
});

it('keeps a site address the manager typed in', function () {
    actingAs($this->manager)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'title' => 'صيانة',
            'type' => 'maintenance',
            'priority' => 'normal',
            'site_address' => 'الفرع الثاني — مدينة نصر',
        ])
        ->assertCreated();

    expect(Task::first()->site_address)->toBe('الفرع الثاني — مدينة نصر');
});

it('notifies the technician when a job is assigned to them', function () {
    Notification::fake();

    actingAs($this->manager)
        ->postJson('/api/tasks', [
            'customer_id' => $this->customer->id,
            'assigned_to' => $this->technician->id,
            'title' => 'عطل عاجل',
            'type' => 'repair',
            'priority' => 'urgent',
        ])
        ->assertCreated();

    Notification::assertSentTo($this->technician, TaskAssigned::class);
});

it('refuses to assign a job to someone who is not a technician', function () {
    $task = Task::factory()->create();

    actingAs($this->manager)
        ->postJson("/api/tasks/{$task->id}/assign", ['assigned_to' => $this->manager->id])
        ->assertStatus(422);
});

it('refuses to assign a job to a suspended technician', function () {
    $suspended = User::factory()->technician()->suspended()->create();
    $task = Task::factory()->create();

    actingAs($this->manager)
        ->postJson("/api/tasks/{$task->id}/assign", ['assigned_to' => $suspended->id])
        ->assertStatus(422);
});

/* ── Driving the job forward ─────────────────────────────── */

it('walks a job through the full lifecycle', function () {
    $task = Task::factory()->assignedTo($this->technician)->create();

    foreach (['accepted', 'on_the_way', 'in_progress', 'completed'] as $status) {
        actingAs($this->technician)
            ->postJson("/api/tasks/{$task->id}/status", ['status' => $status])
            ->assertOk()
            ->assertJsonPath('data.status', $status);
    }

    $task->refresh();

    expect($task->accepted_at)->not->toBeNull()
        ->and($task->on_the_way_at)->not->toBeNull()
        ->and($task->started_at)->not->toBeNull()
        ->and($task->completed_at)->not->toBeNull()
        ->and($task->statusLogs)->toHaveCount(4);
});

it('rejects a transition the state machine does not allow', function () {
    $task = Task::factory()->assignedTo($this->technician)->create();

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'completed'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('status');

    expect($task->fresh()->status)->toBe(TaskStatus::Pending);
});

it('refuses to reopen a finished job', function () {
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::Completed)
        ->create();

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'in_progress'])
        ->assertStatus(422);
});

it('records who moved the job and where they were', function () {
    $task = Task::factory()->assignedTo($this->technician)->create();

    actingAs($this->technician)->postJson("/api/tasks/{$task->id}/status", [
        'status' => 'accepted',
        'note' => 'في الطريق خلال ساعة',
        'lat' => 30.05,
        'lng' => 31.23,
    ])->assertOk();

    $log = $task->statusLogs()->first();

    expect($log->user_id)->toBe($this->technician->id)
        ->and($log->from_status)->toBe('pending')
        ->and($log->to_status)->toBe('accepted')
        ->and($log->note)->toBe('في الطريق خلال ساعة')
        ->and($log->lat)->toBe(30.05);
});

it('stores the cancellation reason', function () {
    $task = Task::factory()->assignedTo($this->technician)->create();

    actingAs($this->manager)->postJson("/api/tasks/{$task->id}/status", [
        'status' => 'cancelled',
        'cancel_reason' => 'العميل أجّل الزيارة',
    ])->assertOk();

    expect($task->fresh()->cancel_reason)->toBe('العميل أجّل الزيارة');
});

it('tells the manager when the job moves', function () {
    Notification::fake();

    $task = Task::factory()
        ->assignedTo($this->technician)
        ->create(['created_by' => $this->manager->id]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'accepted'])
        ->assertOk();

    Notification::assertSentTo($this->manager, TaskStatusChanged::class);
});

it('does not notify whoever pushed the button', function () {
    Notification::fake();

    $task = Task::factory()->create(['created_by' => $this->manager->id]);

    actingAs($this->manager)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => 'cancelled', 'cancel_reason' => 'x'])
        ->assertOk();

    Notification::assertNotSentTo($this->manager, TaskStatusChanged::class);
});

/* ── Reports ─────────────────────────────────────────────── */

it('files a completion report with structured readings', function () {
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::InProgress)
        ->create();

    actingAs($this->technician)->postJson("/api/tasks/{$task->id}/reports", [
        'type' => 'completion',
        'input_voltage' => 220.5,
        'load_percent' => 55.2,
        'backup_minutes' => 22,
        'device_condition' => 'fair',
        'batteries_need_replacement' => true,
        'findings' => 'البطاريات ضعيفة',
        'parts_used' => [['name' => 'فيوز 32A', 'qty' => 2]],
    ])->assertCreated();

    $report = $task->completionReport;

    expect($report->input_voltage)->toBe(220.5)
        ->and($report->batteries_need_replacement)->toBeTrue()
        ->and($report->findings)->toBe('البطاريات ضعيفة')
        ->and($report->parts_used)->toHaveCount(1);
});

it('updates the existing report instead of stacking duplicates', function () {
    $task = Task::factory()->assignedTo($this->technician)->create();

    foreach (['أول محاولة', 'تصحيح'] as $findings) {
        actingAs($this->technician)
            ->postJson("/api/tasks/{$task->id}/reports", [
                'type' => 'diagnosis',
                'findings' => $findings,
            ])
            ->assertCreated();
    }

    expect($task->reports()->count())->toBe(1)
        ->and($task->diagnosisReport->findings)->toBe('تصحيح');
});

/* ── Navigation links ────────────────────────────────────── */

it('builds a maps link from the site coordinates', function () {
    $task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'site_lat' => 30.05,
        'site_lng' => 31.23,
    ]);

    expect($task->navigationUrl())->toContain('destination=30.05,31.23');
});

it('falls back to the customer location when the job has none', function () {
    $task = Task::factory()->create([
        'customer_id' => $this->customer->id,
        'site_lat' => null,
        'site_lng' => null,
    ]);

    expect($task->navigationUrl())->toContain('30.0385,31.211');
});

it('has no maps link when nothing locatable was recorded', function () {
    $customer = Customer::factory()->withoutLocation()->create();
    $task = Task::factory()->create([
        'customer_id' => $customer->id,
        'site_lat' => null,
        'site_lng' => null,
        'site_address' => null,
    ]);

    expect($task->navigationUrl())->toBeNull();
});

<?php

use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\TaskPostponement;
use App\Models\User;
use App\Notifications\PostponementRequested;
use App\Notifications\PostponementReviewed;
use App\Notifications\TaskStatusChanged;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->admin = User::factory()->admin()->create();
    $this->inactiveManager = User::factory()->manager()->suspended()->create();
    $this->technician = User::factory()->technician()->create();
});

it('allows a technician to request postponement from an on-the-way task', function () {
    Notification::fake();

    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::OnTheWay)
        ->create();

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/postpone", [
            'postponed_to' => now()->addDays(3)->toDateString(),
            'reason' => 'العميل طلب تغيير الموعد',
        ])
        ->assertOk()
        ->assertJsonPath('postponement.status', 'pending');

    $postponement = TaskPostponement::first();

    expect($postponement)->not->toBeNull()
        ->and($task->fresh()->status)->toBe(TaskStatus::OnTheWay);

    Notification::assertSentTo($this->manager, PostponementRequested::class);
    Notification::assertSentTo($this->admin, PostponementRequested::class);
    Notification::assertNotSentTo($this->inactiveManager, PostponementRequested::class);
});

it('approving a postponement changes the task status and scheduled date', function () {
    Notification::fake();

    $newDate = now()->addDays(5)->toDateString();
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::OnTheWay)
        ->create();
    $postponement = $task->postponements()->create([
        'requested_by' => $this->technician->id,
        'postponed_to' => $newDate,
        'reason' => 'تأجيل بسبب عدم توافر العميل',
        'status' => 'pending',
    ]);

    actingAs($this->manager)
        ->postJson("/api/postponements/{$postponement->id}/approve")
        ->assertOk()
        ->assertJsonPath('postponement.status', 'approved');

    $task->refresh();
    $postponement->refresh();

    expect($task->status)->toBe(TaskStatus::Postponed)
        ->and($task->scheduled_at->toDateString())->toBe($newDate)
        ->and($postponement->status)->toBe('approved')
        ->and($postponement->reviewed_by)->toBe($this->manager->id);

    Notification::assertSentTo($this->technician, TaskStatusChanged::class);
    Notification::assertSentTo($this->technician, PostponementReviewed::class);
});

it('shows an approved postponement in the technician postponed list', function () {
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::Postponed)
        ->create();

    actingAs($this->technician)
        ->getJson('/api/tasks?status=postponed')
        ->assertOk()
        ->assertJsonPath('data.0.id', $task->id)
        ->assertJsonPath('data.0.status', TaskStatus::Postponed->value);
});

it('rejects approving an already reviewed postponement', function () {
    $task = Task::factory()->status(TaskStatus::Postponed)->create();
    $postponement = $task->postponements()->create([
        'requested_by' => $this->technician->id,
        'postponed_to' => now()->addDays(2)->toDateString(),
        'reason' => 'طلب سابق',
        'status' => 'approved',
        'reviewed_by' => $this->manager->id,
        'reviewed_at' => now(),
    ]);

    actingAs($this->manager)
        ->postJson("/api/postponements/{$postponement->id}/approve")
        ->assertStatus(422);
});

it('hides a postponed task from the technician open list before its due date', function () {
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::Postponed)
        ->create(['scheduled_at' => now()->addDay()]);

    actingAs($this->technician)
        ->getJson('/api/tasks?open_only=1')
        ->assertOk()
        ->assertJsonCount(0, 'data');

    expect($task->fresh()->status)->toBe(TaskStatus::Postponed);
});

it('shows a postponed task in the technician open list when its due date arrives', function () {
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::Postponed)
        ->create(['scheduled_at' => now()->subMinute()]);

    actingAs($this->technician)
        ->getJson('/api/tasks?open_only=1')
        ->assertOk()
        ->assertJsonPath('data.0.id', $task->id)
        ->assertJsonPath('data.0.status', TaskStatus::Postponed->value)
        ->assertJsonPath('data.0.allowed_next.0.value', TaskStatus::Accepted->value);
});

it('rejects accepting a postponed task before its due date with 422', function () {
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::Postponed)
        ->create(['scheduled_at' => now()->addHour()]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => TaskStatus::Accepted->value])
        ->assertStatus(422)
        ->assertJsonPath('message', 'لا يمكن قبول المهمة المؤجلة قبل موعدها المحدد.');

    expect($task->fresh()->status)->toBe(TaskStatus::Postponed);
});

it('allows a technician to accept a postponed task after its due date', function () {
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::Postponed)
        ->create(['scheduled_at' => now()->subMinute()]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => TaskStatus::Accepted->value])
        ->assertOk()
        ->assertJsonPath('data.status', TaskStatus::Accepted->value);

    expect($task->fresh()->status)->toBe(TaskStatus::Accepted)
        ->and($task->fresh()->accepted_at)->not->toBeNull();
});

it('follows the full postponed cycle back to on-the-way after the due date', function () {
    $task = Task::factory()
        ->assignedTo($this->technician)
        ->status(TaskStatus::Postponed)
        ->create(['scheduled_at' => now()->subMinute()]);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => TaskStatus::Accepted->value])
        ->assertOk()
        ->assertJsonPath('data.status', TaskStatus::Accepted->value);

    actingAs($this->technician)
        ->postJson("/api/tasks/{$task->id}/status", ['status' => TaskStatus::OnTheWay->value])
        ->assertOk()
        ->assertJsonPath('data.status', TaskStatus::OnTheWay->value);

    expect($task->fresh()->status)->toBe(TaskStatus::OnTheWay)
        ->and($task->fresh()->statusLogs()->pluck('to_status')->all())
        ->toBe([TaskStatus::Accepted->value, TaskStatus::OnTheWay->value]);
});

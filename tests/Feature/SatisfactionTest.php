<?php

use App\Enums\TaskStatus;
use App\Models\SatisfactionSurvey;
use App\Models\Task;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
});

function closedTask(): Task
{
    return Task::factory()->status(TaskStatus::Completed)->create();
}

it('opens a survey for a completed job and inherits its customer', function () {
    $task = closedTask();

    $response = actingAs($this->manager)
        ->postJson('/api/satisfaction', ['task_id' => $task->id])
        ->assertCreated();

    expect($response->json('data.status'))->toBe('pending')
        ->and($response->json('data.customer_id'))->toBe($task->customer_id)
        ->and($response->json('data.task_code'))->toBe($task->code);
});

it('refuses a survey for a job that is not finished', function () {
    $task = Task::factory()->status(TaskStatus::InProgress)->create();

    actingAs($this->manager)->postJson('/api/satisfaction', ['task_id' => $task->id])
        ->assertStatus(422);
});

it('refuses to survey the same job twice', function () {
    $task = closedTask();

    actingAs($this->manager)->postJson('/api/satisfaction', ['task_id' => $task->id])->assertCreated();
    actingAs($this->manager)->postJson('/api/satisfaction', ['task_id' => $task->id])->assertStatus(422);
});

it('records a response and closes the survey', function () {
    $survey = SatisfactionSurvey::create([
        'task_id' => closedTask()->id, 'status' => 'pending', 'sent_at' => now(),
    ]);

    $response = actingAs($this->manager)
        ->postJson("/api/satisfaction/{$survey->id}/respond", ['rating' => 5, 'comment' => 'ممتاز'])
        ->assertOk();

    expect($response->json('data.status'))->toBe('responded')
        ->and($response->json('data.rating'))->toBe(5)
        ->and($response->json('data.comment'))->toBe('ممتاز');
});

it('averages the responses and shows the distribution and response rate', function () {
    // Two answered (5 and 3), one still pending.
    foreach ([5, 3] as $score) {
        SatisfactionSurvey::create([
            'task_id' => closedTask()->id, 'status' => 'responded', 'rating' => $score,
            'responded_at' => now(),
        ]);
    }
    SatisfactionSurvey::create(['task_id' => closedTask()->id, 'status' => 'pending']);

    $summary = actingAs($this->manager)->getJson('/api/satisfaction/summary')->assertOk();

    expect($summary->json('responses'))->toBe(2)
        ->and($summary->json('pending'))->toBe(1)
        ->and($summary->json('average'))->toEqual(4.0)          // (5+3)/2
        ->and($summary->json('response_rate'))->toEqual(66.7)   // 2 of 3
        ->and($summary->json('distribution.5'))->toBe(1)
        ->and($summary->json('distribution.3'))->toBe(1);
});

it('bars a technician from the surveys', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/satisfaction')->assertForbidden();
});

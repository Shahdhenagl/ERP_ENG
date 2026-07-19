<?php

use App\Enums\TaskStatus;

/**
 * The state machine is the rule that keeps the job history honest, so its
 * edges are pinned down explicitly rather than inferred from the API tests.
 */

it('allows the happy path forward', function (TaskStatus $from, TaskStatus $to) {
    expect($from->canTransitionTo($to))->toBeTrue();
})->with([
    [TaskStatus::Pending, TaskStatus::Accepted],
    [TaskStatus::Accepted, TaskStatus::OnTheWay],
    [TaskStatus::Accepted, TaskStatus::InProgress],
    [TaskStatus::OnTheWay, TaskStatus::InProgress],
    [TaskStatus::InProgress, TaskStatus::Completed],
]);

it('allows cancelling from any open state', function (TaskStatus $from) {
    expect($from->canTransitionTo(TaskStatus::Cancelled))->toBeTrue();
})->with([
    TaskStatus::Pending,
    TaskStatus::Accepted,
    TaskStatus::OnTheWay,
    TaskStatus::InProgress,
]);

it('refuses to skip ahead', function (TaskStatus $from, TaskStatus $to) {
    expect($from->canTransitionTo($to))->toBeFalse();
})->with([
    [TaskStatus::Pending, TaskStatus::Completed],
    [TaskStatus::Pending, TaskStatus::InProgress],
    [TaskStatus::Pending, TaskStatus::OnTheWay],
    [TaskStatus::Accepted, TaskStatus::Completed],
    [TaskStatus::OnTheWay, TaskStatus::Completed],
]);

it('refuses to move backwards', function (TaskStatus $from, TaskStatus $to) {
    expect($from->canTransitionTo($to))->toBeFalse();
})->with([
    [TaskStatus::InProgress, TaskStatus::Accepted],
    [TaskStatus::OnTheWay, TaskStatus::Pending],
    [TaskStatus::Accepted, TaskStatus::Pending],
]);

it('treats completed and cancelled as final', function (TaskStatus $terminal) {
    expect($terminal->isTerminal())->toBeTrue()
        ->and($terminal->allowedNext())->toBeEmpty();
})->with([TaskStatus::Completed, TaskStatus::Cancelled]);

it('stamps a timestamp column for every state except pending', function () {
    expect(TaskStatus::Pending->timestampColumn())->toBeNull();

    foreach (TaskStatus::cases() as $status) {
        if ($status !== TaskStatus::Pending) {
            expect($status->timestampColumn())->not->toBeNull();
        }
    }
});

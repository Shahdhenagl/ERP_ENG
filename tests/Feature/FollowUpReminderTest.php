<?php

use App\Models\FollowUp;
use App\Models\Lead;
use App\Models\User;
use App\Notifications\FollowUpDue;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    Notification::fake();
    $this->owner = User::factory()->manager()->create();
    $this->creator = User::factory()->manager()->create();
    $this->lead = Lead::factory()->create();
});

/** A follow-up on the lead, due when told and owned by whom told. */
function followUp(array $attributes = []): FollowUp
{
    return test()->lead->followUps()->create(array_merge([
        'type' => 'call',
        'due_at' => now()->subHour(),
    ], $attributes));
}

it('reminds the owner of a due follow-up and stamps it', function () {
    $followUp = followUp(['owner_id' => $this->owner->id, 'created_by' => $this->creator->id]);

    $this->artisan('follow-ups:remind')->assertSuccessful();

    Notification::assertSentTo($this->owner, FollowUpDue::class);
    Notification::assertNotSentTo($this->creator, FollowUpDue::class);
    expect($followUp->fresh()->reminded_at)->not->toBeNull();
});

it('falls back to the creator when nobody owns it', function () {
    followUp(['owner_id' => null, 'created_by' => $this->creator->id]);

    $this->artisan('follow-ups:remind')->assertSuccessful();

    Notification::assertSentTo($this->creator, FollowUpDue::class);
});

it('reminds each follow-up only once', function () {
    followUp(['owner_id' => $this->owner->id]);

    $this->artisan('follow-ups:remind');
    $this->artisan('follow-ups:remind'); // second run — nothing new is due

    Notification::assertSentToTimes($this->owner, FollowUpDue::class, 1);
});

it('leaves a follow-up not yet due alone', function () {
    followUp(['owner_id' => $this->owner->id, 'due_at' => now()->addDays(3)]);

    $this->artisan('follow-ups:remind');

    Notification::assertNothingSent();
});

it('reminds on the morning of the due date, not the day after', function () {
    // Due later today — the run at dawn should still catch it.
    followUp(['owner_id' => $this->owner->id, 'due_at' => now()->endOfDay()->subMinutes(5)]);

    $this->artisan('follow-ups:remind');

    Notification::assertSentTo($this->owner, FollowUpDue::class);
});

it('does not remind about a completed follow-up', function () {
    followUp(['owner_id' => $this->owner->id, 'done_at' => now()]);

    $this->artisan('follow-ups:remind');

    Notification::assertNothingSent();
});

it('stamps an orphan follow-up without notifying anyone', function () {
    $orphan = followUp(['owner_id' => null, 'created_by' => null]);

    $this->artisan('follow-ups:remind')->assertSuccessful();

    Notification::assertNothingSent();
    // Marked handled so it is not re-examined every night forever.
    expect($orphan->fresh()->reminded_at)->not->toBeNull();
});

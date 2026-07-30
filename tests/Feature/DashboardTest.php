<?php

use App\Models\Task;

it('keeps a job already under way in the actionable queue', function () {
    $far = now()->addMonths(3);

    // A contract visit months out, which the horizon is there to hold back.
    $waiting = Task::factory()->create([
        'status' => 'pending',
        'scheduled_at' => $far,
    ]);

    // The same date, but a technician is already driving to it.
    $moving = Task::factory()->create([
        'status' => 'on_the_way',
        'scheduled_at' => $far,
    ]);

    $actionable = Task::query()->open()->actionable()->pluck('id');

    // The horizon keeps a year of planned visits out of the queue; it must not
    // hide the one somebody is on the road for.
    expect($actionable)->toContain($moving->id)
        ->and($actionable)->not->toContain($waiting->id);
});

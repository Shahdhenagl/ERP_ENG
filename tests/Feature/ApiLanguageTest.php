<?php

use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use App\Support\Terms;

/**
 * An English screen showing an Arabic status is not partly translated — it is
 * two languages in one row. The API answers in the language the caller reads.
 */
beforeEach(function () {
    Terms::flush();
    $this->admin = User::factory()->create(['role' => 'admin']);
});

it('answers in the caller’s language, and in Arabic by default', function () {
    $task = Task::factory()->create(['status' => 'pending']);

    // Asserted on what was actually sent back. Reading the locale after the
    // request tests the harness; reading the payload tests the contract.
    $arabic = $this->actingAs($this->admin)
        ->getJson("/api/tasks/{$task->id}")
        ->assertOk()
        ->json('data.status_label');

    $english = $this->actingAs($this->admin)
        ->withHeader('X-App-Locale', 'en')
        ->getJson("/api/tasks/{$task->id}")
        ->assertOk()
        ->json('data.status_label');

    expect($arabic)->toBe('بانتظار القبول')
        ->and($english)->toBe('Pending');
});

it('falls through to the Arabic for anything not yet translated', function () {
    app()->setLocale('en');
    Terms::flush();

    // The property that lets this land in batches: a phrase with no English
    // shows what was written, never a blank and never a key.
    expect(Terms::get('عبارة لم تُترجم بعد'))->toBe('عبارة لم تُترجم بعد');
});

it('keeps the two dictionaries saying the same thing', function () {
    $php = require lang_path('en/terms.php');
    $ts = file_get_contents(base_path('resources/js/locales/en.ts'));

    // Generated from the interface file, so every entry in it must be present
    // there — a drift between them shows as a status reading one way in a
    // table and another in the record behind it.
    expect(count($php))->toBeGreaterThan(1500);

    foreach (array_slice($php, 0, 40, true) as $arabic => $english) {
        expect($ts)->toContain($arabic);
    }
});

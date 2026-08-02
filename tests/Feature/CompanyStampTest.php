<?php

use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * The seal says the company stands behind the figure on the page, so it is
 * uploaded once by an administrator rather than pasted onto a document by
 * hand — where it would be one careless paste away from a draft.
 */
beforeEach(function () {
    Storage::fake('public');
    $this->admin = User::factory()->create(['role' => 'admin']);
});

it('stores the stamp and hands back a usable url', function () {
    $response = $this->actingAs($this->admin)
        ->postJson('/api/settings/stamp', [
            'stamp' => UploadedFile::fake()->image('seal.png'),
        ])->assertOk();

    $path = Setting::get('company_stamp');

    expect($path)->not->toBeEmpty()
        ->and(Storage::disk('public')->exists($path))->toBeTrue()
        ->and($response->json('data.company_stamp_url'))->toContain($path);
});

it('deletes the file it replaces, rather than leaving it on the disk', function () {
    $this->actingAs($this->admin)->postJson('/api/settings/stamp', [
        'stamp' => UploadedFile::fake()->image('old.png'),
    ])->assertOk();

    $old = Setting::get('company_stamp');

    $this->actingAs($this->admin)->postJson('/api/settings/stamp', [
        'stamp' => UploadedFile::fake()->image('new.png'),
    ])->assertOk();

    expect(Setting::get('company_stamp'))->not->toBe($old)
        ->and(Storage::disk('public')->exists($old))->toBeFalse();
});

it('clears the stamp and the file with it', function () {
    $this->actingAs($this->admin)->postJson('/api/settings/stamp', [
        'stamp' => UploadedFile::fake()->image('seal.png'),
    ])->assertOk();

    $path = Setting::get('company_stamp');

    $this->actingAs($this->admin)->deleteJson('/api/settings/stamp')->assertOk();

    expect(Setting::get('company_stamp'))->toBe('')
        ->and(Storage::disk('public')->exists($path))->toBeFalse();
});

it('refuses anything that is not an image', function () {
    $this->actingAs($this->admin)->postJson('/api/settings/stamp', [
        'stamp' => UploadedFile::fake()->create('seal.pdf', 40, 'application/pdf'),
    ])->assertStatus(422)->assertJsonValidationErrors('stamp');
});

it('keeps the stamp away from anyone who does not manage settings', function () {
    $clerk = User::factory()->create(['role' => 'manager', 'position' => 'secretary']);

    $this->actingAs($clerk)->postJson('/api/settings/stamp', [
        'stamp' => UploadedFile::fake()->image('seal.png'),
    ])->assertForbidden();

    $this->actingAs($clerk)->deleteJson('/api/settings/stamp')->assertForbidden();
});

<?php

use App\Models\Draft;
use App\Models\DraftCategory;
use App\Models\User;
use function Pest\Laravel\actingAs;

it('allows a manager to create categories and drafts', function () {
    $manager = User::factory()->manager()->create();

    $category = actingAs($manager)->postJson('/api/draft-categories', [
        'name' => 'جوابات تفويض',
        'name_en' => 'Authorization Letters',
    ])->assertCreated()->json('data.id');

    actingAs($manager)->postJson('/api/drafts', [
        'draft_category_id' => $category,
        'title' => 'تفويض استلام',
        'content' => '<p><strong>النص</strong></p><script>alert(1)</script>',
        'font_size' => 16,
        'text_color' => '#123456',
    ])->assertCreated()->assertJsonPath('data.title', 'تفويض استلام');

    expect(Draft::first()->content)->not->toContain('<script>');
});

it('prevents deleting a category that contains drafts', function () {
    $manager = User::factory()->manager()->create();
    $category = DraftCategory::create(['name' => 'بيان صيانة']);
    Draft::create(['draft_category_id' => $category->id, 'title' => 'بيان', 'content' => '<p>نص</p>']);

    actingAs($manager)->deleteJson("/api/draft-categories/{$category->id}")->assertStatus(422);
});

it('does not expose drafts to technicians', function () {
    $technician = User::factory()->technician()->create();
    actingAs($technician)->getJson('/api/drafts')->assertForbidden();
});

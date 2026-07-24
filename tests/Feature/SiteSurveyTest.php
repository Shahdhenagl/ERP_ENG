<?php

use App\Models\Lead;
use App\Models\SiteSurvey;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->lead = Lead::create(['name' => 'مصنع الأمل']);
});

it('records a survey against an opportunity and numbers it', function () {
    $response = actingAs($this->manager)->postJson('/api/site-surveys', [
        'lead_id' => $this->lead->id,
        'load_kva' => 30,
        'phase' => 'three',
        'backup_minutes' => 15,
        'recommendation' => 'UPS 40kVA أونلاين',
    ])->assertCreated();

    expect($response->json('data.code'))->toStartWith('SV-')
        ->and($response->json('data.lead_code'))->toBe($this->lead->code)
        ->and($response->json('data.phase_label'))->toBe('ثلاثي')
        ->and($response->json('data.status'))->toBe('draft');
});

it('approves a survey, stamping who and when', function () {
    $survey = SiteSurvey::create(['lead_id' => $this->lead->id, 'load_kva' => 20]);

    $response = actingAs($this->manager)
        ->postJson("/api/site-surveys/{$survey->id}/approve")
        ->assertOk();

    expect($response->json('data.status'))->toBe('approved')
        ->and($response->json('data.approver'))->toBe($this->manager->name)
        ->and($response->json('data.approved_at'))->not->toBeNull();
});

it('locks an approved survey against edits', function () {
    $survey = SiteSurvey::create([
        'lead_id' => $this->lead->id, 'status' => 'approved',
    ]);

    actingAs($this->manager)->putJson("/api/site-surveys/{$survey->id}", ['load_kva' => 99])
        ->assertStatus(422);
});

it('filters surveys by the opportunity', function () {
    SiteSurvey::create(['lead_id' => $this->lead->id]);
    SiteSurvey::create(['lead_id' => Lead::create(['name' => 'آخر'])->id]);

    $rows = actingAs($this->manager)
        ->getJson("/api/site-surveys?lead_id={$this->lead->id}")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['lead_code'])->toBe($this->lead->code);
});

it('bars a technician from site surveys', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/site-surveys')->assertForbidden();
});

<?php

use App\Models\Tender;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
});

it('registers a tender and numbers it', function () {
    $response = actingAs($this->manager)->postJson('/api/tenders', [
        'entity' => 'وزارة الصحة',
        'title' => 'توريد وحدات UPS لمستشفى',
        'estimated_value' => 500000,
        'bid_bond' => 25000,
    ])->assertCreated();

    expect($response->json('data.code'))->toStartWith('TN-')
        ->and($response->json('data.status'))->toBe('registered')
        ->and($response->json('data.entity'))->toBe('وزارة الصحة');
});

it('moves a registered tender to submitted', function () {
    $tender = Tender::create(['entity' => 'جهة', 'title' => 'مناقصة']);

    actingAs($this->manager)->postJson("/api/tenders/{$tender->id}/submit")->assertOk();

    expect($tender->fresh()->status->value)->toBe('submitted');
});

it('settles a tender as won with its awarded value', function () {
    $tender = Tender::create(['entity' => 'جهة', 'title' => 'مناقصة', 'status' => 'submitted']);

    $response = actingAs($this->manager)->postJson("/api/tenders/{$tender->id}/decide", [
        'result' => 'won',
        'awarded_value' => 480000,
    ])->assertOk();

    expect($response->json('data.status'))->toBe('won')
        ->and($response->json('data.awarded_value'))->toEqual(480000)
        ->and($response->json('data.decided_on'))->not->toBeNull();
});

it('refuses to decide a tender already settled', function () {
    $tender = Tender::create(['entity' => 'ج', 'title' => 'م', 'status' => 'lost']);

    actingAs($this->manager)->postJson("/api/tenders/{$tender->id}/decide", ['result' => 'won'])
        ->assertStatus(422);
});

it('reports the win rate off the settled bids', function () {
    Tender::create(['entity' => 'ج', 'title' => '1', 'status' => 'won']);
    Tender::create(['entity' => 'ج', 'title' => '2', 'status' => 'won']);
    Tender::create(['entity' => 'ج', 'title' => '3', 'status' => 'lost']);
    Tender::create(['entity' => 'ج', 'title' => '4', 'status' => 'submitted']); // open, not counted

    $meta = actingAs($this->manager)->getJson('/api/tenders')->assertOk()->json('meta');

    expect($meta['won'])->toBe(2)
        ->and($meta['lost'])->toBe(1)
        ->and($meta['open'])->toBe(1)
        ->and($meta['win_rate'])->toEqual(66.7);   // 2 of 3
});

it('bars a technician from tenders', function () {
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson('/api/tenders')->assertForbidden();
});

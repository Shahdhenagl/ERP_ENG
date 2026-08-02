<?php

use App\Models\Lead;
use App\Models\User;

/**
 * The pipeline said what stage a deal was at and nothing about which of thirty
 * leads at the same stage to ring first. Priority answers that, and it has to
 * order the query rather than the page: sorting one page of thirty leaves the
 * urgent lead on page two.
 */
beforeEach(function () {
    $this->actingAs(User::factory()->create(['role' => 'admin']));
});

it('opens a lead at normal priority without being told', function () {
    $response = $this->postJson('/api/leads', ['name' => 'شركة النيل'])->assertCreated();

    expect($response->json('data.priority'))->toBe('normal')
        ->and($response->json('data.priority_label'))->toBe('عادية');
});

it('puts the hottest leads first, across the whole list', function () {
    Lead::create(['name' => 'عادي', 'priority' => 'normal', 'status' => 'new']);
    Lead::create(['name' => 'منخفض', 'priority' => 'low', 'status' => 'new']);
    Lead::create(['name' => 'عاجل', 'priority' => 'urgent', 'status' => 'new']);
    Lead::create(['name' => 'عالي', 'priority' => 'high', 'status' => 'new']);

    $names = collect($this->getJson('/api/leads')->assertOk()->json('data'))->pluck('name');

    expect($names->all())->toBe(['عاجل', 'عالي', 'عادي', 'منخفض']);
});

it('narrows the board by priority, and by source', function () {
    Lead::create(['name' => 'أ', 'priority' => 'urgent', 'source' => 'call', 'status' => 'new']);
    Lead::create(['name' => 'ب', 'priority' => 'low', 'source' => 'call', 'status' => 'new']);
    Lead::create(['name' => 'ج', 'priority' => 'urgent', 'source' => 'website', 'status' => 'new']);

    expect($this->getJson('/api/leads?priority=urgent')->json('data'))->toHaveCount(2)
        ->and($this->getJson('/api/leads?source=call')->json('data'))->toHaveCount(2)
        ->and($this->getJson('/api/leads?priority=urgent&source=website')->json('data'))
        ->toHaveCount(1);
});

it('refuses a priority it does not recognise', function () {
    $this->postJson('/api/leads', ['name' => 'شركة', 'priority' => 'blazing'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('priority');
});

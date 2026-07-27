<?php

use App\Models\Customer;
use App\Models\Item;
use App\Models\SiteSurvey;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The smaller closes from the backlog: a site survey can be deleted (unless it
 * has been approved as a quote's basis), items export as their own dataset, and
 * the customer transactions log carries the contact details its print needs.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
});

it('deletes a draft site survey', function () {
    $survey = SiteSurvey::create(['status' => 'draft', 'city' => 'القاهرة']);

    actingAs($this->manager)->deleteJson("/api/site-surveys/{$survey->id}")->assertOk();

    expect(SiteSurvey::find($survey->id))->toBeNull();
});

it('refuses to delete an approved survey', function () {
    $survey = SiteSurvey::create([
        'status' => 'approved', 'approved_by' => $this->manager->id, 'approved_at' => now(),
    ]);

    actingAs($this->manager)->deleteJson("/api/site-surveys/{$survey->id}")->assertStatus(422);

    expect(SiteSurvey::find($survey->id))->not->toBeNull();
});

it('offers items as an export dataset', function () {
    actingAs($this->manager)->getJson('/api/reports/datasets')
        ->assertOk()
        ->assertJsonFragment(['key' => 'items', 'label' => 'الأصناف والمخزون']);
});

it('exports items with their price and cost columns', function () {
    Item::factory()->create(['name' => 'بطارية 100Ah', 'category' => 'battery', 'sell_price' => 2400]);

    $csv = actingAs($this->manager)->get('/api/reports/custom/items/export')
        ->assertOk()
        ->streamedContent();

    expect($csv)->toContain('سعر البيع')
        ->and($csv)->toContain('بطارية 100Ah');
});

it('carries the customer contact on the transactions log for its print', function () {
    $customer = Customer::factory()->create(['name' => 'شركة النور', 'phone' => '01000000009']);

    actingAs($this->manager)->getJson("/api/customers/{$customer->id}/timeline")
        ->assertOk()
        ->assertJsonPath('meta.customer.phone', '01000000009');
});

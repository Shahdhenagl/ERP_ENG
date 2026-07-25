<?php

use App\Models\Customer;
use App\Models\Quotation;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
});

function draftQuote(): Quotation
{
    return Quotation::create([
        'customer_id' => test()->customer->id,
        'title' => 'توريد UPS',
        'created_by' => test()->manager->id,
    ]);
}

it('submits a draft into the approval queue', function () {
    $quote = draftQuote();

    $response = actingAs($this->manager)
        ->postJson("/api/quotations/{$quote->id}/submit")
        ->assertOk();

    expect($response->json('data.is_pending_approval'))->toBeTrue()
        ->and($response->json('data.submitted_at'))->not->toBeNull();
});

it('lists only submitted-and-undecided quotes in the queue', function () {
    $submitted = draftQuote();
    actingAs($this->manager)->postJson("/api/quotations/{$submitted->id}/submit")->assertOk();
    draftQuote(); // a plain draft, never submitted

    $rows = actingAs($this->manager)
        ->getJson('/api/quotations?pending_approval=1')
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['id'])->toBe($submitted->id);
});

it('approves a submitted quote, stamping who and when', function () {
    $quote = draftQuote();
    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/submit")->assertOk();

    $response = actingAs($this->manager)
        ->postJson("/api/quotations/{$quote->id}/approve")
        ->assertOk();

    expect($response->json('data.is_approved'))->toBeTrue()
        ->and($response->json('data.approver'))->toBe($this->manager->name)
        ->and($response->json('data.is_pending_approval'))->toBeFalse();
});

it('sends a quote back for edits with a note, leaving the queue', function () {
    $quote = draftQuote();
    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/submit")->assertOk();

    actingAs($this->manager)
        ->postJson("/api/quotations/{$quote->id}/reject-approval", ['note' => 'راجع السعر'])
        ->assertOk();

    $fresh = $quote->fresh();
    expect($fresh->isPendingApproval())->toBeFalse()
        ->and($fresh->submitted_at)->toBeNull()
        ->and($fresh->approval_note)->toBe('راجع السعر');
});

it('blocks sending a quote that is pending approval', function () {
    $quote = draftQuote();
    $quote->lines()->create(['description' => 'بند', 'qty' => 1, 'unit_price' => 100, 'line_total' => 100, 'sort' => 0]);
    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/submit")->assertOk();

    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/send")->assertStatus(422);
});

it('lets an approved quote be sent', function () {
    $quote = draftQuote();
    $quote->lines()->create(['description' => 'بند', 'qty' => 1, 'unit_price' => 100, 'line_total' => 100, 'sort' => 0]);
    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/submit")->assertOk();
    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/approve")->assertOk();

    $response = actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/send")->assertOk();
    expect($response->json('data.status'))->toBe('sent');
});

it('refuses to approve a quote that was never submitted', function () {
    $quote = draftQuote();

    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/approve")
        ->assertStatus(422);
});

it('bars a technician from the approval actions', function () {
    $technician = User::factory()->technician()->create();
    $quote = draftQuote();

    actingAs($technician)->postJson("/api/quotations/{$quote->id}/submit")->assertForbidden();
});

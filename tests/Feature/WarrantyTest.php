<?php

use App\Enums\ClaimStatus;
use App\Models\Asset;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Services\WarrantyService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->warranty = app(WarrantyService::class);
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->asset = Asset::factory()->create();
});

/** Register cover on the fixture asset. */
function cover(array $data = []): Warranty
{
    return test()->warranty->register([
        'asset_id' => test()->asset->id,
        'starts_on' => now()->toDateString(),
        'months' => 12,
        ...$data,
    ], test()->manager);
}

/* ── Registering ─────────────────────────────────────────── */

it('closes a twelve-month term the day before the anniversary', function () {
    // A year from 1 January runs to 31 December. Ending on the anniversary
    // would hand every customer a free day and make two consecutive terms
    // overlap.
    $warranty = cover(['starts_on' => '2026-01-01', 'months' => 12]);

    expect($warranty->ends_on->toDateString())->toBe('2026-12-31');
});

it('takes an explicit end date over a term in months', function () {
    $warranty = cover(['ends_on' => now()->addYears(3)->toDateString(), 'months' => 12]);

    expect($warranty->ends_on->toDateString())->toBe(now()->addYears(3)->toDateString());
});

it('takes the customer from the asset rather than the request', function () {
    // A warranty naming a different customer than the unit it covers would be
    // unarguable in exactly the moment it mattered.
    $warranty = cover(['customer_id' => 9999]);

    expect($warranty->customer_id)->toBe($this->asset->customer_id);
});

it('refuses a term that ends before it starts', function () {
    cover(['starts_on' => now()->toDateString(), 'ends_on' => now()->subMonth()->toDateString()]);
})->throws(Illuminate\Validation\ValidationException::class);

it('numbers warranties in sequence for the year', function () {
    cover();
    $second = test()->warranty->register([
        'asset_id' => Asset::factory()->create()->id, 'months' => 12,
    ], $this->manager);

    expect($second->code)->toBe('WR-'.now()->year.'-0002');
});

/* ── Derived status ──────────────────────────────────────── */

it('reads a term that has run out as expired, not active', function () {
    $warranty = cover([
        'starts_on' => now()->subYears(2)->toDateString(),
        'ends_on' => now()->subYear()->toDateString(),
    ]);

    expect($warranty->effectiveStatus())->toBe('expired')
        ->and($warranty->daysRemaining())->toBeLessThan(0);
});

it('flags cover in its last month so an extension can be sold', function () {
    $warranty = cover(['ends_on' => now()->addDays(10)->toDateString()]);

    expect($warranty->effectiveStatus())->toBe('expiring');
});

it('reads cover that has not started yet as scheduled', function () {
    $warranty = cover([
        'starts_on' => now()->addMonth()->toDateString(),
        'ends_on' => now()->addYear()->toDateString(),
    ]);

    expect($warranty->effectiveStatus())->toBe('scheduled');
});

/* ── The asset's cover ───────────────────────────────────── */

it('derives the asset cover from its warranty records', function () {
    cover(['ends_on' => now()->addYears(2)->toDateString()]);

    expect($this->asset->fresh()->warrantyEndsAt()->toDateString())
        ->toBe(now()->addYears(2)->toDateString())
        ->and($this->asset->fresh()->isUnderWarranty())->toBeTrue();
});

it('falls back to the sale term for a unit with no warranty record', function () {
    // Units registered before warranties existed must not silently lose cover.
    $old = Asset::factory()->underWarranty()->create();

    expect($old->isUnderWarranty())->toBeTrue()
        ->and($old->warrantyEndsAt()->toDateString())
        ->toBe($old->sold_at->copy()->addMonths(24)->toDateString());
});

it('still reports unknown cover as unknown', function () {
    expect($this->asset->isUnderWarranty())->toBeNull();
});

it('finds assets under warranty either way round', function () {
    cover();
    Asset::factory()->underWarranty()->create();
    Asset::factory()->warrantyExpired()->create();

    expect(Asset::query()->underWarranty()->count())->toBe(2);
});

/* ── Extending ───────────────────────────────────────────── */

it('starts an extension the day after the original ends', function () {
    // Buying a year in the last month of cover must not lose that month.
    $original = cover(['ends_on' => now()->addMonth()->toDateString()]);
    $extension = $this->warranty->extend($original, ['months' => 12], $this->manager);

    expect($extension->starts_on->toDateString())
        ->toBe($original->ends_on->copy()->addDay()->toDateString())
        ->and($extension->parent_id)->toBe($original->id)
        ->and($extension->kind->value)->toBe('extension');
});

it('leaves the original term readable after an extension', function () {
    $original = cover(['ends_on' => '2027-01-01']);
    $this->warranty->extend($original, ['months' => 12], $this->manager);

    expect($original->fresh()->ends_on->toDateString())->toBe('2027-01-01');
});

it('inherits what the original covered', function () {
    $original = cover(['covers' => 'labour']);
    $extension = $this->warranty->extend($original, ['months' => 6], $this->manager);

    expect($extension->covers)->toBe('labour');
});

it('carries the asset cover to the end of the extension', function () {
    $original = cover(['ends_on' => now()->addMonth()->toDateString()]);
    $extension = $this->warranty->extend($original, ['months' => 12], $this->manager);

    expect($this->asset->fresh()->warrantyEndsAt()->toDateString())
        ->toBe($extension->ends_on->toDateString());
});

it('refuses an extension that ends no later than the original', function () {
    $original = cover(['ends_on' => now()->addYears(5)->toDateString()]);

    $this->warranty->extend($original, ['ends_on' => now()->addYear()->toDateString()], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to extend a voided warranty', function () {
    $warranty = cover();
    $this->warranty->void($warranty, 'عبث بالجهاز', $this->manager);

    $this->warranty->extend($warranty, ['months' => 12], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Claims ──────────────────────────────────────────────── */

it('files a claim against whatever covered the unit that day', function () {
    $warranty = cover();

    $claim = $this->warranty->claim([
        'asset_id' => $this->asset->id,
        'fault' => 'البطاريات لا تشحن',
    ], $this->manager);

    expect($claim->warranty_id)->toBe($warranty->id)
        ->and($claim->status)->toBe(ClaimStatus::Open);
});

it('judges cover by the day the fault happened, not the day it was filed', function () {
    // A Friday failure filed the following Monday is still covered by a
    // warranty that lapsed over the weekend.
    cover([
        'starts_on' => now()->subYear()->toDateString(),
        'ends_on' => now()->subDays(3)->toDateString(),
    ]);

    $claim = $this->warranty->claim([
        'asset_id' => $this->asset->id,
        'reported_on' => now()->subDays(5)->toDateString(),
        'fault' => 'عطل في المروحة',
    ], $this->manager);

    expect($claim)->toBeInstanceOf(WarrantyClaim::class);
});

it('refuses a claim on a unit with no cover on that date', function () {
    cover([
        'starts_on' => now()->subYears(3)->toDateString(),
        'ends_on' => now()->subYears(2)->toDateString(),
    ]);

    $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses a claim under a voided warranty', function () {
    // Cover torn up for tampering never covered anything, whatever the dates.
    $warranty = cover();
    $this->warranty->void($warranty, 'فتح الجهاز بواسطة طرف ثالث', $this->manager);

    $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses a second open claim on the same unit', function () {
    // Two repair orders for one failure is how a technician ends up dispatched
    // to a job someone else already finished.
    cover();
    $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'نفس العطل'], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('allows a new claim once the last one is settled', function () {
    cover();
    $first = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->reject($first, 'سوء استخدام');

    $second = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل آخر'], $this->manager);

    expect($second->id)->not->toBe($first->id);
});

it('picks the longest-running cover when two overlap', function () {
    cover(['ends_on' => now()->addMonths(2)->toDateString()]);
    $longer = cover(['ends_on' => now()->addYears(3)->toDateString()]);

    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);

    expect($claim->warranty_id)->toBe($longer->id);
});

/* ── Deciding ────────────────────────────────────────────── */

it('records the reason a claim was refused', function () {
    cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);

    $rejected = $this->warranty->reject($claim, 'الجهاز تعرض لغمر مياه');

    expect($rejected->status)->toBe(ClaimStatus::Rejected)
        ->and($rejected->decision_note)->toBe('الجهاز تعرض لغمر مياه')
        ->and($rejected->resolved_at)->not->toBeNull();
});

it('refuses to re-judge a settled claim', function () {
    cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->reject($claim, 'سوء استخدام');

    $this->warranty->approve($claim->fresh());
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Repair orders ───────────────────────────────────────── */

it('raises a repair order as an ordinary work order', function () {
    // The same dispatch board, completion report and van stock as every other
    // job — a second kind of document would only get a second set of bugs.
    cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->approve($claim);

    $task = $this->warranty->raiseRepairOrder($claim->fresh(), [], $this->manager);

    expect($task->type->value)->toBe('repair')
        ->and($task->asset_id)->toBe($this->asset->id)
        ->and($task->code)->toStartWith('WO-')
        ->and($claim->fresh()->task_id)->toBe($task->id);
});

it('refuses a repair order before the claim is approved', function () {
    cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);

    $this->warranty->raiseRepairOrder($claim, [], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses a second repair order for the same claim', function () {
    cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->approve($claim);
    $this->warranty->raiseRepairOrder($claim->fresh(), [], $this->manager);

    $this->warranty->raiseRepairOrder($claim->fresh(), [], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Replacement ─────────────────────────────────────────── */

it('carries the remaining cover to the replacement unit', function () {
    // The customer bought a period of protection, not a serial number.
    $original = cover(['ends_on' => now()->addYears(2)->toDateString()]);
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->approve($claim);

    $replacement = Asset::factory()->create(['customer_id' => $this->asset->customer_id]);
    $this->warranty->replace($claim->fresh(), ['replacement_asset_id' => $replacement->id], $this->manager);

    $carried = Warranty::where('asset_id', $replacement->id)->first();

    expect($carried)->not->toBeNull()
        ->and($carried->ends_on->toDateString())->toBe($original->ends_on->toDateString())
        ->and($carried->parent_id)->toBe($original->id)
        ->and($replacement->fresh()->isUnderWarranty())->toBeTrue();
});

it('retires the unit that was swapped out', function () {
    cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->approve($claim);
    $replacement = Asset::factory()->create();

    $this->warranty->replace($claim->fresh(), ['replacement_asset_id' => $replacement->id], $this->manager);

    expect($this->asset->fresh()->status->value)->toBe('retired')
        ->and($claim->fresh()->status)->toBe(ClaimStatus::Replaced);
});

it('refuses to replace a unit with itself', function () {
    cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->approve($claim);

    $this->warranty->replace($claim->fresh(), ['replacement_asset_id' => $this->asset->id], $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to void cover once something was repaired under it', function () {
    $warranty = cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->approve($claim);
    $this->warranty->markRepaired($claim->fresh());

    $this->warranty->void($warranty, 'خطأ إداري', $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Device history ──────────────────────────────────────── */

it('tells the whole story of one unit', function () {
    $original = cover(['ends_on' => now()->addYears(2)->toDateString()]);
    $this->warranty->extend($original, ['months' => 12], $this->manager);

    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);
    $this->warranty->approve($claim);
    $this->warranty->markRepaired($claim->fresh());

    $history = $this->warranty->history($this->asset);

    expect($history['warranties'])->toHaveCount(2)
        ->and($history['claims'])->toHaveCount(1)
        ->and($history['repairs'])->toBe(1)
        ->and($history['claims_open'])->toBe(0)
        ->and($history['cover']->id)->toBe($original->id);
});

/* ── Through the API ─────────────────────────────────────── */

it('registers a warranty through the API', function () {
    actingAs($this->manager)
        ->postJson('/api/warranties', [
            'asset_id' => $this->asset->id,
            'kind' => 'supplier',
            'months' => 24,
            'supplier_reference' => 'APC-2026-77',
        ])
        ->assertCreated()
        ->assertJsonPath('data.kind', 'supplier');

    expect(Warranty::where('asset_id', $this->asset->id)->exists())->toBeTrue();
});

it('walks a claim from filing to repaired through the API', function () {
    cover();

    $claim = actingAs($this->manager)
        ->postJson('/api/warranty-claims', [
            'asset_id' => $this->asset->id,
            'fault' => 'صوت عالٍ من المروحة',
        ])
        ->assertCreated()
        ->json('data.id');

    actingAs($this->manager)
        ->postJson("/api/warranty-claims/{$claim}/decide", ['action' => 'approve'])
        ->assertOk()
        ->assertJsonPath('data.status', 'approved');

    actingAs($this->manager)
        ->postJson("/api/warranty-claims/{$claim}/repair-order", [])
        ->assertCreated();

    actingAs($this->manager)
        ->postJson("/api/warranty-claims/{$claim}/decide", ['action' => 'repaired'])
        ->assertOk()
        ->assertJsonPath('data.status', 'repaired');
});

it('requires a reason to refuse a claim', function () {
    cover();
    $claim = $this->warranty->claim(['asset_id' => $this->asset->id, 'fault' => 'عطل'], $this->manager);

    actingAs($this->manager)
        ->postJson("/api/warranty-claims/{$claim->id}/decide", ['action' => 'reject'])
        ->assertStatus(422);
});

it('serves the device history through the API', function () {
    cover();

    actingAs($this->manager)
        ->getJson("/api/assets/{$this->asset->id}/history")
        ->assertOk()
        ->assertJsonPath('summary.claims_open', 0)
        ->assertJsonCount(1, 'warranties');
});

it('lists cover about to run out', function () {
    cover(['ends_on' => now()->addDays(15)->toDateString()]);
    test()->warranty->register([
        'asset_id' => Asset::factory()->create()->id, 'months' => 60,
    ], $this->manager);

    $response = actingAs($this->manager)
        ->getJson('/api/warranties?expiring_within=30')
        ->assertOk();

    expect($response->json('data'))->toHaveCount(1);
});

it('keeps a technician out of the warranty register', function () {
    actingAs($this->technician)->getJson('/api/warranties')->assertForbidden();
    actingAs($this->technician)
        ->postJson('/api/warranty-claims', ['asset_id' => $this->asset->id, 'fault' => 'x'])
        ->assertForbidden();
});

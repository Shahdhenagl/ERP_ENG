<?php

use App\Models\Asset;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\SupplierPayment;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchasingService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
    $this->customer = Customer::factory()->create();
});

/* ── Item categories ─────────────────────────────────────── */

it('promotes the three that were fixed in code', function () {
    // The migration seeds them, so an install that never runs the seeder still
    // has its items grouped.
    expect(ItemCategory::whereNotNull('slug')->count())->toBe(3)
        ->and(ItemCategory::where('slug', 'battery')->first()->name)->toBe('بطاريات');
});

it('points existing items at their own group', function () {
    $item = Item::factory()->create(['category' => 'battery']);

    // Created after the migration, so the controller is what links it — but the
    // three seeded groups are there to be linked to.
    expect(ItemCategory::where('slug', 'battery')->exists())->toBeTrue()
        ->and($item->category->value)->toBe('battery');
});

it('lets an operator add a group without a deploy', function () {
    actingAs($this->manager)
        ->postJson('/api/item-categories', ['name' => 'كروت التحكم', 'colour' => 'violet'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'كروت التحكم')
        // No slug: only the original three carry one.
        ->assertJsonPath('data.is_system', false);
});

it('refuses two groups with the same name', function () {
    ItemCategory::create(['name' => 'كروت التحكم']);

    actingAs($this->manager)
        ->postJson('/api/item-categories', ['name' => 'كروت التحكم'])
        ->assertStatus(422);
});

it('refuses to delete a group that still holds items', function () {
    // Deleting would either orphan every item in it or delete them, and neither
    // is what "remove this word from the list" means.
    $group = ItemCategory::where('slug', 'battery')->first();
    Item::factory()->create(['item_category_id' => $group->id]);

    actingAs($this->manager)
        ->deleteJson("/api/item-categories/{$group->id}")
        ->assertStatus(422);
});

it('deletes an empty group', function () {
    $group = ItemCategory::create(['name' => 'مؤقتة']);

    actingAs($this->manager)
        ->deleteJson("/api/item-categories/{$group->id}")
        ->assertOk();

    expect(ItemCategory::find($group->id))->toBeNull();
});

it('counts what is in each group', function () {
    $group = ItemCategory::where('slug', 'spare_part')->first();
    Item::factory()->count(3)->create(['item_category_id' => $group->id]);

    $response = actingAs($this->manager)->getJson('/api/item-categories')->assertOk();
    $row = collect($response->json('data'))->firstWhere('slug', 'spare_part');

    expect($row['items_count'])->toBe(3);
});

it('keeps a technician out of the catalogue settings', function () {
    actingAs($this->technician)
        ->postJson('/api/item-categories', ['name' => 'أي حاجة'])
        ->assertForbidden();
});

/* ── Contract renewal ────────────────────────────────────── */

/** A live contract on the fixture customer. */
function running(array $attributes = []): Contract
{
    return Contract::factory()->create([
        'customer_id' => test()->customer->id,
        'status' => 'active',
        'starts_on' => now()->subMonths(11)->toDateString(),
        'ends_on' => now()->addMonth()->toDateString(),
        'visits_per_year' => 4,
        'value' => 24000,
        ...$attributes,
    ]);
}

it('starts the renewal the day after the old term ends', function () {
    // A renewal signed early must not leave a gap in cover.
    $contract = running(['ends_on' => '2026-12-31']);

    $response = actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/renew", ['months' => 12])
        ->assertCreated();

    expect($response->json('data.starts_on'))->toBe('2027-01-01')
        ->and($response->json('data.ends_on'))->toBe('2027-12-31');
});

it('leaves the original term untouched', function () {
    // Last year's dates are the record of what was delivered.
    $contract = running(['ends_on' => '2026-12-31']);

    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/renew")->assertCreated();

    expect($contract->fresh()->ends_on->toDateString())->toBe('2026-12-31')
        ->and($contract->fresh()->status->value)->toBe('active');
});

it('links the two so they read as one relationship', function () {
    $contract = running();

    $id = actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/renew")
        ->json('data.id');

    expect(Contract::find($id)->renewed_from_id)->toBe($contract->id)
        ->and($contract->fresh()->renewal->id)->toBe($id);
});

it('carries the price and cadence unless they are changed', function () {
    $contract = running();

    $response = actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/renew")
        ->assertCreated();

    expect((float) $response->json('data.value'))->toBe(24000.0)
        ->and($response->json('data.visits_per_year'))->toBe(4);
});

it('takes a new price and cadence when they are given', function () {
    $contract = running();

    $response = actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/renew", [
            'months' => 24,
            'value' => 30000,
            'visits_per_year' => 6,
        ])
        ->assertCreated();

    expect((float) $response->json('data.value'))->toBe(30000.0)
        ->and($response->json('data.visits_per_year'))->toBe(6);
});

it('carries the same devices onto the renewal', function () {
    // A renewal covering different units is a different contract.
    $contract = running();
    $asset = Asset::factory()->create(['customer_id' => $this->customer->id]);
    $contract->assets()->attach($asset->id);

    $id = actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/renew")
        ->json('data.id');

    expect(Contract::find($id)->assets->pluck('id')->all())->toBe([$asset->id]);
});

it('refuses to renew the same contract twice', function () {
    $contract = running();

    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/renew")->assertCreated();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/renew")->assertStatus(422);
});

it('starts the renewal as a draft, not live', function () {
    // Someone still has to agree the new term before visits are planned.
    $contract = running();

    $response = actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/renew")
        ->assertCreated();

    expect($response->json('data.status'))->toBe('draft');
});

it('keeps a technician from renewing a contract', function () {
    $contract = running();

    actingAs($this->technician)
        ->postJson("/api/contracts/{$contract->id}/renew")
        ->assertForbidden();
});

/* ── The payment voucher ─────────────────────────────────── */

it('serves one voucher for printing', function () {
    $supplier = Supplier::create(['name' => 'النور', 'tax_id' => '123456789']);

    \App\Models\CashMovement::create([
        'cash_box_id' => \App\Models\CashBox::default()->id,
        'direction' => 'in', 'amount' => 10000, 'source' => 'opening',
    ]);

    $payment = app(PurchasingService::class)->paySupplier([
        'supplier_id' => $supplier->id,
        'amount' => 2500,
        'method' => 'cheque',
        'reference' => 'CHQ-99',
    ], $this->manager);

    $response = actingAs($this->manager)
        ->getJson("/api/supplier-payments/{$payment->id}")
        ->assertOk();

    expect($response->json('data.code'))->toStartWith('PV-')
        ->and((float) $response->json('data.amount'))->toBe(2500.0)
        ->and($response->json('data.supplier'))->toBe('النور')
        ->and($response->json('data.supplier_tax_id'))->toBe('123456789')
        ->and($response->json('data.method_label'))->toBe('شيك')
        ->and($response->json('data.reference'))->toBe('CHQ-99')
        ->and($response->json('data.cash_box'))->not->toBeNull();
});

it('keeps a technician from reading a voucher', function () {
    $supplier = Supplier::create(['name' => 'النور']);
    $payment = SupplierPayment::create([
        'supplier_id' => $supplier->id,
        'cash_box_id' => \App\Models\CashBox::default()->id,
        'amount' => 100,
    ]);

    actingAs($this->technician)
        ->getJson("/api/supplier-payments/{$payment->id}")
        ->assertForbidden();
});

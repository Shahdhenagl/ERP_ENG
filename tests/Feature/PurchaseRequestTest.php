<?php

use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Supplier;
use App\Models\User;
use App\Services\RequisitionService;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->requisitions = app(RequisitionService::class);

    $this->manager = User::factory()->manager()->create();
    $this->otherManager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    $this->item = Item::factory()->create(['name' => 'بطارية 100 أمبير', 'unit' => 'قطعة']);
    $this->supplier = Supplier::create(['name' => 'النور للبطاريات']);
});

/** A request from the fixture technician. */
function ask(array $lines = null, ?User $by = null): PurchaseRequest
{
    return test()->requisitions->draft([
        'reason' => 'نفدت من السيارة',
        'lines' => $lines ?? [['item_id' => test()->item->id, 'qty' => 4]],
    ], $by ?? test()->technician);
}

/* ── Raising one ─────────────────────────────────────────── */

it('lets whoever discovered the need raise the request', function () {
    $request = ask();

    expect($request->requested_by)->toBe($this->technician->id)
        ->and($request->status)->toBe('draft')
        ->and($request->code)->toStartWith('RQ-');
});

it('fills the description and unit from the catalogue', function () {
    $request = ask();

    expect($request->lines[0]->description)->toBe('بطارية 100 أمبير')
        ->and($request->lines[0]->unit)->toBe('قطعة');
});

it('takes a request for something the catalogue has never carried', function () {
    // Telling a technician to create an item record first is how a request
    // becomes a phone call again.
    $request = ask([['description' => 'مروحة تبريد 12 بوصة', 'qty' => 1]]);

    expect($request->lines[0]->item_id)->toBeNull()
        ->and($request->lines[0]->description)->toBe('مروحة تبريد 12 بوصة');
});

it('refuses to send a request with nothing on it', function () {
    $request = $this->requisitions->draft(['lines' => []], $this->technician);

    $this->requisitions->submit($request);
})->throws(Illuminate\Validation\ValidationException::class);

it('freezes the request once it is sent', function () {
    $request = $this->requisitions->submit(ask());

    $this->requisitions->syncLines($request, [['item_id' => $this->item->id, 'qty' => 99]]);
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Deciding ────────────────────────────────────────────── */

it('refuses to let anyone approve their own request', function () {
    // The separation the document exists for. Without it the request records
    // nothing a phone call did not.
    $own = ask(by: $this->manager);
    $this->requisitions->submit($own);

    $this->requisitions->approve($own->fresh(), $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('records who agreed and when', function () {
    $request = $this->requisitions->submit(ask());

    $approved = $this->requisitions->approve($request, $this->manager, 'مطلوبة فعلًا');

    expect($approved->status)->toBe('approved')
        ->and($approved->decided_by)->toBe($this->manager->id)
        ->and($approved->decided_at)->not->toBeNull()
        ->and($approved->decision_note)->toBe('مطلوبة فعلًا');
});

it('records the reason a request was refused', function () {
    $request = $this->requisitions->submit(ask());

    $rejected = $this->requisitions->reject($request, $this->manager, 'يوجد مخزون كافٍ');

    expect($rejected->status)->toBe('rejected')
        ->and($rejected->decision_note)->toBe('يوجد مخزون كافٍ');
});

it('refuses to decide on a request that was never sent', function () {
    $this->requisitions->approve(ask(), $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to decide twice', function () {
    $request = $this->requisitions->submit(ask());
    $this->requisitions->approve($request, $this->manager);

    $this->requisitions->reject($request->fresh(), $this->otherManager, 'غيّرت رأيي');
})->throws(Illuminate\Validation\ValidationException::class);

/* ── Becoming an order ───────────────────────────────────── */

it('turns an approved request into a purchase order', function () {
    $request = $this->requisitions->submit(ask());
    $this->requisitions->approve($request, $this->manager);

    $order = $this->requisitions->toOrder($request->fresh('lines.item'), $this->supplier, $this->manager);

    expect($order)->toBeInstanceOf(PurchaseOrder::class)
        ->and($order->lines)->toHaveCount(1)
        ->and((float) $order->lines[0]->qty)->toBe(4.0)
        ->and($request->fresh()->status)->toBe('ordered')
        ->and($request->fresh()->purchase_order_id)->toBe($order->id);
});

it('refuses to order from a request nobody approved', function () {
    $request = $this->requisitions->submit(ask());

    $this->requisitions->toOrder($request->fresh('lines.item'), $this->supplier, $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('refuses to order a request of things the catalogue does not carry', function () {
    // An order line has to name something the supplier can be asked for and the
    // store can receive against.
    $request = ask([['description' => 'حاجة غريبة', 'qty' => 2]]);
    $this->requisitions->submit($request);
    $this->requisitions->approve($request->fresh(), $this->manager);

    $this->requisitions->toOrder($request->fresh('lines.item'), $this->supplier, $this->manager);
})->throws(Illuminate\Validation\ValidationException::class);

it('carries only the catalogued lines onto the order', function () {
    $request = ask([
        ['item_id' => $this->item->id, 'qty' => 3],
        ['description' => 'حاجة غير مسجّلة', 'qty' => 1],
    ]);
    $this->requisitions->submit($request);
    $this->requisitions->approve($request->fresh(), $this->manager);

    $order = $this->requisitions->toOrder($request->fresh('lines.item'), $this->supplier, $this->manager);

    expect($order->lines)->toHaveCount(1)
        // Nothing is lost — what was asked for stays on the request.
        ->and($request->fresh()->lines)->toHaveCount(2);
});

/* ── Through the API ─────────────────────────────────────── */

it('lets a technician raise and send a request', function () {
    $id = actingAs($this->technician)
        ->postJson('/api/purchase-requests', [
            'reason' => 'نفدت',
            'priority' => 'high',
            'lines' => [['item_id' => $this->item->id, 'qty' => 2]],
        ])
        ->assertCreated()
        ->json('data.id');

    actingAs($this->technician)
        ->postJson("/api/purchase-requests/{$id}/submit")
        ->assertOk()
        ->assertJsonPath('data.status', 'submitted');
});

it('shows a technician only their own requests', function () {
    ask();
    ask(by: $this->manager);

    $response = actingAs($this->technician)->getJson('/api/purchase-requests')->assertOk();

    expect($response->json('data'))->toHaveCount(1);
});

it('shows a manager every request', function () {
    ask();
    ask(by: $this->manager);

    expect(actingAs($this->manager)->getJson('/api/purchase-requests')->json('data'))
        ->toHaveCount(2);
});

it('keeps a technician out of someone else’s request', function () {
    $other = ask(by: $this->manager);

    actingAs($this->technician)
        ->getJson("/api/purchase-requests/{$other->id}")
        ->assertForbidden();
});

it('keeps a technician from deciding', function () {
    $request = $this->requisitions->submit(ask());

    actingAs($this->technician)
        ->postJson("/api/purchase-requests/{$request->id}/decide", ['action' => 'approve'])
        ->assertForbidden();
});

it('requires a reason to refuse through the API', function () {
    $request = $this->requisitions->submit(ask());

    actingAs($this->manager)
        ->postJson("/api/purchase-requests/{$request->id}/decide", ['action' => 'reject'])
        ->assertStatus(422);
});

it('walks a request to an order through the API', function () {
    $request = $this->requisitions->submit(ask());

    actingAs($this->manager)
        ->postJson("/api/purchase-requests/{$request->id}/decide", ['action' => 'approve'])
        ->assertOk();

    actingAs($this->manager)
        ->postJson("/api/purchase-requests/{$request->id}/order", [
            'supplier_id' => $this->supplier->id,
        ])
        ->assertCreated();

    expect($request->fresh()->status)->toBe('ordered');
});

it('counts what is waiting on a decision', function () {
    $this->requisitions->submit(ask());
    ask();

    expect(actingAs($this->manager)->getJson('/api/purchase-requests')->json('meta.awaiting'))
        ->toBe(1);
});

it('flags the lines that cannot become order lines', function () {
    // So the manager can see it before approving, not after.
    $request = ask([
        ['item_id' => $this->item->id, 'qty' => 1],
        ['description' => 'غير مسجّل', 'qty' => 1],
    ]);

    $response = actingAs($this->technician)
        ->getJson("/api/purchase-requests/{$request->id}")
        ->assertOk();

    expect($response->json('data.lines.0.in_catalogue'))->toBeTrue()
        ->and($response->json('data.lines.1.in_catalogue'))->toBeFalse();
});

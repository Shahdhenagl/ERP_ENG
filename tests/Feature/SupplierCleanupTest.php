<?php

use App\Models\Item;
use App\Models\PurchaseReturn;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use function Pest\Laravel\actingAs;

const CLEANUP_CONFIRMATION = 'DELETE-TEST-SUPPLIER-SP-0001';

function seedExperimentalSupplierFixture(): void
{
    Supplier::forceCreate([
        'id' => 1,
        'code' => 'SP-0001',
        'name' => 'احمد',
        'is_active' => true,
    ]);

    $cashBoxId = DB::table('cash_boxes')->insertGetId([
        'name' => 'Test cash box',
        'type' => 'cash',
        'currency' => 'EGP',
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $item = Item::factory()->create();
    $warehouse = Warehouse::main();

    foreach (range(1, 7) as $id) {
        SupplierInvoice::forceCreate([
            'id' => $id,
            'code' => sprintf('SB-2026-%04d', $id),
            'supplier_id' => 1,
            'invoice_date' => '2026-07-29',
            'subtotal' => 100,
            'discount' => 0,
            'tax_rate' => 0,
            'tax_amount' => 0,
            'total' => 100,
            'currency' => 'EGP',
            'status' => 'draft',
        ]);

        DB::table('supplier_invoice_lines')->insert([
            'supplier_invoice_id' => $id,
            'item_id' => $item->id,
            'description' => 'test fixture',
            'qty' => 1,
            'unit_price' => 100,
            'line_total' => 100,
            'sort' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    foreach (range(1, 6) as $id) {
        DB::table('supplier_invoices')->where('id', $id)->update([
            'status' => $id <= 4 ? 'void' : 'posted',
        ]);
    }

    foreach (range(1, 7) as $id) {
        SupplierPayment::forceCreate([
            'id' => $id,
            'code' => sprintf('PV-2026-%04d', $id),
            'supplier_id' => 1,
            'supplier_invoice_id' => $id === 6 ? 2 : ($id === 7 ? 5 : null),
            'cash_box_id' => $cashBoxId,
            'amount' => 100,
            'method' => 'cash',
            'paid_at' => '2026-07-29',
        ]);
    }

    PurchaseReturn::forceCreate([
        'id' => 1,
        'code' => 'PR-2026-0001',
        'supplier_id' => 1,
        'warehouse_id' => $warehouse->id,
        'return_date' => '2026-07-29',
        'reason' => 'test fixture',
        'status' => 'posted',
        'total' => 100,
    ]);

    DB::table('purchase_return_lines')->insert([
        'purchase_return_id' => 1,
        'item_id' => $item->id,
        'qty' => 1,
        'unit_cost' => 100,
        'line_total' => 100,
        'sort' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

it('purges only the audited experimental supplier fixture atomically', function () {
    seedExperimentalSupplierFixture();

    actingAs(User::factory()->admin()->create())
        ->postJson('/api/admin/cleanup/experimental-supplier', [
            'confirmation' => CLEANUP_CONFIRMATION,
        ])
        ->assertOk()
        ->assertJsonPath('deleted.supplier', 1)
        ->assertJsonPath('deleted.supplier_payments', 7)
        ->assertJsonPath('deleted.supplier_invoices', 7)
        ->assertJsonPath('deleted.supplier_invoice_lines', 7)
        ->assertJsonPath('deleted.purchase_returns', 1)
        ->assertJsonPath('deleted.purchase_return_lines', 1);

    expect(Supplier::withTrashed()->find(1))->toBeNull()
        ->and(SupplierPayment::withTrashed()->where('supplier_id', 1)->count())->toBe(0)
        ->and(SupplierInvoice::withTrashed()->where('supplier_id', 1)->count())->toBe(0)
        ->and(PurchaseReturn::withTrashed()->where('supplier_id', 1)->count())->toBe(0)
        ->and(DB::table('supplier_invoice_lines')->count())->toBe(0)
        ->and(DB::table('purchase_return_lines')->count())->toBe(0);
});

it('refuses the purge and leaves every record untouched when a treasury reference exists', function () {
    seedExperimentalSupplierFixture();
    DB::table('cash_movements')->insert([
        'cash_box_id' => DB::table('supplier_payments')->where('id', 1)->value('cash_box_id'),
        'direction' => 'out',
        'amount' => 100,
        'source' => 'supplier_payment',
        'supplier_payment_id' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    actingAs(User::factory()->admin()->create())
        ->postJson('/api/admin/cleanup/experimental-supplier', [
            'confirmation' => CLEANUP_CONFIRMATION,
        ])
        ->assertStatus(422)
        ->assertJsonPath('blocked.cash_movements', 1);

    expect(Supplier::withTrashed()->find(1))->not->toBeNull()
        ->and(SupplierPayment::withTrashed()->where('supplier_id', 1)->count())->toBe(7)
        ->and(SupplierInvoice::withTrashed()->where('supplier_id', 1)->count())->toBe(7)
        ->and(PurchaseReturn::withTrashed()->where('supplier_id', 1)->count())->toBe(1);
});

it('rejects an incorrect confirmation without touching the fixture', function () {
    seedExperimentalSupplierFixture();

    actingAs(User::factory()->admin()->create())
        ->postJson('/api/admin/cleanup/experimental-supplier', [
            'confirmation' => 'DELETE-SOMETHING-ELSE',
        ])
        ->assertStatus(422);

    expect(Supplier::withTrashed()->find(1))->not->toBeNull();
});

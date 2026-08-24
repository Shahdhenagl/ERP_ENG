<?php

use App\Models\Account;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\JournalEntry;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use App\Models\RecurringExpense;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * A treasurer keeps the boxes tidy: renaming and closing empty ones, and
 * correcting a receipt's details — while the main till, technicians' floats, and
 * any box with history are protected from deletion.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    // Open the main till first, so boxes created in the tests are separate from
    // it — otherwise the first cash box would itself resolve as the default.
    CashBox::default();
});

it('omits technician custody boxes from the general cash-box list', function () {
    $technician = User::factory()->technician()->create();
    $custody = CashBox::create([
        'name' => 'خزينة عهدة الفني',
        'type' => 'cash',
        'user_id' => $technician->id,
    ]);
    $companyBox = CashBox::create(['name' => 'حساب الشركة', 'type' => 'bank']);

    $ids = actingAs($this->manager)
        ->getJson('/api/treasury/boxes')
        ->assertOk()
        ->json('data.*.id');

    expect($ids)->toContain($companyBox->id)
        ->not->toContain($custody->id);
});

it('renames a cash box', function () {
    $box = CashBox::create(['name' => 'حساب قديم', 'type' => 'bank']);

    actingAs($this->manager)->putJson("/api/treasury/boxes/{$box->id}", [
        'name' => 'حساب البنك الأهلي', 'type' => 'bank', 'account_number' => '123',
    ])->assertOk();

    expect($box->fresh()->name)->toBe('حساب البنك الأهلي');
});

it('deletes an empty box', function () {
    $box = CashBox::create(['name' => 'خزينة فارغة', 'type' => 'cash']);

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$box->id}")->assertOk();

    expect(CashBox::find($box->id))->toBeNull();
});

it('deletes a box referenced only by an unpaid recurring expense template', function () {
    $box = CashBox::create(['name' => 'خزينة بقالب دوري', 'type' => 'bank']);
    $template = RecurringExpense::create([
        'name' => 'اشتراك بنكي',
        'amount' => 100,
        'category' => 'رسوم',
        'cash_box_id' => $box->id,
        'cycle_days' => 30,
        'start_on' => now()->toDateString(),
        'next_due_on' => now()->addMonth()->toDateString(),
        'is_active' => true,
    ]);

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$box->id}")->assertOk();

    expect(CashBox::find($box->id))->toBeNull()
        ->and($template->fresh()->cash_box_id)->toBeNull();
});

it('refuses to delete a box that has movement', function () {
    $box = CashBox::create(['name' => 'خزينة بها حركة', 'type' => 'cash']);
    CashMovement::create([
        'cash_box_id' => $box->id, 'direction' => 'in', 'amount' => 500, 'source' => 'opening',
    ]);

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$box->id}")->assertStatus(422);

    expect(CashBox::find($box->id))->not->toBeNull();
});

it('refuses to delete a box referenced by a supplier payment', function () {
    $box = CashBox::create(['name' => 'حساب مورد مرتبط', 'type' => 'bank']);
    $supplier = Supplier::create(['name' => 'مورد اختبار']);
    SupplierPayment::create([
        'supplier_id' => $supplier->id,
        'cash_box_id' => $box->id,
        'amount' => 250,
        'method' => 'cash',
        'paid_at' => now()->toDateString(),
    ]);

    actingAs($this->manager)
        ->deleteJson("/api/treasury/boxes/{$box->id}")
        ->assertStatus(422)
        ->assertJsonPath('errors.box.0', 'لا يمكن حذف هذه الخزينة لأنها مرتبطة بسندات مالية. قم بإيقافها بدلًا من حذفها.');

    expect(CashBox::find($box->id))->not->toBeNull();
});

it('archives a referenced box instead of deleting its financial history', function () {
    $box = CashBox::create(['name' => 'خزينة موقوفة', 'type' => 'cash']);
    CashMovement::create([
        'cash_box_id' => $box->id, 'direction' => 'out', 'amount' => 100, 'source' => 'expense',
    ]);

    actingAs($this->manager)
        ->putJson("/api/treasury/boxes/{$box->id}", [
            'name' => $box->name,
            'type' => $box->type,
            'is_active' => false,
        ])
        ->assertOk();

    expect($box->fresh()->is_active)->toBeFalse()
        ->and(CashMovement::where('cash_box_id', $box->id)->count())->toBe(1);
});

it('refuses to delete the main till', function () {
    $main = CashBox::default();

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$main->id}")->assertStatus(422);
});

it('refuses to touch a technician float from here', function () {
    $tech = User::factory()->technician()->create();
    $float = CashBox::create(['name' => 'عهدة فني', 'type' => 'cash', 'user_id' => $tech->id]);

    actingAs($this->manager)->deleteJson("/api/treasury/boxes/{$float->id}")->assertStatus(422);
    actingAs($this->manager)->putJson("/api/treasury/boxes/{$float->id}", [
        'name' => 'x', 'type' => 'cash',
    ])->assertStatus(422);
});

it('records an external deposit into a box as income', function () {
    $box = CashBox::default();
    $before = $box->balance();

    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => $box->id,
        'amount' => 1500,
        'party' => 'شركة النور',
        'transaction_date' => '2026-08-10',
        'payment_method' => 'bank_transfer',
        'note' => 'دفعة مقدمة',
    ])->assertCreated();

    // The money is in the box, and it is a receipt, not an expense.
    expect($box->fresh()->balance())->toBe(round($before + 1500, 2));

    $movement = CashMovement::where('source', 'external_deposit')->latest('id')->first();
    expect($movement)->not->toBeNull()
        ->and($movement->direction)->toBe('in')
        ->and($movement->category)->toBe('شركة النور')
        ->and($movement->transaction_date->toDateString())->toBe('2026-08-10')
        ->and($movement->payment_method)->toBe('bank_transfer')
        ->and((float) $movement->amount)->toBe(1500.0);
});

it('refuses an external deposit with no party named', function () {
    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => CashBox::default()->id,
        'amount' => 500,
    ])->assertStatus(422);
});

it('keeps external deposits off a technician', function () {
    $tech = User::factory()->technician()->create();

    actingAs($tech)->postJson('/api/treasury/deposit', [
        'cash_box_id' => CashBox::default()->id,
        'amount' => 500,
        'party' => 'جهة',
    ])->assertForbidden();
});

it('prints, edits and deletes an expense voucher', function () {
    $box = CashBox::default();
    // Fund the box so the expense has something to draw on.
    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => $box->id, 'amount' => 2000, 'party' => 'تمويل',
    ])->assertCreated();

    $expenseAccount = Account::query()
        ->where('type', 'expense')
        ->where('is_group', false)
        ->where('is_active', true)
        ->firstOrFail();

    actingAs($this->manager)->postJson('/api/treasury/expense', [
        'cash_box_id' => $box->id,
        'amount' => 300,
        'account_id' => $expenseAccount->id,
        'category' => 'وقود',
        'note' => 'بنزين',
    ])->assertCreated();

    $expense = CashMovement::where('source', 'expense')->latest('id')->first();

    // The voucher is visible in the daily journal under its document name and reference.
    actingAs($this->manager)->getJson('/api/accounting/entries?source=expense')
        ->assertOk()
        ->assertJsonPath('data.0.source_label', 'سند صرف')
        ->assertJsonPath('data.0.source_reference', "سند صرف #{$expense->id}");

    $journal = JournalEntry::where('sourceable_type', $expense->getMorphClass())
        ->where('sourceable_id', $expense->id)
        ->firstOrFail();
    expect($expense->account_id)->toBe($expenseAccount->id)
        ->and($expense->category)->toBe($expenseAccount->name)
        ->and($journal->source->value)->toBe('expense')
        ->and($journal->total)->toEqual('300.00')
        ->and($journal->lines()->where('account_id', $expenseAccount->id)->where('debit', 300)->exists())->toBeTrue();

    // Print: the voucher reads as a payment out.
    actingAs($this->manager)->getJson("/api/treasury/movements/{$expense->id}/voucher")
        ->assertOk()
        ->assertJsonPath('data.kind', 'payment')
        ->assertJsonPath('data.title', 'سند صرف');

    // Edit: the heading and note change, the money does not.
    actingAs($this->manager)->putJson("/api/treasury/movements/{$expense->id}", [
        'category' => 'صيانة سيارة', 'note' => 'تغيير زيت',
    ])->assertOk();
    expect($expense->fresh()->category)->toBe('صيانة سيارة');

    // Delete: the balance and the journal entry both come back out.
    expect($journal)->not->toBeNull();

    $before = $box->fresh()->balance();
    actingAs($this->manager)->deleteJson("/api/treasury/movements/{$expense->id}")->assertOk();

    expect(CashMovement::find($expense->id))->toBeNull()
        ->and(JournalEntry::find($journal->id))->toBeNull()
        ->and($box->fresh()->balance())->toBe(round($before + 300, 2));
});

it('records one transport custody expense against multiple active branches', function () {
    $box = CashBox::default();
    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => $box->id, 'amount' => 2000, 'party' => 'تمويل الاختبار',
    ])->assertCreated();

    $expenseAccount = Account::query()->where('code', '5204')->firstOrFail();
    $customer = Customer::factory()->create(['name' => 'شركة الفروع']);
    $first = $customer->branches()->create(['name' => 'فرع القاهرة']);
    $second = $customer->branches()->create(['name' => 'فرع الجيزة']);
    $before = $box->fresh()->balance();

    actingAs($this->manager)->postJson('/api/treasury/expense', [
        'cash_box_id' => $box->id,
        'amount' => 350,
        'transaction_date' => '2026-08-12',
        'payment_method' => 'instapay',
        'account_id' => $expenseAccount->id,
        'branch_ids' => [$first->id, $second->id],
        'note' => 'عهدة انتقالات للفروع',
    ])->assertCreated();

    $movement = CashMovement::where('source', 'expense')->latest('id')->firstOrFail();
    $journal = JournalEntry::where('sourceable_type', $movement->getMorphClass())
        ->where('sourceable_id', $movement->id)
        ->firstOrFail();

    expect($movement->branches()->pluck('branches.id')->all())->toBe([$first->id, $second->id])
        ->and($movement->account_id)->toBe($expenseAccount->id)
        ->and($movement->category)->toBe($expenseAccount->name)
        ->and($movement->transaction_date->toDateString())->toBe('2026-08-12')
        ->and($movement->payment_method)->toBe('instapay')
        ->and($journal->entry_date->toDateString())->toBe('2026-08-12')
        ->and($journal->total)->toEqual('350.00')
        ->and($box->fresh()->balance())->toBe(round($before - 350, 2));

    $movementRows = actingAs($this->manager)
        ->getJson('/api/treasury/movements')
        ->assertOk()
        ->json('data');
    $movementRow = collect($movementRows)->firstWhere('id', $movement->id);

    expect($movementRow['branches'][0]['name'])->toBe('فرع القاهرة')
        ->and($movementRow['branches'][1]['name'])->toBe('فرع الجيزة');

    actingAs($this->manager)->getJson("/api/treasury/movements/{$movement->id}/voucher")
        ->assertOk()
        ->assertJsonPath('data.branches.0.label', 'فرع القاهرة — شركة الفروع')
        ->assertJsonPath('data.branches.1.label', 'فرع الجيزة — شركة الفروع')
        ->assertJsonPath('data.date', '2026-08-12')
        ->assertJsonPath('data.payment_method_label', 'إنستا باي');


    $statementRows = actingAs($this->manager)
        ->getJson("/api/treasury/boxes/{$box->id}/statement")
        ->assertOk()
        ->json('data.rows');
    $statementRow = collect($statementRows)->firstWhere('id', $movement->id);

    expect($statementRow['branches'][0]['name'])->toBe('فرع القاهرة')
        ->and($statementRow['branches'][1]['name'])->toBe('فرع الجيزة');
});

it('rejects inactive branches for a transport custody expense without creating a movement', function () {
    $box = CashBox::default();
    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => $box->id, 'amount' => 1000, 'party' => 'تمويل الاختبار',
    ])->assertCreated();

    $expenseAccount = Account::query()->where('code', '5204')->firstOrFail();
    $customer = Customer::factory()->create();
    $branch = $customer->branches()->create(['name' => 'فرع موقوف', 'is_active' => false]);
    $before = CashMovement::where('source', 'expense')->count();

    actingAs($this->manager)->postJson('/api/treasury/expense', [
        'cash_box_id' => $box->id,
        'amount' => 100,
        'account_id' => $expenseAccount->id,
        'branch_ids' => [$branch->id],
    ])->assertStatus(422)
        ->assertJsonPath('errors.branch_ids.0', 'كل الفروع المختارة يجب أن تكون موجودة ونشطة.');

    expect(CashMovement::where('source', 'expense')->count())->toBe($before);
});

it('keeps ordinary expenses independent from branch links', function () {
    $box = CashBox::default();
    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => $box->id, 'amount' => 1000, 'party' => 'تمويل الاختبار',
    ])->assertCreated();

    $expenseAccount = Account::query()
        ->where('type', 'expense')
        ->where('code', '!=', '5204')
        ->where('is_group', false)
        ->where('is_active', true)
        ->firstOrFail();
    $customer = Customer::factory()->create();
    $branch = $customer->branches()->create(['name' => 'فرع غير مرتبط']);

    actingAs($this->manager)->postJson('/api/treasury/expense', [
        'cash_box_id' => $box->id,
        'amount' => 100,
        'account_id' => $expenseAccount->id,
        'branch_ids' => [$branch->id],
    ])->assertStatus(422)
        ->assertJsonPath('errors.branch_ids.0', 'يمكن ربط الفروع ببند عهدة الانتقالات فقط.');
});

it('deletes an external deposit voucher and takes the money back out', function () {
    $box = CashBox::default();
    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => $box->id, 'amount' => 1000, 'party' => 'جهة',
    ])->assertCreated();

    $deposit = CashMovement::where('source', 'external_deposit')->latest('id')->first();
    $before = $box->fresh()->balance();

    actingAs($this->manager)->getJson("/api/treasury/movements/{$deposit->id}/voucher")
        ->assertOk()->assertJsonPath('data.kind', 'receipt');

    actingAs($this->manager)->deleteJson("/api/treasury/movements/{$deposit->id}")->assertOk();

    expect($box->fresh()->balance())->toBe(round($before - 1000, 2));
});

it('refuses to delete a manual voucher after its cash movement is reconciled', function () {
    $box = CashBox::default();
    actingAs($this->manager)->postJson('/api/treasury/deposit', [
        'cash_box_id' => $box->id, 'amount' => 500, 'party' => 'تمويل',
    ])->assertCreated();
    $expenseAccount = Account::query()
        ->where('type', 'expense')
        ->where('is_group', false)
        ->where('is_active', true)
        ->firstOrFail();

    actingAs($this->manager)->postJson('/api/treasury/expense', [
        'cash_box_id' => $box->id,
        'amount' => 100,
        'account_id' => $expenseAccount->id,
        'category' => 'وقود',
    ])->assertCreated();

    $expense = CashMovement::where('source', 'expense')->latest('id')->firstOrFail();
    $expense->update(['reconciled_at' => now()]);

    actingAs($this->manager)->deleteJson("/api/treasury/movements/{$expense->id}")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('movement');

    expect(CashMovement::find($expense->id))->not->toBeNull();
});

it('will not touch a customer receipt as a manual voucher', function () {
    $customer = Customer::factory()->create();
    actingAs($this->manager)->postJson('/api/payments', [
        'customer_id' => $customer->id, 'amount' => 500, 'method' => 'cash',
    ])->assertCreated();

    $receipt = CashMovement::where('source', 'payment')->latest('id')->first();

    // A customer receipt is undone from its own screen, not here.
    actingAs($this->manager)->getJson("/api/treasury/movements/{$receipt->id}/voucher")->assertNotFound();
    actingAs($this->manager)->deleteJson("/api/treasury/movements/{$receipt->id}")->assertNotFound();
});

it('corrects a receipt without moving the money', function () {
    $customer = Customer::factory()->create();
    $id = actingAs($this->manager)->postJson('/api/payments', [
        'customer_id' => $customer->id, 'amount' => 700, 'method' => 'cash',
    ])->assertCreated()->json('id');

    $before = CashBox::default()->balance();

    actingAs($this->manager)->putJson("/api/payments/{$id}", [
        'method' => 'instapay', 'note' => 'تصحيح الطريقة',
    ])->assertOk()->assertJsonPath('method_label', 'إنستاباي');

    // The metadata changed; the balance did not.
    expect(CashBox::default()->fresh()->balance())->toBe(round($before, 2));
});

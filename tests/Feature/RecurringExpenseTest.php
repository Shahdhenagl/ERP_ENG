<?php

use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\RecurringExpense;
use App\Models\RecurringExpenseItem;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The fixed bills that come round on a cycle: recorded as templates, reminded
 * three days before they fall due, and paid through the ordinary treasury so
 * the money runs through the one ledger — then the schedule rolls forward.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    // A funded till so a payment has something to draw on.
    CashMovement::create([
        'cash_box_id' => CashBox::default()->id,
        'direction' => 'in', 'amount' => 50000, 'source' => 'opening',
    ]);
});

it('opens a recurring expense with its first due date', function () {
    $data = actingAs($this->manager)->postJson('/api/recurring-expenses', [
        'name' => 'إيجار المقر',
        'amount' => 8000,
        'category' => 'إيجارات',
        'cycle_days' => 30,
        'start_on' => now()->addDays(10)->toDateString(),
    ])->assertCreated()->json('data');

    expect($data['next_due_on'])->toBe(now()->addDays(10)->toDateString())
        ->and($data['is_due_soon'])->toBeFalse();
});

it('saves selected and newly added checklist items on a recurring expense', function () {
    $existing = RecurringExpenseItem::create([
        'label' => 'إيجار',
        'created_by' => $this->manager->id,
    ]);

    $data = actingAs($this->manager)->postJson('/api/recurring-expenses', [
        'name' => 'مصروفات مخزن',
        'amount' => 2500,
        'cycle_days' => 30,
        'start_on' => now()->toDateString(),
        'item_ids' => [$existing->id],
        'new_item_labels' => ['نظافة شهرية'],
    ])->assertCreated()->json('data');

    expect(collect($data['items'])->pluck('label')->all())
        ->toContain('إيجار', 'نظافة شهرية');

    $newItem = RecurringExpenseItem::where('label', 'نظافة شهرية')->firstOrFail();

    $this->assertDatabaseHas('recurring_expense_item_links', [
        'recurring_expense_id' => $data['id'],
        'recurring_expense_item_id' => $existing->id,
    ])->assertDatabaseHas('recurring_expense_item_links', [
        'recurring_expense_id' => $data['id'],
        'recurring_expense_item_id' => $newItem->id,
    ]);

    actingAs($this->manager)->getJson('/api/recurring-expense-items')
        ->assertOk()
        ->assertJsonFragment(['label' => 'إيجار'])
        ->assertJsonFragment(['label' => 'نظافة شهرية']);
});

it('updates the checklist without duplicating a reused item', function () {
    $item = RecurringExpenseItem::create([
        'label' => 'إنترنت',
        'created_by' => $this->manager->id,
    ]);
    $expense = RecurringExpense::create([
        'name' => 'خدمات المكتب', 'amount' => 900, 'cycle_days' => 30,
        'start_on' => now()->toDateString(), 'next_due_on' => now()->toDateString(),
    ]);

    actingAs($this->manager)->putJson("/api/recurring-expenses/{$expense->id}", [
        'name' => $expense->name,
        'amount' => $expense->amount,
        'cycle_days' => $expense->cycle_days,
        'start_on' => $expense->start_on->toDateString(),
        'item_ids' => [$item->id],
        'new_item_labels' => ['إنترنت'],
    ])->assertOk()->assertJsonCount(1, 'data.items');

    expect($expense->fresh()->items()->pluck('label')->all())->toBe(['إنترنت'])
        ->and(RecurringExpenseItem::where('label', 'إنترنت')->count())->toBe(1);
});

it('pays a due expense and rolls the schedule forward one cycle', function () {
    $expense = RecurringExpense::create([
        'name' => 'اشتراك إنترنت', 'amount' => 1200, 'cycle_days' => 30,
        'start_on' => now()->toDateString(), 'next_due_on' => now()->toDateString(),
    ]);

    $before = CashBox::default()->balance();

    actingAs($this->manager)->postJson("/api/recurring-expenses/{$expense->id}/pay")
        ->assertOk()
        ->assertJsonPath('data.next_due_on', now()->addDays(30)->toDateString());

    // Real money left the till, and the schedule moved on.
    expect(CashBox::default()->fresh()->balance())->toBe(round($before - 1200, 2))
        ->and($expense->fresh()->last_paid_on->toDateString())->toBe(now()->toDateString());
});

it('reminds on the alerts board three days before a bill is due', function () {
    RecurringExpense::create([
        'name' => 'رخصة برنامج', 'amount' => 500, 'cycle_days' => 365,
        'start_on' => now()->addDays(2)->toDateString(),
        'next_due_on' => now()->addDays(2)->toDateString(),
    ]);

    $finance = collect(
        actingAs($this->manager)->getJson('/api/alerts')->assertOk()->json('data.groups'),
    )->firstWhere('key', 'finance');

    expect($finance)->not->toBeNull()
        ->and(collect($finance['items'])->pluck('title'))->toContain('مصروف دوري مستحق');
});

it('leaves a bill well ahead of its due date off the reminder', function () {
    RecurringExpense::create([
        'name' => 'تأمين', 'amount' => 500, 'cycle_days' => 365,
        'start_on' => now()->addDays(20)->toDateString(),
        'next_due_on' => now()->addDays(20)->toDateString(),
    ]);

    $groups = collect(
        actingAs($this->manager)->getJson('/api/alerts')->assertOk()->json('data.groups'),
    );

    expect($groups->firstWhere('key', 'finance'))->toBeNull();
});

it('keeps recurring expenses off a technician', function () {
    actingAs(User::factory()->technician()->create())
        ->getJson('/api/recurring-expenses')
        ->assertForbidden();
});

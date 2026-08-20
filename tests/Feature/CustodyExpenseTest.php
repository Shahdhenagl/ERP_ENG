<?php

use App\Enums\TaskStatus;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use App\Services\CustodyService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

use function Pest\Laravel\actingAs;

/**
 * A technician's float, self-served from the app: they see the balance, log an
 * expense with a receipt photo, and it lands in the same custody account a
 * manager reviews — no inventory-management permission required.
 */
beforeEach(function () {
    Storage::fake('public');

    $this->custody = app(CustodyService::class);
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();

    // Fund the main box, then advance the technician a 1,000 float.
    CashMovement::create([
        'cash_box_id' => CashBox::default()->id,
        'direction' => 'in', 'amount' => 10000, 'source' => 'opening',
    ]);
    $this->custody->advanceCash($this->technician, 1000, CashBox::default(), $this->manager);
});

it('shows the technician their own balance', function () {
    actingAs($this->technician)
        ->getJson('/api/custody/mine')
        ->assertOk()
        ->assertJsonPath('data.cash.balance', 1000);
});

it('logs an expense with a receipt and takes it off the balance', function () {
    actingAs($this->technician)
        ->post('/api/custody/mine/spend', [
            'amount' => 250,
            'category' => 'وقود',
            'note' => 'بنزين للسيارة',
            'receipt' => UploadedFile::fake()->create('receipt.jpg', 10, 'image/jpeg'),
        ])
        ->assertCreated()
        ->assertJsonPath('data.cash.balance', 750);

    $expense = CashMovement::where('source', 'expense')->first();

    expect($expense->category)->toBe('وقود')
        ->and($expense->receipt_path)->not->toBeNull();

    Storage::disk('public')->assertExists($expense->receipt_path);
});

it('allows an expense larger than the float, owing the technician the rest', function () {
    // Overspend is deliberate now: the technician fronts the money and the
    // company owes the difference, so this is accepted, not refused.
    actingAs($this->technician)
        ->postJson('/api/custody/mine/spend', ['amount' => 5000])
        ->assertCreated();

    expect($this->custody->shortfallFor($this->technician))->toBe(4000.0);
});

it('serves the expense back with a receipt url', function () {
    actingAs($this->technician)->post('/api/custody/mine/spend', [
        'amount' => 100, 'category' => 'مواصلات',
        'receipt' => UploadedFile::fake()->create('r.jpg', 10, 'image/jpeg'),
    ])->assertCreated();

    $expenses = actingAs($this->technician)->getJson('/api/custody/mine')->json('data.expenses');

    expect($expenses)->toHaveCount(1)
        ->and($expenses[0]['category'])->toBe('مواصلات')
        ->and($expenses[0]['receipt_url'])->not->toBeNull();
});

it('lets the manager see the technician expenses on the statement', function () {
    actingAs($this->technician)->postJson('/api/custody/mine/spend', [
        'amount' => 120, 'category' => 'قطع غيار',
    ])->assertCreated();

    $data = actingAs($this->manager)
        ->getJson("/api/custody/{$this->technician->id}")
        ->assertOk()
        ->json('data');

    expect($data['expenses'])->toHaveCount(1)
        ->and($data['expenses'][0]['category'])->toBe('قطع غيار')
        ->and($data['expenses'][0]['amount'])->toEqual(120);
});

it('narrows the statement expenses to a chosen month', function () {
    // One expense this month, one dated to a past month.
    actingAs($this->technician)->postJson('/api/custody/mine/spend', [
        'amount' => 100, 'category' => 'وقود',
    ])->assertCreated();
    actingAs($this->technician)->postJson('/api/custody/mine/spend', [
        'amount' => 200, 'category' => 'مبيت',
    ])->assertCreated();

    $old = CashMovement::where('source', 'expense')->where('amount', 200)->first();
    $old->forceFill(['created_at' => '2026-03-15 10:00:00'])->save();

    // Filtering to March shows only the old one.
    $march = actingAs($this->manager)
        ->getJson("/api/custody/{$this->technician->id}?month=2026-03")
        ->assertOk()
        ->json('data.expenses');

    expect($march)->toHaveCount(1)
        ->and($march[0]['category'])->toBe('مبيت');

    // With no month, both show.
    $all = actingAs($this->manager)
        ->getJson("/api/custody/{$this->technician->id}")
        ->json('data.expenses');

    expect($all)->toHaveCount(2);
});

/* ── Overspend, task expenses, settle and waive ──────────── */

it('lets a technician spend past their float, dropping it negative', function () {
    // Float is 1,000; spending 1,500 leaves it at -500 owed to them.
    actingAs($this->technician)->postJson('/api/custody/mine/spend', ['amount' => 1500])
        ->assertCreated();

    $data = actingAs($this->technician)->getJson('/api/custody/mine')->assertOk()->json('data');

    expect($data['cash']['balance'])->toEqual(-500)
        ->and($data['shortfall'])->toEqual(500);
});

it('bills an expense to a job and shows it on that task', function () {
    $task = Task::factory()->create(['status' => TaskStatus::InProgress]);
    $task->technicians()->attach($this->technician);

    actingAs($this->technician)->post('/api/custody/mine/spend', [
        'amount' => 100, 'category' => 'وقود', 'note' => 'بنزين الطريق', 'task_id' => $task->id,
    ])->assertCreated();

    $data = actingAs($this->manager)->getJson("/api/tasks/{$task->id}")->assertOk()->json('data');

    expect($data['expenses_total'])->toEqual(100)
        ->and($data['expenses'][0]['note'])->toBe('بنزين الطريق');
});

it('includes the task customer and branch on custody expense rows', function () {
    $customer = Customer::factory()->create(['name' => 'شركة الأفق الهندسية']);
    $branch = Branch::create([
        'customer_id' => $customer->id,
        'name' => 'فرع التجمع',
        'created_by' => $this->manager->id,
    ]);
    $task = Task::create([
        'customer_id' => $customer->id,
        'branch_id' => $branch->id,
        'created_by' => $this->manager->id,
        'title' => 'زيارة فرع التجمع',
        'status' => TaskStatus::InProgress,
    ]);
    $task->technicians()->attach($this->technician);

    actingAs($this->technician)->postJson('/api/custody/mine/spend', [
        'amount' => 150, 'category' => 'مواصلات', 'task_id' => $task->id,
    ])->assertCreated()
        ->assertJsonPath('data.expenses.0.customer', 'شركة الأفق الهندسية')
        ->assertJsonPath('data.expenses.0.branch', 'فرع التجمع');

    actingAs($this->manager)->getJson("/api/custody/{$this->technician->id}")
        ->assertOk()
        ->assertJsonPath('data.expenses.0.customer', 'شركة الأفق الهندسية')
        ->assertJsonPath('data.expenses.0.branch', 'فرع التجمع');
});

it('refuses to bill a job that is not the technician\'s', function () {
    $otherTechnician = User::factory()->technician()->create();
    $other = Task::factory()->create(['status' => TaskStatus::InProgress]);
    $other->technicians()->attach($otherTechnician);

    actingAs($this->technician)->postJson('/api/custody/mine/spend', [
        'amount' => 50, 'task_id' => $other->id,
    ])->assertForbidden();
});

it('settles a shortfall by paying the technician from a company box', function () {
    $this->custody->spendFromCustody($this->technician, 1500, $this->manager);   // float -500
    $boxBefore = CashBox::default()->fresh()->balance();

    actingAs($this->manager)->postJson('/api/custody/settle', [
        'user_id' => $this->technician->id, 'cash_box_id' => CashBox::default()->id,
    ])->assertOk();

    expect($this->custody->shortfallFor($this->technician))->toBe(0.0)
        // Real money left the company box to reimburse them.
        ->and(CashBox::default()->fresh()->balance())->toBe(round($boxBefore - 500, 2));
});

it('waives a shortfall without paying, leaving the company box untouched', function () {
    $this->custody->spendFromCustody($this->technician, 1500, $this->manager);   // float -500
    $boxBefore = CashBox::default()->fresh()->balance();

    actingAs($this->manager)->postJson('/api/custody/waive', ['user_id' => $this->technician->id])
        ->assertOk();

    expect($this->custody->shortfallFor($this->technician))->toBe(0.0)
        ->and(CashBox::default()->fresh()->balance())->toBe($boxBefore);
});

it('keeps a technician out of another technician custody', function () {
    // The self endpoints are scoped to the caller; the manager endpoints stay
    // behind inventory.manage, which a technician does not have.
    actingAs($this->technician)->getJson("/api/custody/{$this->technician->id}")->assertForbidden();
});

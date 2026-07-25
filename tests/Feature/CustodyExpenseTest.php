<?php

use App\Models\CashBox;
use App\Models\CashMovement;
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
            'receipt' => UploadedFile::fake()->image('receipt.jpg'),
        ])
        ->assertCreated()
        ->assertJsonPath('data.cash.balance', 750);

    $expense = CashMovement::where('source', 'expense')->first();

    expect($expense->category)->toBe('وقود')
        ->and($expense->receipt_path)->not->toBeNull();

    Storage::disk('public')->assertExists($expense->receipt_path);
});

it('refuses an expense larger than the float', function () {
    actingAs($this->technician)
        ->postJson('/api/custody/mine/spend', ['amount' => 5000])
        ->assertStatus(422);
});

it('serves the expense back with a receipt url', function () {
    actingAs($this->technician)->post('/api/custody/mine/spend', [
        'amount' => 100, 'category' => 'مواصلات',
        'receipt' => UploadedFile::fake()->image('r.jpg'),
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

it('keeps a technician out of another technician custody', function () {
    // The self endpoints are scoped to the caller; the manager endpoints stay
    // behind inventory.manage, which a technician does not have.
    actingAs($this->technician)->getJson("/api/custody/{$this->technician->id}")->assertForbidden();
});

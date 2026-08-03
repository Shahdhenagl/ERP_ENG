<?php

use App\Models\TechnicianMonthlyReport;
use App\Models\User;

/**
 * A record of a handover, and nothing else. It moves no money, settles no
 * custody and touches no payslip — the month owes exactly what it owed before
 * the row existed.
 */
beforeEach(function () {
    $this->admin = User::factory()->create(['role' => 'admin']);
    $this->actingAs($this->admin);
});

it('lists every technician for the month, handed in or not', function () {
    $handed = User::factory()->create(['role' => 'technician', 'name' => 'محمود']);
    User::factory()->create(['role' => 'technician', 'name' => 'أحمد']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $handed->id,
        'period' => '2026-08',
    ])->assertCreated();

    $response = $this->getJson('/api/technician-reports?period=2026-08')->assertOk();

    // A list of only those who handed in answers the wrong question. The one
    // being asked at the start of a month is who has not.
    expect($response->json('data'))->toHaveCount(2)
        ->and($response->json('meta.received'))->toBe(1)
        ->and($response->json('meta.total'))->toBe(2);

    $rows = collect($response->json('data'));

    expect($rows->firstWhere('technician', 'محمود')['report'])->not->toBeNull()
        ->and($rows->firstWhere('technician', 'أحمد')['report'])->toBeNull();
});

it('names whoever took the paperwork', function () {
    $technician = User::factory()->create(['role' => 'technician']);
    $clerk = User::factory()->create(['role' => 'manager', 'name' => 'سلمى']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'received_by_user_id' => $clerk->id,
        'received_on' => '2026-09-02',
        'notes' => 'التقرير ناقص يوم واحد.',
    ])->assertCreated();

    $row = collect($this->getJson('/api/technician-reports?period=2026-08')->json('data'))
        ->firstWhere('technician_id', $technician->id);

    expect($row['report']['received_by'])->toBe('سلمى')
        ->and($row['report']['received_on'])->toBe('2026-09-02')
        ->and($row['report']['notes'])->toBe('التقرير ناقص يوم واحد.');
});

it('corrects a month rather than filing it twice', function () {
    $technician = User::factory()->create(['role' => 'technician']);
    $first = User::factory()->create(['role' => 'manager', 'name' => 'سلمى']);
    $second = User::factory()->create(['role' => 'manager', 'name' => 'كريم']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'received_by_user_id' => $first->id,
    ])->assertCreated();

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => '2026-08',
        'received_by_user_id' => $second->id,
    ])->assertOk();

    $reports = TechnicianMonthlyReport::where('technician_id', $technician->id)->get();

    expect($reports)->toHaveCount(1)
        ->and($reports->first()->receiver->name)->toBe('كريم');
});

it('defaults the month to this one', function () {
    $technician = User::factory()->create(['role' => 'technician']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => now()->format('Y-m'),
    ])->assertCreated();

    expect($this->getJson('/api/technician-reports')->json('meta.period'))
        ->toBe(now()->format('Y-m'));
});

it('refuses a month that is not a month', function () {
    $technician = User::factory()->create(['role' => 'technician']);

    $this->postJson('/api/technician-reports', [
        'technician_id' => $technician->id,
        'period' => 'أغسطس',
    ])->assertStatus(422)->assertJsonValidationErrors('period');
});

it('keeps the record away from anyone who does not manage people', function () {
    $this->actingAs(User::factory()->create(['role' => 'manager', 'position' => 'storekeeper']));

    $this->getJson('/api/technician-reports')->assertForbidden();
    $this->postJson('/api/technician-reports', [
        'technician_id' => $this->admin->id,
        'period' => '2026-08',
    ])->assertForbidden();
});

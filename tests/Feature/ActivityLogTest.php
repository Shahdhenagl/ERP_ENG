<?php

use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\User;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
});

/* ── Reading an action back ──────────────────────────────── */

it('reads an action as its module and its verb', function () {
    $log = ActivityLog::record('invoice.issued', null, 'إصدار');

    expect($log->moduleLabel())->toBe('الفواتير')
        ->and($log->verbLabel())->toBe('إصدار')
        ->and($log->label())->toBe('الفواتير · إصدار');
});

it('handles a module whose name contains an underscore', function () {
    // `supplier_invoice.posted` must split on the last dot, not the first.
    $log = ActivityLog::record('supplier_invoice.posted');

    expect($log->module())->toBe('supplier_invoice')
        ->and($log->label())->toBe('فواتير الموردين · ترحيل');
});

it('falls back to the raw action rather than showing nothing', function () {
    // Ugly, but honest, and never wrong — which is what a log owes its reader.
    $log = ActivityLog::record('something.unheard_of');

    expect($log->label())->toBe('something · unheard_of');
});

it('shows a verbless action as itself', function () {
    $log = ActivityLog::record('backfill');

    expect($log->label())->toBe('backfill');
});

/* ── The events an audit log exists for ──────────────────── */

it('records a refused login', function () {
    $user = User::factory()->create(['email' => 'someone@cityeng.local']);

    postJson('/api/login', [
        'email' => $user->email,
        'password' => 'wrong-password',
    ])->assertStatus(422);

    $log = ActivityLog::where('action', 'auth.failed')->first();

    expect($log)->not->toBeNull()
        ->and($log->description)->toContain('someone@cityeng.local');
});

it('records an attempt on an unknown address without inventing a user', function () {
    postJson('/api/login', [
        'email' => 'nobody@example.com',
        'password' => 'guess',
    ])->assertStatus(422);

    $log = ActivityLog::where('action', 'auth.failed')->first();

    expect($log)->not->toBeNull()
        ->and($log->subject_id)->toBeNull();
});

it('records an attempt to use a suspended account', function () {
    $user = User::factory()->create(['is_active' => false, 'password' => 'password']);

    postJson('/api/login', ['email' => $user->email, 'password' => 'password'])
        ->assertStatus(422);

    expect(ActivityLog::where('action', 'auth.blocked')->exists())->toBeTrue();
});

it('records a successful login too', function () {
    $user = User::factory()->create(['password' => 'password']);

    postJson('/api/login', ['email' => $user->email, 'password' => 'password'])->assertOk();

    expect(ActivityLog::where('action', 'auth.login')->exists())->toBeTrue();
});

it('flags the entries someone reviewing the log came to find', function () {
    ActivityLog::record('auth.failed');
    ActivityLog::record('customer.created');

    expect(ActivityLog::where('action', 'auth.failed')->first()->isSensitive())->toBeTrue()
        ->and(ActivityLog::where('action', 'customer.created')->first()->isSensitive())->toBeFalse();
});

/* ── Filtering ───────────────────────────────────────────── */

it('narrows to one module across all its verbs', function () {
    ActivityLog::record('invoice.issued');
    ActivityLog::record('invoice.voided');
    ActivityLog::record('customer.created');

    expect(ActivityLog::query()->forModule('invoice')->count())->toBe(2);
});

it('does not let one module swallow another with a similar name', function () {
    // `supplier` must not match `supplier_invoice.posted`.
    ActivityLog::record('supplier.created');
    ActivityLog::record('supplier_invoice.posted');

    expect(ActivityLog::query()->forModule('supplier')->count())->toBe(1);
});

it('searches the description, the actor and the address', function () {
    actingAs($this->manager);
    ActivityLog::record('customer.created', null, 'تم إنشاء العميل بنك القاهرة');
    ActivityLog::record('customer.created', null, 'تم إنشاء العميل مصنع الدلتا');

    expect(ActivityLog::query()->search('بنك')->count())->toBe(1)
        ->and(ActivityLog::query()->search($this->manager->name)->count())->toBe(2);
});

/* ── Through the API ─────────────────────────────────────── */

it('serves the trail to an admin, newest first', function () {
    actingAs($this->admin);
    ActivityLog::record('customer.created', null, 'الأقدم');
    ActivityLog::record('invoice.issued', null, 'الأحدث');

    $response = actingAs($this->admin)->getJson('/api/activity')->assertOk();

    expect($response->json('data.0.description'))->toBe('الأحدث')
        ->and($response->json('data.0.label'))->toBe('الفواتير · إصدار')
        ->and($response->json('data.0.user'))->toBe($this->admin->name);
});

it('filters the trail by module through the API', function () {
    ActivityLog::record('invoice.issued');
    ActivityLog::record('customer.created');

    $response = actingAs($this->admin)->getJson('/api/activity?module=invoice')->assertOk();

    expect($response->json('data'))->toHaveCount(1);
});

it('filters to the sensitive entries only', function () {
    ActivityLog::record('auth.failed');
    ActivityLog::record('customer.created');
    ActivityLog::record('settings.updated');

    $response = actingAs($this->admin)->getJson('/api/activity?sensitive=1')->assertOk();

    expect($response->json('data'))->toHaveCount(2);
});

it('bounds the trail by date', function () {
    $old = ActivityLog::record('customer.created', null, 'قديم');
    ActivityLog::where('id', $old->id)->update(['created_at' => now()->subMonths(3)]);
    ActivityLog::record('customer.created', null, 'حديث');

    $response = actingAs($this->admin)
        ->getJson('/api/activity?from='.now()->startOfMonth()->toDateString())
        ->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('data.0.description'))->toBe('حديث');
});

it('offers only the modules that have actually been recorded', function () {
    // A dropdown listing twenty modules that produced nothing is a list of
    // dead ends.
    ActivityLog::record('invoice.issued');
    ActivityLog::record('customer.created');

    $response = actingAs($this->admin)->getJson('/api/activity/filters')->assertOk();

    expect($response->json('modules'))->toHaveCount(2)
        ->and(collect($response->json('modules'))->pluck('value')->all())
        ->toContain('invoice', 'customer');
});

it('counts the sensitive entries for the filter chip', function () {
    ActivityLog::record('auth.failed');
    ActivityLog::record('auth.failed');
    ActivityLog::record('customer.created');

    expect(actingAs($this->admin)->getJson('/api/activity/filters')->json('sensitive_count'))
        ->toBe(2);
});

it('records who did it, from where', function () {
    actingAs($this->admin)
        ->postJson('/api/customers', ['name' => 'عميل جديد', 'phone' => '01000000000'])
        ->assertCreated();

    $log = ActivityLog::where('action', 'customer.created')->first();

    expect($log->user_id)->toBe($this->admin->id)
        ->and($log->ip_address)->not->toBeNull()
        ->and($log->subject_type)->toBe(Customer::class);
});

/* ── Who may read it ─────────────────────────────────────── */

it('keeps the trail to the system administrator', function () {
    // Who did what is the administrator's question. A manager reading it could
    // audit the person auditing them.
    actingAs($this->manager)->getJson('/api/activity')->assertForbidden();
    actingAs($this->technician)->getJson('/api/activity')->assertForbidden();
    actingAs($this->manager)->getJson('/api/activity/filters')->assertForbidden();
});

it('offers no way to write or erase the trail', function () {
    // A log with a delete button is a log whose absence proves nothing.
    // 405 where the path exists under another verb, 404 where it does not —
    // what matters is that neither is a way in.
    $existing = ActivityLog::record('customer.created');

    actingAs($this->admin)->postJson('/api/activity', [])->assertStatus(405);
    actingAs($this->admin)->putJson("/api/activity/{$existing->id}", [])->assertNotFound();
    actingAs($this->admin)->deleteJson("/api/activity/{$existing->id}")->assertNotFound();

    expect(ActivityLog::find($existing->id))->not->toBeNull();
});

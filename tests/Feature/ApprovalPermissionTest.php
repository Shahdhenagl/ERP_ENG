<?php

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Quotation;
use App\Models\User;
use App\Models\UserPermission;
use App\Services\PermissionRegistry;

use function Pest\Laravel\actingAs;

/**
 * The point of splitting approval out of the module permission: someone can be
 * given the work and denied the sign-off. These prove the two move apart — and,
 * just as important, that nobody's access shifts by default.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
});

/** A manager with one approval permission taken away, the rest intact. */
function managerWithout(string $permission): User
{
    $user = User::factory()->manager()->create();

    UserPermission::create([
        'user_id' => $user->id,
        'permission' => $permission,
        'granted' => false,
    ]);

    return $user;
}

/* ── The split is real ───────────────────────────────────── */

it('lets a manager draft and submit a quote but not approve it once sales.approve is revoked', function () {
    $clerk = managerWithout('sales.approve');

    $quote = Quotation::create([
        'customer_id' => $this->customer->id,
        'title' => 'توريد UPS',
        'created_by' => $clerk->id,
    ]);

    // Preparing is still theirs — sales.manage is untouched.
    actingAs($clerk)->postJson("/api/quotations/{$quote->id}/submit")->assertOk();

    // Signing off is not.
    actingAs($clerk)->postJson("/api/quotations/{$quote->id}/approve")->assertForbidden();
});

it('lets a clerk open a payroll run but not approve it once payroll.approve is revoked', function () {
    $clerk = managerWithout('payroll.approve');
    Employee::factory()->create();

    $runId = actingAs($clerk)
        ->postJson('/api/payroll', ['year' => 2026, 'month' => 9])
        ->assertCreated()
        ->json('data.id');

    actingAs($clerk)->postJson("/api/payroll/{$runId}/approve")->assertForbidden();
});

it('lets a pure approver load the queue they must sign off', function () {
    // Only the sign-off, not the module: strip every .manage but keep the
    // .approve permissions the manager role grants, then the read endpoints
    // must still admit them — solely through the approve widening.
    $approver = User::factory()->manager()->create();

    foreach (['payroll.manage', 'sales.manage', 'warranties.manage', 'hr.manage'] as $permission) {
        UserPermission::create(['user_id' => $approver->id, 'permission' => $permission, 'granted' => false]);
    }

    actingAs($approver)->getJson('/api/payroll')->assertOk();
    actingAs($approver)->getJson('/api/quotations?pending_approval=1')->assertOk();
    actingAs($approver)->getJson('/api/warranty-claims')->assertOk();
    actingAs($approver)->getJson('/api/leave')->assertOk();
});

/* ── But nothing moves by default ────────────────────────── */

it('still lets a plain manager approve, by role default', function () {
    $quote = Quotation::create([
        'customer_id' => $this->customer->id,
        'title' => 'توريد UPS',
        'created_by' => $this->manager->id,
    ]);

    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/submit")->assertOk();
    actingAs($this->manager)->postJson("/api/quotations/{$quote->id}/approve")->assertOk();
});

it('grants an admin every approval permission', function () {
    $admin = User::factory()->admin()->create();

    foreach (['requests.decide', 'sales.approve', 'payroll.approve', 'leave.approve', 'warranties.approve'] as $permission) {
        expect($admin->hasPermission($permission))->toBeTrue();
    }
});

it('publishes the approvals as their own group in the catalogue', function () {
    $group = collect(PermissionRegistry::grouped())->firstWhere('group', 'الاعتمادات');

    expect($group)->not->toBeNull();

    $keys = collect($group['permissions'])->pluck('key');
    expect($keys)->toContain('sales.approve', 'payroll.approve', 'leave.approve', 'warranties.approve', 'requests.decide');
});

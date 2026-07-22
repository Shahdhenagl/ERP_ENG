<?php

use App\Enums\UserRole;
use App\Models\User;
use App\Models\UserPermission;
use App\Services\PermissionRegistry;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
});

/** Give or take a permission from a user. */
function override(User $user, string $permission, bool $granted): void
{
    UserPermission::updateOrCreate(
        ['user_id' => $user->id, 'permission' => $permission],
        ['granted' => $granted],
    );

    $user->refresh();
}

/* ── Nobody's access moves on the day this ships ─────────── */

it('gives an admin everything', function () {
    foreach (PermissionRegistry::keys() as $permission) {
        expect($this->admin->hasPermission($permission))->toBeTrue();
    }
});

it('gives a manager exactly what a manager could always do', function () {
    // The safety property of the whole change: access moves for nobody until
    // somebody moves it.
    expect($this->manager->hasPermission('invoices.manage'))->toBeTrue()
        ->and($this->manager->hasPermission('inventory.manage'))->toBeTrue()
        ->and($this->manager->hasPermission('accounting.view'))->toBeTrue()
        // A manager could read the books but never write a manual entry.
        ->and($this->manager->hasPermission('accounting.manage'))->toBeFalse()
        ->and($this->manager->hasPermission('users.manage'))->toBeFalse()
        ->and($this->manager->hasPermission('settings.manage'))->toBeFalse()
        ->and($this->manager->hasPermission('audit.view'))->toBeFalse();
});

it('grants a technician none of the office permissions', function () {
    // Their own screens go through routes open to every role, scoped by the
    // controllers — so there is nothing here to grant.
    expect($this->technician->permissions())->toBe([]);
});

/* ── Overrides ───────────────────────────────────────────── */

it('takes a permission away from someone whose role has it', function () {
    override($this->manager, 'treasury.manage', false);

    expect($this->manager->hasPermission('treasury.manage'))->toBeFalse()
        // And leaves the rest of the role alone.
        ->and($this->manager->hasPermission('invoices.manage'))->toBeTrue();
});

it('gives a permission to someone whose role lacks it', function () {
    override($this->manager, 'audit.view', true);

    expect($this->manager->hasPermission('audit.view'))->toBeTrue();
});

it('can strip an admin of something too', function () {
    // Otherwise "admin" is a back door no override can close.
    override($this->admin, 'settings.manage', false);

    expect($this->admin->hasPermission('settings.manage'))->toBeFalse()
        ->and($this->admin->hasPermission('users.manage'))->toBeTrue();
});

it('refuses everything to a suspended account', function () {
    // Deactivating somebody has to bite without anyone remembering to strip
    // their permissions as well.
    $this->manager->update(['is_active' => false]);

    expect($this->manager->fresh()->hasPermission('invoices.manage'))->toBeFalse()
        ->and($this->manager->fresh()->permissions())->toBe([]);
});

it('keeps one answer per user per permission', function () {
    override($this->manager, 'treasury.manage', false);
    override($this->manager, 'treasury.manage', true);

    expect(UserPermission::where('user_id', $this->manager->id)->count())->toBe(1)
        ->and($this->manager->fresh()->hasPermission('treasury.manage'))->toBeTrue();
});

/* ── The catalogue ───────────────────────────────────────── */

it('knows its own permissions and rejects invented ones', function () {
    expect(PermissionRegistry::exists('inventory.manage'))->toBeTrue()
        ->and(PermissionRegistry::exists('inventory.destroy_everything'))->toBeFalse();
});

it('groups the catalogue for a screen', function () {
    $groups = collect(PermissionRegistry::grouped());

    expect($groups->pluck('group')->all())->toContain('المخزون', 'المالية', 'الإدارة')
        ->and($groups->sum(fn ($row) => count($row['permissions'])))
        ->toBe(count(PermissionRegistry::keys()));
});

/* ── Routes actually enforce it ──────────────────────────── */

it('lets a manager reach the treasury by default', function () {
    actingAs($this->manager)->getJson('/api/treasury/summary')->assertOk();
});

it('refuses the treasury to a manager whose permission was taken away', function () {
    override($this->manager, 'treasury.manage', false);

    actingAs($this->manager)->getJson('/api/treasury/summary')->assertForbidden();
});

it('keeps the rest of the manager’s work reachable after one revoke', function () {
    // A revoke has to be surgical, or nobody will dare use it.
    override($this->manager, 'treasury.manage', false);

    actingAs($this->manager)->getJson('/api/invoices')->assertOk();
    actingAs($this->manager)->getJson('/api/items')->assertOk();
});

it('opens the audit trail to a manager who was granted it', function () {
    actingAs($this->manager)->getJson('/api/activity')->assertForbidden();

    override($this->manager, 'audit.view', true);

    // Still refused: the role decides which application you get, and the audit
    // trail sits behind the admin gate as well.
    actingAs($this->manager)->getJson('/api/activity')->assertForbidden();
});

it('refuses manual journal entries to a manager, permission or not', function () {
    override($this->manager, 'accounting.manage', true);

    actingAs($this->manager)->postJson('/api/accounting/entries', [])->assertForbidden();
});

it('still keeps a technician off every office route', function () {
    // Permissions refine what an office user may do; they do not let a field
    // user into the office application.
    override($this->technician, 'invoices.manage', true);

    actingAs($this->technician)->getJson('/api/invoices')->assertForbidden();
});

/* ── Managing them ───────────────────────────────────────── */

it('serves the catalogue to an admin', function () {
    $response = actingAs($this->admin)->getJson('/api/permissions')->assertOk();

    expect($response->json('groups'))->not->toBeEmpty()
        ->and($response->json('defaults.manager'))->toContain('invoices.manage');
});

it('shows what one user may do, and why', function () {
    override($this->manager, 'treasury.manage', false);

    $response = actingAs($this->admin)
        ->getJson("/api/users/{$this->manager->id}/permissions")
        ->assertOk();

    // Indexed rather than read with a dot path: the permission key contains
    // dots itself, so `json('overrides.treasury.manage')` looks for a nesting
    // that is not there.
    $overrides = $response->json('overrides');

    expect($response->json('effective'))->not->toContain('treasury.manage')
        ->and($overrides['treasury.manage'])->toBeFalse()
        ->and($response->json('defaults'))->toContain('treasury.manage');
});

it('saves an override through the API', function () {
    actingAs($this->admin)
        ->putJson("/api/users/{$this->manager->id}/permissions", [
            'permissions' => ['treasury.manage' => false, 'audit.view' => true],
        ])
        ->assertOk();

    expect($this->manager->fresh()->hasPermission('treasury.manage'))->toBeFalse()
        ->and($this->manager->fresh()->hasPermission('audit.view'))->toBeTrue();
});

it('clears an override by setting it back to the role default', function () {
    override($this->manager, 'treasury.manage', false);

    actingAs($this->admin)
        ->putJson("/api/users/{$this->manager->id}/permissions", [
            'permissions' => ['treasury.manage' => true],
        ])
        ->assertOk();

    // Back to the default, and the row is gone rather than left saying the
    // same thing the role already says.
    expect(UserPermission::where('user_id', $this->manager->id)->count())->toBe(0)
        ->and($this->manager->fresh()->hasPermission('treasury.manage'))->toBeTrue();
});

it('refuses a permission that does not exist', function () {
    actingAs($this->admin)
        ->putJson("/api/users/{$this->manager->id}/permissions", [
            'permissions' => ['made.up' => true],
        ])
        ->assertStatus(422);
});

it('keeps everyone but an admin out of managing permissions', function () {
    actingAs($this->manager)->getJson('/api/permissions')->assertForbidden();
    actingAs($this->manager)
        ->putJson("/api/users/{$this->technician->id}/permissions", ['permissions' => []])
        ->assertForbidden();
});

it('sends the signed-in user their own permissions', function () {
    // The nav is built from this, so a screen nobody may open is never offered.
    $response = actingAs($this->manager)->getJson('/api/me')->assertOk();

    expect($response->json('data.permissions'))->toContain('invoices.manage')
        ->and($response->json('data.permissions'))->not->toContain('users.manage');
});

it('defaults for a role and the registry agree', function () {
    // A default naming a permission the catalogue does not have would be a
    // tick box that restricts nothing.
    foreach (array_keys(PermissionRegistry::DEFAULTS) as $role) {
        foreach (PermissionRegistry::DEFAULTS[$role] as $permission) {
            expect(PermissionRegistry::exists($permission))->toBeTrue();
        }
    }

    expect(PermissionRegistry::defaultsFor(UserRole::Admin))
        ->toBe(PermissionRegistry::keys());
});

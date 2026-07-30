<?php

use App\Models\JobRole;
use App\Models\User;

/**
 * Roles are records an administrator writes, not a list shipped in a release.
 * What must hold: only a real permission may be granted, a rename never
 * orphans the accounts holding the role, and a role in use cannot vanish
 * from under them.
 */
beforeEach(function () {
    $this->admin = User::factory()->create(['role' => 'admin']);
    $this->actingAs($this->admin);
});

it('ships the roles the company runs on', function () {
    $roles = collect($this->getJson('/api/job-roles')->assertOk()->json('roles'));

    expect($roles->pluck('name'))->toContain(
        'مدير الشركة', 'السكرتارية', 'أمين المخزن', 'الحسابات',
        'أمين الخزنة', 'خدمة العملاء', 'مدير المهام', 'فني',
    );

    // The two field roles open the technician app; nobody else does.
    expect($roles->firstWhere('name', 'فني')['base_role'])->toBe('technician')
        ->and($roles->firstWhere('name', 'أمين المخزن')['permissions'])
        ->toContain('inventory.manage');
});

it('creates a role with the permissions ticked for it', function () {
    $this->postJson('/api/job-roles', [
        'name' => 'مسؤول المشتريات',
        'base_role' => 'manager',
        'permissions' => ['purchasing.manage', 'requests.decide'],
    ])->assertCreated();

    $role = JobRole::where('name', 'مسؤول المشتريات')->firstOrFail();

    $buyer = User::factory()->create(['role' => 'manager', 'position' => $role->key]);

    expect($buyer->hasPermission('purchasing.manage'))->toBeTrue()
        ->and($buyer->hasPermission('requests.decide'))->toBeTrue()
        ->and($buyer->hasPermission('treasury.manage'))->toBeFalse();
});

it('refuses a permission no route checks', function () {
    $this->postJson('/api/job-roles', [
        'name' => 'دور وهمي',
        'base_role' => 'manager',
        'permissions' => ['everything.always'],
    ])->assertStatus(422)->assertJsonValidationErrors('permissions.0');
});

it('moves everyone holding the role when its permissions change', function () {
    $role = JobRole::where('key', 'secretary')->firstOrFail();
    $secretary = User::factory()->create(['role' => 'manager', 'position' => 'secretary']);

    expect($secretary->hasPermission('invoices.manage'))->toBeFalse();

    $this->putJson("/api/job-roles/{$role->id}", [
        'name' => 'السكرتارية',
        'base_role' => 'manager',
        'permissions' => [...$role->permissions, 'invoices.manage'],
    ])->assertOk();

    expect($secretary->fresh()->hasPermission('invoices.manage'))->toBeTrue();
});

it('keeps the key when a role is renamed, so its users keep their access', function () {
    $role = JobRole::where('key', 'treasurer')->firstOrFail();
    $treasurer = User::factory()->create(['role' => 'manager', 'position' => 'treasurer']);

    $this->putJson("/api/job-roles/{$role->id}", [
        'name' => 'أمين الصندوق',
        'base_role' => 'manager',
        'permissions' => $role->permissions,
    ])->assertOk();

    expect($role->fresh()->key)->toBe('treasurer')
        ->and($treasurer->fresh()->hasPermission('treasury.manage'))->toBeTrue();
});

it('changes the application a role opens, and its users with it', function () {
    $role = JobRole::where('key', 'task_manager')->firstOrFail();
    $dispatcher = User::factory()->create(['role' => 'manager', 'position' => 'task_manager']);

    $this->putJson("/api/job-roles/{$role->id}", [
        'name' => 'مدير المهام',
        'base_role' => 'technician',
        'permissions' => ['tasks.dispatch'],
    ])->assertOk();

    expect($dispatcher->fresh()->role->value)->toBe('technician');
});

it('will not delete a role somebody holds', function () {
    $role = JobRole::where('key', 'accountant')->firstOrFail();
    User::factory()->create(['role' => 'manager', 'position' => 'accountant']);

    $this->deleteJson("/api/job-roles/{$role->id}")->assertStatus(422);

    expect(JobRole::find($role->id))->not->toBeNull();
});

it('deletes a role nobody holds', function () {
    $role = JobRole::create([
        'key' => 'temp_role', 'name' => 'دور مؤقت',
        'base_role' => 'manager', 'permissions' => [],
    ]);

    $this->deleteJson("/api/job-roles/{$role->id}")->assertOk();

    expect(JobRole::find($role->id))->toBeNull();
});

it('keeps roles away from anyone who does not manage users', function () {
    $this->actingAs(User::factory()->create(['role' => 'manager', 'position' => 'secretary']));

    $this->getJson('/api/job-roles')->assertForbidden();
    $this->postJson('/api/job-roles', [
        'name' => 'دوري الخاص', 'base_role' => 'admin', 'permissions' => [],
    ])->assertForbidden();
});

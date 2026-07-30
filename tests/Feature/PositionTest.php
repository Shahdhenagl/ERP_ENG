<?php

use App\Models\User;
use App\Models\UserPermission;

use function Pest\Laravel\actingAs;

/**
 * A job position sets the application (role) and the permissions the account
 * starts with; a per-user override still refines it on top.
 */
beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
});

it('gives an accountant the office app and the money permissions', function () {
    $response = actingAs($this->admin)->postJson('/api/users', [
        'name' => 'محمد المحاسب',
        'email' => 'accountant@example.com',
        'password' => 'password123',
        'position' => 'accountant',
    ])->assertCreated();

    expect($response->json('role'))->toBe('manager')
        ->and($response->json('position'))->toBe('accountant')
        ->and($response->json('position_label'))->toBe('الحسابات');

    $user = User::where('email', 'accountant@example.com')->first();
    expect($user->hasPermission('invoices.manage'))->toBeTrue()
        ->and($user->hasPermission('treasury.manage'))->toBeTrue()
        // Not a customer manager — that is the secretary's default, not his.
        ->and($user->hasPermission('customers.manage'))->toBeFalse();
});

it('makes the company manager an admin with everything', function () {
    actingAs($this->admin)->postJson('/api/users', [
        'name' => 'المالك', 'email' => 'owner@example.com',
        'password' => 'password123', 'position' => 'company_manager',
    ])->assertCreated();

    $user = User::where('email', 'owner@example.com')->first();
    expect($user->role->value)->toBe('admin')
        ->and($user->hasPermission('settings.manage'))->toBeTrue()
        ->and($user->hasPermission('accounting.manage'))->toBeTrue();
});

it('puts a maintenance technician on the field app', function () {
    actingAs($this->admin)->postJson('/api/users', [
        'name' => 'فني', 'email' => 'tech@example.com',
        'password' => 'password123', 'position' => 'maintenance_technician',
    ])->assertCreated();

    expect(User::where('email', 'tech@example.com')->first()->role->value)->toBe('technician');
});

it('lets a per-user override add a permission the position does not grant', function () {
    $secretary = User::factory()->create(['role' => 'manager', 'position' => 'secretary']);

    expect($secretary->hasPermission('invoices.manage'))->toBeFalse();

    UserPermission::create([
        'user_id' => $secretary->id, 'permission' => 'invoices.manage', 'granted' => true,
    ]);

    expect($secretary->fresh()->hasPermission('invoices.manage'))->toBeTrue();
});

it('shows the position preset as the baseline on the permissions matrix', function () {
    $accountant = User::factory()->create(['role' => 'manager', 'position' => 'accountant']);

    $defaults = actingAs($this->admin)
        ->getJson("/api/users/{$accountant->id}/permissions")
        ->assertOk()
        ->json('defaults');

    expect($defaults)->toContain('invoices.manage', 'accounting.manage')
        ->and($defaults)->not->toContain('customers.manage');
});

it('rejects an unknown position', function () {
    actingAs($this->admin)->postJson('/api/users', [
        'name' => 'x', 'email' => 'x@example.com',
        'password' => 'password123', 'position' => 'wizard',
    ])->assertStatus(422)->assertJsonValidationErrors('position');
});

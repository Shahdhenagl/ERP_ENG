<?php

namespace App\Services;

use App\Enums\UserRole;

/**
 * Job positions, each a base role and the permissions it starts with.
 *
 * The role decides which application a user gets — the field app for a
 * technician, the office one for everyone else — and stays the three it always
 * was. A position sits on top: it picks that role and seeds a sensible set of
 * permissions for the job, which an admin then tunes per person from the
 * permissions screen. So "accountant" and "customer service" are both office
 * users, told apart by what they may touch, not by a fourth and fifth role.
 *
 * `'*'` means every permission — the company manager, who is an admin.
 */
class PositionRegistry
{
    /**
     * key => [label, role, permissions ('*' for all)].
     *
     * @var array<string, array{0: string, 1: string, 2: string|array<int, string>}>
     */
    public const ALL = [
        'company_manager' => ['مدير الشركة', 'admin', '*'],

        'maintenance_engineer' => ['مهندس صيانة', 'manager', [
            'tasks.dispatch', 'customers.manage', 'assets.manage',
            'contracts.manage', 'warranties.manage', 'warranties.approve',
            'inventory.view', 'requests.decide', 'reports.view',
        ]],

        'secretary' => ['السكرتارية', 'manager', [
            'customers.manage', 'crm.manage', 'tasks.dispatch', 'reports.view',
        ]],

        'accountant' => ['المحاسب', 'manager', [
            'invoices.manage', 'treasury.manage', 'cheques.manage',
            'accounting.view', 'accounting.manage', 'reports.view',
        ]],

        'administrative' => ['إداري', 'manager', [
            'customers.manage', 'crm.manage', 'hr.manage', 'tasks.dispatch', 'reports.view',
        ]],

        'treasurer' => ['أمين الخزنة', 'manager', [
            'treasury.manage', 'cheques.manage', 'invoices.manage', 'reports.view',
        ]],

        'customer_service' => ['خدمة عملاء', 'manager', [
            'customers.manage', 'crm.manage', 'tasks.dispatch', 'contracts.manage', 'reports.view',
        ]],

        // The field app; its screens are scoped by the controllers, so there is
        // nothing here to grant.
        'maintenance_technician' => ['فني صيانة', 'technician', []],
    ];

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(self::ALL);
    }

    public static function exists(string $position): bool
    {
        return isset(self::ALL[$position]);
    }

    public static function label(string $position): string
    {
        return self::ALL[$position][0] ?? $position;
    }

    /** The base role — which application the position gets. */
    public static function roleFor(string $position): UserRole
    {
        return UserRole::from(self::ALL[$position][1] ?? UserRole::Manager->value);
    }

    /**
     * The permissions the position starts with. '*' resolves to everything.
     *
     * @return array<int, string>
     */
    public static function permissionsFor(string $position): array
    {
        $permissions = self::ALL[$position][2] ?? [];

        return $permissions === '*' ? PermissionRegistry::keys() : $permissions;
    }

    /** For the picker: key + label, in the order defined. */
    public static function options(): array
    {
        return array_map(
            fn (string $key) => ['key' => $key, 'label' => self::label($key)],
            self::keys(),
        );
    }
}

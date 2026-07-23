<?php

namespace App\Services;

use App\Enums\UserRole;

/**
 * Every permission the system has, defined in code.
 *
 * Deliberately not a table anyone can add rows to. A permission is only real if
 * a route or a screen checks it, and a row nobody checks is a promise the
 * system does not keep — an administrator ticks it, believes something has been
 * restricted, and nothing has.
 *
 * The role stays what it always was: which application you get. A technician
 * gets the field app, everyone else gets the office one. Permissions refine
 * what can be done *inside* that, which is why a storekeeper is an office user
 * with inventory permissions rather than a fourth role.
 *
 * `DEFAULTS` reproduces exactly what each role could do before permissions
 * existed. That is the whole safety property of this change: nobody's access
 * moves on the day it ships, and every difference afterwards is one somebody
 * chose.
 */
class PermissionRegistry
{
    /**
     * key => [label, group].
     *
     * @var array<string, array{0: string, 1: string}>
     */
    public const ALL = [
        // ── Work ─────────────────────────────────────────────
        'tasks.dispatch' => ['إنشاء وإسناد أوامر العمل', 'العمل'],
        'customers.manage' => ['إدارة العملاء والفروع', 'العمل'],
        'crm.manage' => ['العملاء المحتملون والمتابعات', 'العمل'],
        'assets.manage' => ['إدارة الأجهزة', 'العمل'],
        'contracts.manage' => ['إدارة عقود الصيانة', 'العمل'],
        'warranties.manage' => ['إدارة الضمانات والمطالبات', 'العمل'],

        // ── Stock ────────────────────────────────────────────
        'inventory.view' => ['عرض المخزون', 'المخزون'],
        'inventory.manage' => ['حركات المخزون والعهد', 'المخزون'],

        // ── Buying and selling ───────────────────────────────
        'purchasing.manage' => ['الموردون وأوامر الشراء', 'المشتريات'],
        'requests.decide' => ['اعتماد طلبات الشراء', 'المشتريات'],
        'sales.manage' => ['عروض الأسعار وأوامر البيع', 'المبيعات'],

        // ── Money ────────────────────────────────────────────
        'invoices.manage' => ['الفواتير والتحصيل', 'المالية'],
        'treasury.manage' => ['الخزينة والمصروفات', 'المالية'],
        'cheques.manage' => ['الشيكات والتسوية البنكية', 'المالية'],
        'accounting.view' => ['عرض الحسابات والقوائم', 'المالية'],
        'accounting.manage' => ['القيود اليدوية ودليل الحسابات', 'المالية'],

        // ── People ───────────────────────────────────────────
        'hr.manage' => ['الموظفون والإجازات', 'الموارد البشرية'],
        'payroll.manage' => ['الرواتب والسلف والمسيّرات', 'الموارد البشرية'],

        // ── Oversight ────────────────────────────────────────
        'reports.view' => ['التقارير', 'الإدارة'],
        'users.manage' => ['المستخدمون والصلاحيات', 'الإدارة'],
        'settings.manage' => ['إعدادات الشركة', 'الإدارة'],
        'audit.view' => ['سجل العمليات', 'الإدارة'],
    ];

    /**
     * What each role could do before permissions existed.
     *
     * An admin gets everything, so it is not listed — spelling it out would be
     * a second list to forget to update.
     *
     * @var array<string, array<int, string>>
     */
    public const DEFAULTS = [
        'manager' => [
            'tasks.dispatch',
            'customers.manage',
            'crm.manage',
            'assets.manage',
            'contracts.manage',
            'warranties.manage',
            'inventory.view',
            'inventory.manage',
            'purchasing.manage',
            'requests.decide',
            'sales.manage',
            'invoices.manage',
            'treasury.manage',
            'cheques.manage',
            'hr.manage',
            'payroll.manage',
            // A manager could read the books but never write a manual entry.
            'accounting.view',
            'reports.view',
        ],

        // A technician's own screens are reached through routes open to every
        // role and scoped to them by the controllers, so there is nothing here
        // to grant. Raising a purchase request is one of those.
        'technician' => [],
    ];

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(self::ALL);
    }

    public static function exists(string $permission): bool
    {
        return isset(self::ALL[$permission]);
    }

    public static function label(string $permission): string
    {
        return self::ALL[$permission][0] ?? $permission;
    }

    public static function group(string $permission): string
    {
        return self::ALL[$permission][1] ?? 'أخرى';
    }

    /** @return array<int, string> */
    public static function defaultsFor(UserRole $role): array
    {
        return $role === UserRole::Admin
            ? self::keys()
            : (self::DEFAULTS[$role->value] ?? []);
    }

    /**
     * The catalogue, grouped for a screen.
     *
     * @return array<int, array{group: string, permissions: array<int, array{key: string, label: string}>}>
     */
    public static function grouped(): array
    {
        $groups = [];

        foreach (self::ALL as $key => [$label, $group]) {
            $groups[$group][] = ['key' => $key, 'label' => $label];
        }

        return array_map(
            fn (string $group, array $permissions) => compact('group', 'permissions'),
            array_keys($groups),
            $groups,
        );
    }
}

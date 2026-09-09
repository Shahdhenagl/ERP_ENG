<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Support\Terms;

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
     * Screen-level permissions.  The older permissions below protect business
     * operations; these decide which individual module/submodule is available
     * in the office application.  Keeping the two concepts separate means an
     * accountant can, for example, have invoice operations without also seeing
     * every sales screen that happens to reuse the same API.
     *
     * key => [label, navigation group].
     *
     * @var array<string, array{0: string, 1: string}>
     */
    public const SCREENS = [
        'screen.dashboard' => ['لوحة التحكم', 'الرئيسية'],
        'screen.notifications' => ['التنبيهات', 'الرئيسية'],

        'screen.customers' => ['العملاء', 'إدارة العملاء'],
        'screen.contacts' => ['جهات الاتصال', 'إدارة العملاء'],
        'screen.crm' => ['فرص البيع (Leads)', 'إدارة العملاء'],
        'screen.followups' => ['متابعة العملاء', 'إدارة العملاء'],
        'screen.customer-ledger' => ['سجل تعاملات العميل', 'إدارة العملاء'],
        'screen.site-surveys' => ['معاينة الموقع (Site Survey)', 'إدارة العملاء'],

        'screen.sales.quotations' => ['عروض الأسعار', 'المبيعات'],
        'screen.sales.approvals' => ['اعتماد عروض الأسعار', 'المبيعات'],
        'screen.sales.orders' => ['أوامر البيع', 'المبيعات'],
        'screen.sales.deliveries' => ['أذون التسليم', 'المبيعات'],
        'screen.sales.invoices' => ['الفواتير', 'المبيعات'],
        'screen.sales.returns' => ['مرتجعات المبيعات', 'المبيعات'],
        'screen.sales.collections' => ['التحصيلات', 'المبيعات'],
        'screen.sales.statement' => ['كشف حساب العميل', 'المبيعات'],
        'screen.sales.tenders' => ['المناقصات والعطاءات', 'المبيعات'],

        'screen.inventory.items' => ['الأصناف', 'إدارة المخزون'],
        'screen.inventory.groups' => ['المجموعات / الماركات', 'إدارة المخزون'],
        'screen.inventory.warehouses' => ['المخازن', 'إدارة المخزون'],
        'screen.inventory.receiving' => ['إذن استلام', 'إدارة المخزون'],
        'screen.inventory.issue' => ['إذن صرف', 'إدارة المخزون'],
        'screen.inventory.transfers' => ['تحويلات المخازن', 'إدارة المخزون'],
        'screen.inventory.stocktake' => ['الجرد والتسويات', 'إدارة المخزون'],

        'screen.purchasing.suppliers' => ['الموردون', 'المشتريات'],
        'screen.purchasing.requests' => ['طلبات الشراء', 'المشتريات'],
        'screen.purchasing.quotes' => ['عروض الموردين', 'المشتريات'],
        'screen.purchasing.orders' => ['أوامر الشراء', 'المشتريات'],
        'screen.purchasing.receiving' => ['استلام المشتريات', 'المشتريات'],
        'screen.purchasing.invoices' => ['فواتير الموردين', 'المشتريات'],
        'screen.purchasing.returns' => ['مرتجعات المشتريات', 'المشتريات'],
        'screen.purchasing.statement' => ['كشف حساب المورد', 'المشتريات'],

        'screen.contracts' => ['عقود الصيانة (AMC)', 'إدارة العقود'],
        'screen.contracts.renewals' => ['التنبيهات والتجديدات', 'إدارة العقود'],
        'screen.contracts.history' => ['سجل تعديلات العقد', 'إدارة العقود'],

        'screen.warranties.register' => ['تسجيل ضمان', 'إدارة الضمانات'],
        'screen.warranties.certificate' => ['شهادة ضمان', 'إدارة الضمانات'],
        'screen.warranties.claims' => ['مطالبات الضمان', 'إدارة الضمانات'],
        'screen.warranties.repairs' => ['أوامر الإصلاح', 'إدارة الضمانات'],
        'screen.warranties.lifecycle' => ['استبدال / تمديد ضمان', 'إدارة الضمانات'],
        'screen.assets' => ['تاريخ الجهاز', 'إدارة الضمانات'],

        'screen.service.tasks' => ['التذاكر وأوامر العمل', 'خدمة العملاء والصيانة'],
        'screen.service.technicians' => ['الفنيون', 'خدمة العملاء والصيانة'],
        'screen.service.monthly-reports' => ['التقارير الشهرية للفنيين', 'خدمة العملاء والصيانة'],
        'screen.service.parts' => ['قطع الغيار المستخدمة', 'خدمة العملاء والصيانة'],
        'screen.service.ppm' => ['الصيانة الوقائية (PPM)', 'خدمة العملاء والصيانة'],
        'screen.service.batteries' => ['إدارة البطاريات', 'خدمة العملاء والصيانة'],
        'screen.service.satisfaction' => ['رضا العملاء (CSAT)', 'خدمة العملاء والصيانة'],

        'screen.treasury.boxes' => ['الخزائن', 'الخزينة'],
        'screen.treasury.payments' => ['سند صرف', 'الخزينة'],
        'screen.treasury.operations' => ['عمليات الخزينة والمصروفات الدورية', 'الخزينة'],
        'screen.treasury.daybook' => ['حركة الخزينة اليومية', 'الخزينة'],

        'screen.banks.accounts' => ['الحسابات البنكية', 'البنوك'],
        'screen.banks.incoming-cheques' => ['الشيكات الواردة', 'البنوك'],
        'screen.banks.outgoing-cheques' => ['الشيكات الصادرة', 'البنوك'],
        'screen.banks.reconcile' => ['التسوية البنكية', 'البنوك'],
        'screen.banks.transfers' => ['الإيداعات والتحويلات', 'البنوك'],

        'screen.custody.create' => ['إنشاء وصرف العهدة', 'عهد الموظفين'],
        'screen.custody.settle' => ['تسجيل مصروفات / تسوية', 'عهد الموظفين'],
        'screen.custody.statement' => ['كشف حساب الموظف', 'عهد الموظفين'],

        'screen.hr.employees' => ['ملف الموظف', 'الموارد البشرية'],
        'screen.hr.attendance' => ['الحضور والغياب', 'الموارد البشرية'],
        'screen.hr.leave' => ['الإجازات', 'الموارد البشرية'],
        'screen.hr.advances' => ['السلف', 'الموارد البشرية'],
        'screen.hr.adjustments' => ['الخصومات والمكافآت', 'الموارد البشرية'],
        'screen.hr.payroll' => ['كشوف الرواتب', 'الموارد البشرية'],

        'screen.accounting.accounts' => ['دليل الحسابات', 'المحاسبة المالية'],
        'screen.accounting.journal' => ['القيود اليومية', 'المحاسبة المالية'],
        'screen.accounting.ledger' => ['الأستاذ العام', 'المحاسبة المالية'],
        'screen.accounting.trial-balance' => ['ميزان المراجعة', 'المحاسبة المالية'],
        'screen.accounting.income-statement' => ['قائمة الدخل', 'المحاسبة المالية'],
        'screen.accounting.balance-sheet' => ['الميزانية العمومية', 'المحاسبة المالية'],
        'screen.accounting.cost-centers' => ['مراكز التكلفة', 'المحاسبة المالية'],

        'screen.admin.users' => ['المستخدمون', 'الإدارة والصلاحيات'],
        'screen.admin.roles' => ['الأدوار والصلاحيات', 'الإدارة والصلاحيات'],
        'screen.admin.audit' => ['سجل العمليات', 'الإدارة والصلاحيات'],
        'screen.admin.settings' => ['إعدادات النظام', 'الإدارة والصلاحيات'],
        'screen.admin.drafts' => ['المسودات والنماذج', 'الإدارة والصلاحيات'],

        'screen.reports.sales' => ['تقارير المبيعات', 'التقارير'],
        'screen.reports.profit' => ['تقارير الأرباح', 'التقارير'],
        'screen.reports.stock' => ['تقارير المخزون', 'التقارير'],
        'screen.reports.custody' => ['تقارير العهد', 'التقارير'],
        'screen.reports.contracts' => ['تقارير العقود', 'التقارير'],
        'screen.reports.warranties' => ['تقارير الضمانات', 'التقارير'],
        'screen.reports.crm' => ['تقارير العملاء المحتملين', 'التقارير'],
        'screen.reports.hr' => ['تقارير الموارد البشرية', 'التقارير'],
        'screen.reports.maintenance' => ['تقارير الصيانة و PPM', 'التقارير'],
        'screen.reports.periodic' => ['تقرير الصيانة الدورية', 'التقارير'],
        'screen.reports.task-movements' => ['تقرير تحركات المهام', 'التقارير'],
        'screen.reports.custom' => ['التقارير المخصصة', 'التقارير'],
    ];
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
        'sales.manage' => ['عروض الأسعار وأوامر البيع', 'المبيعات'],

        // ── Money ────────────────────────────────────────────
        'invoices.manage' => ['الفواتير والتحصيل', 'المالية'],
        'treasury.manage' => ['الخزينة والمصروفات', 'المالية'],
        'cheques.manage' => ['الشيكات والتسوية البنكية', 'المالية'],
        'accounting.view' => ['عرض الحسابات والقوائم', 'المالية'],
        'accounting.manage' => ['القيود اليدوية ودليل الحسابات', 'المالية'],

        // ── Approvals ────────────────────────────────────────
        // Held apart from the module permissions on purpose. Preparing a
        // document and signing it off are two different authorities, and the
        // separation of duties only means anything if one can be granted
        // without the other — a salesperson who drafts a quote but cannot
        // approve it, a clerk who opens the payroll run but cannot commit it.
        'requests.decide' => ['اعتماد طلبات الشراء', 'الاعتمادات'],
        'sales.approve' => ['اعتماد عروض الأسعار والمناقصات', 'الاعتمادات'],
        'payroll.approve' => ['اعتماد كشوف الرواتب', 'الاعتمادات'],
        'leave.approve' => ['اعتماد الإجازات', 'الاعتمادات'],
        'warranties.approve' => ['البتّ في مطالبات الضمان', 'الاعتمادات'],

        // ── People ───────────────────────────────────────────
        'hr.manage' => ['الموظفون والإجازات', 'الموارد البشرية'],
        'payroll.manage' => ['الرواتب والسلف وكشوف الرواتب', 'الموارد البشرية'],

        // ── Oversight ────────────────────────────────────────
        'reports.view' => ['التقارير', 'الإدارة'],
        'users.manage' => ['المستخدمون والصلاحيات', 'الإدارة'],
        'settings.manage' => ['إعدادات الشركة', 'الإدارة'],
        'drafts.manage' => ['إدارة المسودات والنماذج', 'الإدارة'],
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
            'sales.manage',
            'invoices.manage',
            'treasury.manage',
            'cheques.manage',
            'hr.manage',
            'payroll.manage',
            // A manager could read the books but never write a manual entry.
            'accounting.view',
            'reports.view',
            'drafts.manage',
            'screen.admin.drafts',
            // Every sign-off a manager could already give: the split into
            // separate permissions must not move anyone's access on the day it
            // ships, only make each one revocable on its own afterwards.
            'requests.decide',
            'sales.approve',
            'payroll.approve',
            'leave.approve',
            'warranties.approve',
        ],

        // A technician's own screens are reached through routes open to every
        // role and scoped to them by the controllers, so there is nothing here
        // to grant. Raising a purchase request is one of those.
        'technician' => [],
    ];

    /** @return array<int, string> */
    public static function keys(): array
    {
        return [...array_keys(self::ALL), ...array_keys(self::SCREENS)];
    }

    public static function exists(string $permission): bool
    {
        return isset(self::ALL[$permission]) || isset(self::SCREENS[$permission]);
    }

    public static function label(string $permission): string
    {
        return Terms::get(self::ALL[$permission][0] ?? self::SCREENS[$permission][0] ?? $permission);
    }

    public static function group(string $permission): string
    {
        return Terms::get(self::ALL[$permission][1] ?? self::SCREENS[$permission][1] ?? 'أخرى');
    }

    /** @return array<int, string> */
    public static function defaultsFor(UserRole $role): array
    {
        if ($role === UserRole::Admin) {
            return self::keys();
        }

        $defaults = self::DEFAULTS[$role->value] ?? [];

        return $role === UserRole::Manager
            ? [...$defaults, ...array_keys(self::SCREENS)]
            : $defaults;
    }

    /**
     * The catalogue, grouped for a screen.
     *
     * @return array<int, array{group: string, permissions: array<int, array{key: string, label: string}>}>
     */
    public static function grouped(): array
    {
        $groups = [];

        foreach ([...self::ALL, ...self::SCREENS] as $key => [$label, $group]) {
            $groups[Terms::get($group)][] = ['key' => $key, 'label' => Terms::get($label)];
        }

        return array_map(
            fn (string $group, array $permissions) => compact('group', 'permissions'),
            array_keys($groups),
            $groups,
        );
    }
}

import {
    ArrowLeftRight,
    Banknote,
    BatteryCharging,
    Bell,
    BookOpen,
    Boxes,
    Building2,
    Calculator,
    CalendarDays,
    ClipboardCheck,
    ClipboardList,
    Contact,
    FileSignature,
    FileClock,
    FileText,
    HandCoins,
    HardDrive,
    Landmark,
    LayoutDashboard,
    MapPin,
    Package,
    PackageMinus,
    PackagePlus,
    Percent,
    PieChart,
    Receipt,
    Repeat,
    Scale,
    ScrollText,
    Settings2,
    ShieldCheck,
    ShieldPlus,
    Smile,
    Star,
    Target,
    BadgePercent,
    BarChart3,
    Boxes as BoxesIcon,
    TrendingUp,
    Truck,
    UserCheck,
    UserCog,
    Users,
    Wallet,
    Warehouse,
    Wrench,
    type LucideIcon,
} from 'lucide-react'
import { tr } from '@/lib/i18n'

export interface NavItem {
    /** Path within the user's area — prefixed with /tech or /manager at render. */
    to: string
    label: string
    icon: LucideIcon
    /** Roles allowed to see this entry; undefined means everyone. */
    roles?: Array<'admin' | 'manager' | 'technician'>
    /**
     * The permission that opens it. Undefined means the entry is not gated —
     * the dashboard, a technician's own screens, and any screen still on the
     * "coming soon" placeholder (which nobody can be refused because there is
     * nothing there to refuse yet).
     */
    permission?: string
    /** Any one of these opens it — for a module split across two permissions. */
    anyPermission?: string[]
    /** Used in the bottom bar, where a long label truncates on a phone. */
    short?: string
    /** Sub-sections. Shown indented under the parent in the sidebar. */
    children?: NavItem[]
}

/**
 * The navigation tree, mirroring the system spec: fifteen top-level modules,
 * each with the screens it owns. Screens already built point at their real
 * route; the rest point at `/soon/<slug>`, a single placeholder that says the
 * screen is on its way rather than bouncing the click back to the dashboard.
 *
 * Every module is a group so the parent/child shape reads the same everywhere,
 * exactly as the spec lays it out.
 */
export const NAV: NavItem[] = [
    /* 1 ── الرئيسية ─────────────────────────────────────────── */
    {
        to: '/',
        label: tr('لوحة التحكم'),
        icon: LayoutDashboard,
        roles: ['admin', 'manager'],
        children: [
            { to: '/', label: tr('لوحة التحكم'), icon: LayoutDashboard },
            { to: '/notifications', label: tr('التنبيهات'), icon: Bell },
            { to: '/tasks', permission: 'tasks.dispatch', label: tr('المهام المطلوبة'), icon: ClipboardList },
        ],
    },

    /* 2 ── CRM — إدارة العملاء ──────────────────────────────── */
    {
        to: '/customers',
        label: tr('إدارة العملاء'),
        icon: Users,
        roles: ['admin', 'manager'],
        short: tr('عملاء'),
        children: [
            { to: '/customers', permission: 'customers.manage', label: tr('العملاء'), icon: Building2 },
            { to: '/contacts', permission: 'customers.manage', label: tr('جهات الاتصال'), icon: Contact },
            { to: '/crm', permission: 'crm.manage', label: tr('فرص البيع (Leads)'), icon: Target },
            { to: '/sales/quotations', permission: 'sales.manage', label: tr('عروض الأسعار (CRM)'), icon: FileText },
            { to: '/customer-followups', permission: 'crm.manage', label: tr('متابعة العملاء'), icon: CalendarDays },
            { to: '/customer-ledger', permission: 'customers.manage', label: tr('سجل تعاملات العميل'), icon: FileClock },
            { to: '/site-surveys', permission: 'crm.manage', label: tr('معاينة الموقع (Site Survey)'), icon: MapPin },
        ],
    },

    /* 3 ── المبيعات ─────────────────────────────────────────── */
    {
        to: '/sales/quotations',
        label: tr('المبيعات'),
        icon: FileText,
        roles: ['admin', 'manager'],
        short: tr('بيع'),
        children: [
            { to: '/sales/quotations', permission: 'sales.manage', label: tr('عروض الأسعار'), icon: FileText },
            { to: '/sales/approvals', permission: 'sales.approve', label: tr('اعتماد عروض الأسعار'), icon: ClipboardCheck },
            { to: '/sales/orders', permission: 'sales.manage', label: tr('أوامر البيع'), icon: Receipt },
            { to: '/sales/deliveries', permission: 'sales.manage', label: tr('أذون التسليم'), icon: Truck },
            { to: '/invoices', permission: 'invoices.manage', label: tr('الفواتير'), icon: Receipt },
            { to: '/sales/returns', permission: 'sales.manage', label: tr('مرتجعات المبيعات'), icon: ArrowLeftRight },
            { to: '/collections', permission: 'treasury.manage', label: tr('التحصيلات'), icon: HandCoins },
            { to: '/customer-statement', permission: 'sales.manage', label: tr('كشف حساب العميل'), icon: FileClock },
            { to: '/tenders', permission: 'sales.manage', label: tr('المناقصات والعطاءات'), icon: FileSignature },
        ],
    },

    /* 4 ── إدارة المخزون ───────────────────────────────────── */
    {
        to: '/inventory/items',
        label: tr('إدارة المخزون'),
        icon: Package,
        roles: ['admin', 'manager'],
        short: tr('مخزون'),
        children: [
            { to: '/inventory/items', permission: 'inventory.view', label: tr('الأصناف'), icon: Boxes },
            { to: '/inventory/groups', permission: 'inventory.manage', label: tr('المجموعات / الماركات'), icon: BoxesIcon },
            { to: '/inventory/warehouses', permission: 'inventory.view', label: tr('المخازن'), icon: Warehouse },
            { to: '/inventory/movements', permission: 'inventory.view', label: tr('إذن استلام'), icon: PackagePlus },
            { to: '/inventory/issue', permission: 'inventory.manage', label: tr('إذن صرف'), icon: PackageMinus },
            { to: '/inventory/transfers', permission: 'inventory.manage', label: tr('تحويلات المخازن'), icon: ArrowLeftRight },
            { to: '/inventory/stocktake', permission: 'inventory.manage', label: tr('الجرد والتسويات'), icon: ClipboardCheck },
        ],
    },

    /* 5 ── المشتريات ────────────────────────────────────────── */
    {
        to: '/purchasing/suppliers',
        label: tr('المشتريات'),
        icon: Truck,
        roles: ['admin', 'manager'],
        short: tr('شراء'),
        children: [
            { to: '/purchasing/suppliers', permission: 'purchasing.manage', label: tr('الموردون'), icon: Building2 },
            { to: '/purchasing/requests', permission: 'purchasing.manage', label: tr('طلبات الشراء'), icon: ClipboardList },
            { to: '/supplier-quotes', permission: 'purchasing.manage', label: tr('عروض الموردين'), icon: FileText },
            { to: '/purchasing/orders', permission: 'purchasing.manage', label: tr('أوامر الشراء'), icon: Truck },
            { to: '/purchasing/receiving', permission: 'purchasing.manage', label: tr('استلام المشتريات'), icon: PackagePlus },
            { to: '/purchasing/invoices', permission: 'purchasing.manage', label: tr('فواتير الموردين'), icon: Receipt },
            { to: '/purchasing/returns', permission: 'purchasing.manage', label: tr('مرتجعات المشتريات'), icon: ArrowLeftRight },
            { to: '/supplier-statement', permission: 'purchasing.manage', label: tr('كشف حساب المورد'), icon: FileClock },
        ],
    },

    /* 6 ── إدارة العقود ────────────────────────────────────── */
    {
        to: '/contracts',
        label: tr('إدارة العقود'),
        icon: ScrollText,
        roles: ['admin', 'manager'],
        short: tr('عقود'),
        children: [
            { to: '/contracts', permission: 'contracts.manage', label: tr('عقود الصيانة (AMC)'), icon: ScrollText },
            { to: '/contracts/renewals', permission: 'contracts.manage', label: tr('التنبيهات والتجديدات'), icon: Repeat },
            { to: '/contracts/history', permission: 'contracts.manage', label: tr('سجل تعديلات العقد'), icon: FileClock },
        ],
    },

    /* 7 ── إدارة الضمانات ──────────────────────────────────── */
    {
        to: '/warranties/register',
        label: tr('إدارة الضمانات'),
        icon: ShieldCheck,
        roles: ['admin', 'manager'],
        short: tr('ضمانات'),
        children: [
            { to: '/warranties/register', permission: 'warranties.manage', label: tr('تسجيل ضمان'), icon: ShieldCheck },
            { to: '/warranties/certificate', permission: 'warranties.manage', label: tr('شهادة ضمان'), icon: FileSignature },
            { to: '/warranties/claims', permission: 'warranties.manage', label: tr('مطالبات الضمان'), icon: ClipboardList },
            { to: '/warranties/repair-orders', permission: 'warranties.manage', label: tr('أوامر الإصلاح'), icon: Wrench },
            { to: '/warranties/lifecycle', permission: 'warranties.manage', label: tr('استبدال / تمديد ضمان'), icon: ShieldPlus },
            { to: '/assets', permission: 'assets.manage', label: tr('تاريخ الجهاز'), icon: HardDrive },
        ],
    },

    /* 8 ── خدمة العملاء والصيانة ───────────────────────────── */
    {
        to: '/tasks',
        label: tr('خدمة العملاء والصيانة'),
        icon: Wrench,
        roles: ['admin', 'manager'],
        short: tr('صيانة'),
        children: [
            { to: '/tasks', permission: 'tasks.dispatch', label: tr('التذاكر وأوامر العمل'), icon: ClipboardList },
            { to: '/technicians', permission: 'tasks.dispatch', label: tr('الفنيون'), icon: UserCheck },
            {
                to: '/technician-reports',
                label: tr('التقارير الشهرية للفنيين'),
                icon: ClipboardCheck,
                permission: 'hr.manage',
            },
            { to: '/parts-used', permission: 'inventory.manage', label: tr('قطع الغيار المستخدمة'), icon: Wrench },
            { to: '/ppm', permission: 'contracts.manage', label: tr('الصيانة الوقائية (PPM)'), icon: CalendarDays },
            { to: '/batteries', permission: 'assets.manage', label: tr('إدارة البطاريات'), icon: BatteryCharging },
            { to: '/satisfaction', permission: 'tasks.dispatch', label: tr('رضا العملاء (CSAT)'), icon: Smile },
        ],
    },

    /* 10 ── الخزينة ─────────────────────────────────────────── */
    {
        to: '/treasury',
        label: tr('الخزينة'),
        icon: Wallet,
        roles: ['admin', 'manager'],
        short: tr('خزينة'),
        children: [
            { to: '/treasury', permission: 'treasury.manage', label: tr('الخزائن'), icon: Wallet },
            { to: '/collections', permission: 'treasury.manage', label: tr('سند قبض'), icon: HandCoins },
            { to: '/treasury/payments-out', permission: 'treasury.manage', label: tr('سند صرف'), icon: Banknote },
            { to: '/treasury/operations', permission: 'treasury.manage', label: tr('عمليات الخزينة والمصروفات الدورية'), icon: ArrowLeftRight },
            { to: '/treasury/daybook', permission: 'treasury.manage', label: tr('حركة الخزينة اليومية'), icon: FileClock },
        ],
    },

    /* 11 ── البنوك ──────────────────────────────────────────── */
    {
        to: '/banks',
        label: tr('البنوك'),
        icon: Landmark,
        roles: ['admin', 'manager'],
        short: tr('بنوك'),
        children: [
            { to: '/banks/accounts', permission: 'treasury.manage', label: tr('الحسابات البنكية'), icon: Landmark },
            { to: '/cheques/incoming', permission: 'cheques.manage', label: tr('الشيكات الواردة'), icon: Banknote },
            { to: '/cheques/outgoing', permission: 'cheques.manage', label: tr('الشيكات الصادرة'), icon: Banknote },
            { to: '/banks/reconcile', permission: 'cheques.manage', label: tr('التسوية البنكية'), icon: Scale },
            { to: '/banks/transfers', permission: 'treasury.manage', label: tr('الإيداعات والتحويلات'), icon: ArrowLeftRight },
        ],
    },

    /* 12 ── عهد الموظفين ───────────────────────────────────── */
    {
        to: '/custody',
        label: tr('عهد الموظفين'),
        icon: HandCoins,
        roles: ['admin', 'manager'],
        short: tr('عهد'),
        children: [
            { to: '/custody', permission: 'inventory.manage', label: tr('إنشاء وصرف العهدة'), icon: HandCoins },
            { to: '/custody/settle', permission: 'inventory.manage', label: tr('تسجيل مصروفات / تسوية'), icon: ClipboardCheck },
            { to: '/custody/statement', permission: 'inventory.manage', label: tr('كشف حساب الموظف'), icon: FileClock },
        ],
    },

    /* 13 ── الموارد البشرية ────────────────────────────────── */
    {
        to: '/hr/employees',
        label: tr('الموارد البشرية'),
        icon: UserCog,
        roles: ['admin', 'manager'],
        short: tr('موظفون'),
        anyPermission: ['hr.manage', 'payroll.manage'],
        children: [
            { to: '/hr/employees', permission: 'hr.manage', label: tr('ملف الموظف'), icon: Users },
            { to: '/hr/attendance', permission: 'hr.manage', label: tr('الحضور والغياب'), icon: CalendarDays },
            { to: '/hr/leave', permission: 'hr.manage', label: tr('الإجازات'), icon: CalendarDays },
            { to: '/hr/advances', permission: 'payroll.manage', label: tr('السلف'), icon: HandCoins },
            { to: '/hr/adjustments', permission: 'payroll.manage', label: tr('الخصومات والمكافآت'), icon: Percent },
            { to: '/hr/payroll', permission: 'payroll.manage', label: tr('مسير الرواتب'), icon: Banknote },
        ],
    },

    /* 14 ── المحاسبة المالية ───────────────────────────────── */
    {
        to: '/accounting/accounts',
        label: tr('المحاسبة المالية'),
        icon: Calculator,
        roles: ['admin', 'manager'],
        short: tr('محاسبة'),
        children: [
            { to: '/accounting/accounts', permission: 'accounting.view', label: tr('دليل الحسابات'), icon: ScrollText },
            { to: '/accounting/journal', permission: 'accounting.view', label: tr('القيود اليومية'), icon: FileText },
            { to: '/accounting/ledger', permission: 'accounting.view', label: tr('الأستاذ العام'), icon: BookOpen },
            { to: '/accounting/trial-balance', permission: 'accounting.view', label: tr('ميزان المراجعة'), icon: Scale },
            { to: '/accounting/income-statement', permission: 'accounting.view', label: tr('قائمة الدخل'), icon: BarChart3 },
            { to: '/accounting/balance-sheet', permission: 'accounting.view', label: tr('الميزانية العمومية'), icon: PieChart },
            { to: '/accounting/cost-centers', permission: 'accounting.view', label: tr('مراكز التكلفة'), icon: Target },
        ],
    },

    /* 16 ── الإدارة والصلاحيات ─────────────────────────────── */
    {
        to: '/users',
        label: tr('الإدارة والصلاحيات'),
        icon: ShieldCheck,
        roles: ['admin'],
        short: tr('إدارة'),
        children: [
            { to: '/users', permission: 'users.manage', label: tr('المستخدمون'), icon: Users },
            { to: '/roles', permission: 'users.manage', label: tr('الأدوار والصلاحيات'), icon: ShieldPlus },
            { to: '/audit', permission: 'audit.view', label: tr('سجل العمليات'), icon: FileClock },
            { to: '/settings', permission: 'settings.manage', label: tr('إعدادات النظام'), icon: Settings2 },
        ],
    },

    /* 17 ── التقارير ────────────────────────────────────────── */
    {
        to: '/reports/sales',
        label: tr('التقارير'),
        icon: BarChart3,
        roles: ['admin', 'manager'],
        short: tr('تقارير'),
        children: [
            { to: '/reports/sales', permission: 'reports.view', label: tr('تقارير المبيعات'), icon: TrendingUp },
            { to: '/reports/profit', permission: 'reports.view', label: tr('تقارير الأرباح'), icon: Scale },
            { to: '/reports/stock', permission: 'reports.view', label: tr('تقارير المخزون'), icon: BoxesIcon },
            { to: '/reports/custody', permission: 'reports.view', label: tr('تقارير العهد'), icon: HandCoins },
            { to: '/reports/contracts', permission: 'reports.view', label: tr('تقارير العقود'), icon: ScrollText },
            { to: '/reports/warranties', permission: 'reports.view', label: tr('تقارير الضمانات'), icon: ShieldCheck },
            { to: '/reports/crm', permission: 'reports.view', label: tr('تقارير العملاء المحتملين'), icon: Contact },
            { to: '/reports/hr', permission: 'reports.view', label: tr('تقارير الموارد البشرية'), icon: UserCog },
            { to: '/reports/maintenance', permission: 'reports.view', label: tr('تقارير الصيانة و PPM'), icon: Wrench },
            { to: '/reports/periodic-maintenance', permission: 'reports.view', label: tr('تقرير الصيانة الدورية'), icon: ClipboardList },
            { to: '/reports/custom', permission: 'reports.view', label: tr('التقارير المخصصة'), icon: BadgePercent },
        ],
    },

    /* Technician-only: a flat set, since a technician gets the bottom bar, not
       the grouped sidebar. The office modules above are all admin/manager. */
    { to: '/', label: tr('الرئيسية'), icon: LayoutDashboard, roles: ['technician'] },
    { to: '/tasks', label: tr('المهام'), icon: ClipboardList, roles: ['technician'] },
    { to: '/stock', label: tr('عهدتي'), icon: Package, roles: ['technician'] },
    { to: '/leave', label: tr('الإجازات'), icon: CalendarDays, roles: ['technician'] },
]

/** Star icons the "new" screens keep for their own labels, unused elsewhere. */
export const STAR = Star

/**
 * The human label for a within-area path (e.g. '/soon/site-survey'), so the
 * placeholder page can name the screen the user was reaching for. Searches
 * children first, then parents, and returns undefined for an unknown path.
 */
export function menuLabelForPath(within: string): string | undefined {
    for (const item of NAV) {
        for (const child of item.children ?? []) {
            if (child.to === within) return child.label
        }
        if (item.to === within) return item.label
    }

    return undefined
}

/**
 * Return the permission required by the closest sidebar screen for a path.
 * Detail/edit routes intentionally inherit their list screen's permission.
 */
const ROUTE_PERMISSION_ALIASES: Array<{
    prefix: string
    permission?: string
    anyPermission?: string[]
}> = [
    { prefix: '/sales', anyPermission: ['sales.manage', 'sales.approve', 'invoices.manage'] },
    { prefix: '/purchasing', permission: 'purchasing.manage' },
    { prefix: '/inventory', anyPermission: ['inventory.view', 'inventory.manage'] },
    { prefix: '/warranties', anyPermission: ['warranties.manage', 'assets.manage'] },
    { prefix: '/hr', anyPermission: ['hr.manage', 'payroll.manage'] },
    { prefix: '/accounting', permission: 'accounting.view' },
    { prefix: '/reports', permission: 'reports.view' },
]

export function menuPermissionForPath(within: string): string | string[] | undefined {
    const candidates = NAV.flatMap((item) => item.children ?? [item])
        .filter((entry) => within === entry.to || within.startsWith(`${entry.to}/`))
        .sort((a, b) => b.to.length - a.to.length)

    const match = candidates[0]
    if (match?.permission || match?.anyPermission) {
        return match.permission ?? match.anyPermission
    }

    const alias = ROUTE_PERMISSION_ALIASES
        .filter((entry) => within === entry.prefix || within.startsWith(`${entry.prefix}/`))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0]

    return alias?.permission ?? alias?.anyPermission
}

import {
    ArrowLeftRight,
    Banknote,
    BatteryCharging,
    Bell,
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
    ListChecks,
    MapPin,
    Package,
    PackageMinus,
    PackagePlus,
    Percent,
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
        label: 'الرئيسية',
        icon: LayoutDashboard,
        roles: ['admin', 'manager'],
        children: [
            { to: '/', label: 'لوحة المعلومات', icon: LayoutDashboard },
            { to: '/notifications', label: 'التنبيهات', icon: Bell },
            { to: '/tasks', label: 'المهام المطلوبة', icon: ClipboardList },
        ],
    },

    /* 2 ── CRM — إدارة العملاء ──────────────────────────────── */
    {
        to: '/customers',
        label: 'إدارة العملاء',
        icon: Users,
        roles: ['admin', 'manager'],
        short: 'عملاء',
        children: [
            { to: '/customers', permission: 'customers.manage', label: 'العملاء', icon: Building2 },
            { to: '/contacts', permission: 'customers.manage', label: 'جهات الاتصال', icon: Contact },
            { to: '/crm', permission: 'crm.manage', label: 'فرص البيع (Leads)', icon: Target },
            { to: '/sales/quotations', permission: 'sales.manage', label: 'عروض الأسعار (CRM)', icon: FileText },
            { to: '/customer-followups', permission: 'crm.manage', label: 'متابعة العملاء', icon: CalendarDays },
            { to: '/customer-ledger', permission: 'customers.manage', label: 'سجل تعاملات العميل', icon: FileClock },
            { to: '/site-surveys', permission: 'crm.manage', label: 'معاينة الموقع (Site Survey)', icon: MapPin },
        ],
    },

    /* 3 ── المبيعات ─────────────────────────────────────────── */
    {
        to: '/sales/quotations',
        label: 'المبيعات',
        icon: FileText,
        roles: ['admin', 'manager'],
        short: 'بيع',
        children: [
            { to: '/sales/quotations', permission: 'sales.manage', label: 'عروض الأسعار', icon: FileText },
            { to: '/sales/approvals', permission: 'sales.manage', label: 'اعتماد عروض الأسعار', icon: ClipboardCheck },
            { to: '/sales/orders', permission: 'sales.manage', label: 'أوامر البيع', icon: Receipt },
            { to: '/sales/deliveries', permission: 'sales.manage', label: 'أذون التسليم', icon: Truck },
            { to: '/invoices', permission: 'invoices.manage', label: 'الفواتير', icon: Receipt },
            { to: '/sales/returns', permission: 'sales.manage', label: 'مرتجعات المبيعات', icon: ArrowLeftRight },
            { to: '/collections', permission: 'treasury.manage', label: 'التحصيلات', icon: HandCoins },
            { to: '/customer-statement', permission: 'sales.manage', label: 'كشف حساب العميل', icon: FileClock },
            { to: '/tenders', permission: 'sales.manage', label: 'المناقصات والعطاءات', icon: FileSignature },
        ],
    },

    /* 4 ── إدارة المخزون ───────────────────────────────────── */
    {
        to: '/inventory/items',
        label: 'إدارة المخزون',
        icon: Package,
        roles: ['admin', 'manager'],
        short: 'مخزون',
        children: [
            { to: '/inventory/items', permission: 'inventory.view', label: 'الأصناف', icon: Boxes },
            { to: '/inventory/groups', permission: 'inventory.manage', label: 'المجموعات / الماركات', icon: BoxesIcon },
            { to: '/inventory/warehouses', permission: 'inventory.view', label: 'المخازن', icon: Warehouse },
            { to: '/inventory/movements', permission: 'inventory.view', label: 'إذن استلام', icon: PackagePlus },
            { to: '/inventory/issue', permission: 'inventory.manage', label: 'إذن صرف', icon: PackageMinus },
            { to: '/inventory/transfers', permission: 'inventory.manage', label: 'تحويلات المخازن', icon: ArrowLeftRight },
            { to: '/inventory/stocktake', permission: 'inventory.manage', label: 'الجرد والتسويات', icon: ClipboardCheck },
            { to: '/inventory/serials', permission: 'inventory.view', label: 'الباركود والأرقام التسلسلية', icon: ListChecks },
        ],
    },

    /* 5 ── المشتريات ────────────────────────────────────────── */
    {
        to: '/purchasing/suppliers',
        label: 'المشتريات',
        icon: Truck,
        roles: ['admin', 'manager'],
        short: 'شراء',
        children: [
            { to: '/purchasing/suppliers', permission: 'purchasing.manage', label: 'الموردون', icon: Building2 },
            { to: '/purchasing/requests', permission: 'purchasing.manage', label: 'طلبات الشراء', icon: ClipboardList },
            { to: '/supplier-quotes', permission: 'purchasing.manage', label: 'عروض الموردين', icon: FileText },
            { to: '/purchasing/orders', permission: 'purchasing.manage', label: 'أوامر الشراء', icon: Truck },
            { to: '/soon/purchase-receipt', label: 'استلام المشتريات', icon: PackagePlus },
            { to: '/purchasing/invoices', permission: 'purchasing.manage', label: 'فواتير الموردين', icon: Receipt },
            { to: '/purchasing/returns', permission: 'purchasing.manage', label: 'مرتجعات المشتريات', icon: ArrowLeftRight },
            { to: '/supplier-statement', permission: 'purchasing.manage', label: 'كشف حساب المورد', icon: FileClock },
        ],
    },

    /* 6 ── إدارة العقود ────────────────────────────────────── */
    {
        to: '/contracts',
        label: 'إدارة العقود',
        icon: ScrollText,
        roles: ['admin', 'manager'],
        short: 'عقود',
        children: [
            { to: '/contracts', permission: 'contracts.manage', label: 'عقود العملاء', icon: ScrollText },
            { to: '/soon/amc-contracts', label: 'عقود الصيانة (AMC)', icon: FileSignature },
            { to: '/soon/contract-renewals', label: 'التنبيهات والتجديدات', icon: Repeat },
            { to: '/soon/contract-history', label: 'سجل تعديلات العقد', icon: FileClock },
        ],
    },

    /* 7 ── إدارة الضمانات ──────────────────────────────────── */
    {
        to: '/warranties/register',
        label: 'إدارة الضمانات',
        icon: ShieldCheck,
        roles: ['admin', 'manager'],
        short: 'ضمانات',
        children: [
            { to: '/warranties/register', permission: 'warranties.manage', label: 'تسجيل ضمان', icon: ShieldCheck },
            { to: '/soon/warranty-certificate', label: 'شهادة ضمان', icon: FileSignature },
            { to: '/warranties/claims', permission: 'warranties.manage', label: 'مطالبات الضمان', icon: ClipboardList },
            { to: '/soon/repair-orders', label: 'أوامر الإصلاح', icon: Wrench },
            { to: '/soon/warranty-extend', label: 'استبدال / تمديد ضمان', icon: ShieldPlus },
            { to: '/assets', permission: 'assets.manage', label: 'تاريخ الجهاز', icon: HardDrive },
        ],
    },

    /* 8 ── خدمة العملاء والصيانة ───────────────────────────── */
    {
        to: '/tasks',
        label: 'خدمة العملاء والصيانة',
        icon: Wrench,
        roles: ['admin', 'manager'],
        short: 'صيانة',
        children: [
            { to: '/tasks', label: 'فتح تذكرة / بلاغ', icon: ClipboardList },
            { to: '/soon/work-orders', label: 'أوامر العمل', icon: ClipboardCheck },
            { to: '/technicians', label: 'الفنيون', icon: UserCheck },
            { to: '/soon/service-parts', label: 'قطع الغيار المستخدمة', icon: Wrench },
            { to: '/ppm', permission: 'contracts.manage', label: 'الصيانة الوقائية (PPM)', icon: CalendarDays },
            { to: '/batteries', permission: 'assets.manage', label: 'إدارة البطاريات', icon: BatteryCharging },
            { to: '/satisfaction', permission: 'tasks.dispatch', label: 'رضا العملاء (CSAT)', icon: Smile },
        ],
    },

    /* 10 ── الخزينة ─────────────────────────────────────────── */
    {
        to: '/treasury',
        label: 'الخزينة',
        icon: Wallet,
        roles: ['admin', 'manager'],
        short: 'خزينة',
        children: [
            { to: '/treasury', permission: 'treasury.manage', label: 'الخزائن', icon: Wallet },
            { to: '/soon/receipt-voucher', label: 'سند قبض', icon: HandCoins },
            { to: '/soon/payment-voucher', label: 'سند صرف', icon: Banknote },
            { to: '/soon/treasury-expense', label: 'تحويل خزنة / المصروفات', icon: ArrowLeftRight },
            { to: '/soon/treasury-daybook', label: 'حركة الخزينة اليومية', icon: FileClock },
        ],
    },

    /* 11 ── البنوك ──────────────────────────────────────────── */
    {
        to: '/banks',
        label: 'البنوك',
        icon: Landmark,
        roles: ['admin', 'manager'],
        short: 'بنوك',
        children: [
            { to: '/banks/accounts', permission: 'treasury.manage', label: 'الحسابات البنكية', icon: Landmark },
            { to: '/cheques/incoming', permission: 'cheques.manage', label: 'الشيكات الواردة', icon: Banknote },
            { to: '/cheques/outgoing', permission: 'cheques.manage', label: 'الشيكات الصادرة', icon: Banknote },
            { to: '/banks/reconcile', permission: 'cheques.manage', label: 'التسوية البنكية', icon: Scale },
            { to: '/banks/transfers', permission: 'treasury.manage', label: 'الإيداعات والتحويلات', icon: ArrowLeftRight },
        ],
    },

    /* 12 ── عهد الموظفين ───────────────────────────────────── */
    {
        to: '/inventory/custody',
        label: 'عهد الموظفين',
        icon: HandCoins,
        roles: ['admin', 'manager'],
        short: 'عهد',
        children: [
            { to: '/inventory/custody', permission: 'inventory.manage', label: 'إنشاء وصرف العهدة', icon: HandCoins },
            { to: '/soon/custody-settle', label: 'تسجيل مصروفات / تسوية', icon: ClipboardCheck },
            { to: '/soon/custody-statement', label: 'كشف حساب الموظف', icon: FileClock },
        ],
    },

    /* 13 ── الموارد البشرية ────────────────────────────────── */
    {
        to: '/hr/employees',
        label: 'الموارد البشرية',
        icon: UserCog,
        roles: ['admin', 'manager'],
        short: 'موظفون',
        anyPermission: ['hr.manage', 'payroll.manage'],
        children: [
            { to: '/hr/employees', permission: 'hr.manage', label: 'ملف الموظف', icon: Users },
            { to: '/hr/attendance', permission: 'hr.manage', label: 'الحضور والغياب', icon: CalendarDays },
            { to: '/hr/leave', permission: 'hr.manage', label: 'الإجازات', icon: CalendarDays },
            { to: '/hr/payroll', permission: 'payroll.manage', label: 'مسير الرواتب', icon: Banknote },
            { to: '/hr/advances', permission: 'payroll.manage', label: 'الخصومات والمكافآت', icon: Percent },
        ],
    },

    /* 14 ── المحاسبة المالية ───────────────────────────────── */
    {
        to: '/accounting/accounts',
        label: 'المحاسبة المالية',
        icon: Calculator,
        roles: ['admin', 'manager'],
        short: 'محاسبة',
        children: [
            { to: '/accounting/accounts', permission: 'accounting.view', label: 'دليل الحسابات', icon: ScrollText },
            { to: '/accounting/journal', permission: 'accounting.view', label: 'القيود اليومية', icon: FileText },
            { to: '/accounting/trial-balance', permission: 'accounting.view', label: 'الأستاذ / ميزان المراجعة', icon: Scale },
            { to: '/accounting/income-statement', permission: 'accounting.view', label: 'القوائم المالية', icon: BarChart3 },
        ],
    },

    /* 16 ── الإدارة والصلاحيات ─────────────────────────────── */
    {
        to: '/users',
        label: 'الإدارة والصلاحيات',
        icon: ShieldCheck,
        roles: ['admin'],
        short: 'إدارة',
        children: [
            { to: '/users', permission: 'users.manage', label: 'المستخدمون', icon: Users },
            { to: '/roles', permission: 'users.manage', label: 'الأدوار والصلاحيات', icon: ShieldPlus },
            { to: '/audit', permission: 'audit.view', label: 'سجل العمليات', icon: FileClock },
            { to: '/settings', permission: 'settings.manage', label: 'إعدادات النظام', icon: Settings2 },
        ],
    },

    /* 17 ── التقارير ────────────────────────────────────────── */
    {
        to: '/reports/sales',
        label: 'التقارير',
        icon: BarChart3,
        roles: ['admin', 'manager'],
        short: 'تقارير',
        children: [
            { to: '/reports/sales', permission: 'reports.view', label: 'تقارير المبيعات', icon: TrendingUp },
            { to: '/reports/stock', permission: 'reports.view', label: 'تقارير المخزون', icon: BoxesIcon },
            { to: '/reports/profit', permission: 'reports.view', label: 'تقارير الأرباح والخزينة', icon: Scale },
            { to: '/reports/contracts', permission: 'reports.view', label: 'تقارير العقود والضمانات', icon: ScrollText },
            { to: '/soon/reports-ppm', label: 'تقارير PPM والصيانة', icon: Wrench },
            { to: '/soon/reports-hr', label: 'تقارير الموارد البشرية', icon: UserCog },
            { to: '/soon/reports-custom', label: 'التقارير المخصصة', icon: BadgePercent },
        ],
    },

    /* Technician-only: a flat set, since a technician gets the bottom bar, not
       the grouped sidebar. The office modules above are all admin/manager. */
    { to: '/', label: 'الرئيسية', icon: LayoutDashboard, roles: ['technician'] },
    { to: '/tasks', label: 'المهام', icon: ClipboardList, roles: ['technician'] },
    { to: '/stock', label: 'عهدتي', icon: Package, roles: ['technician'] },
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

import clsx from 'clsx'
import {
    ArrowLeftRight,
    Banknote,
    Bell,
    Boxes,
    Building2,
    Calculator,
    ClipboardList,
    FileText,
    HandCoins,
    HardDrive,
    LayoutDashboard,
    LogOut,
    Package,
    Plus,
    Receipt,
    Scale,
    ScrollText,
    Settings2,
    BarChart3,
    TrendingUp,
    Boxes as BoxesIcon,
    ShieldCheck,
    Truck,
    Users,
    Wallet,
    Warehouse,
    type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useArea } from '@/lib/nav'
import { useNotifications } from '@/lib/queries'
import { syncPushSubscription } from '@/lib/push'
import { NotificationPanel } from '@/components/NotificationPanel'

interface NavItem {
    /** Path within the user's area — prefixed with /tech or /manager at render. */
    to: string
    label: string
    icon: LucideIcon
    /** Roles allowed to see this entry; undefined means everyone. */
    roles?: Array<'admin' | 'manager' | 'technician'>
    /**
     * The permission that opens it. Undefined means the entry is not gated —
     * the dashboard and a technician's own screens.
     */
    permission?: string
    /** Used in the bottom bar, where a long label truncates on a phone. */
    short?: string
    /**
     * Sub-sections. Shown indented under the parent in the sidebar; the bottom
     * bar shows only the parent, since a phone has no room to nest.
     */
    children?: NavItem[]
}

/**
 * Everything reachable from the bar. The profile is deliberately absent —
 * it hangs off the avatar instead, the way a phone app does it.
 */
const NAV: NavItem[] = [
    { to: '/', label: 'الرئيسية', icon: LayoutDashboard },
    { to: '/tasks', label: 'المهام', icon: ClipboardList },
    { to: '/customers', permission: 'customers.manage', label: 'العملاء', icon: Building2, roles: ['admin', 'manager'] },
    {
        to: '/assets',
        permission: 'assets.manage',
        label: 'الأجهزة',
        icon: HardDrive,
        roles: ['admin', 'manager'],
        // Grouped under the device rather than listed beside it: a maintenance
        // contract and a warranty are both promises about a specific unit, and
        // that is how anyone looking for one thinks of it.
        children: [
            { to: '/contracts', permission: 'contracts.manage', label: 'عقود الصيانة', icon: ScrollText },
            { to: '/warranties', permission: 'warranties.manage', label: 'الضمانات', icon: ShieldCheck },
        ],
    },
    {
        to: '/inventory',
        permission: 'inventory.view',
        label: 'المخزون',
        icon: Package,
        roles: ['admin', 'manager'],
        children: [
            { to: '/inventory/items', permission: 'inventory.view', label: 'الأصناف', icon: Boxes },
            { to: '/inventory/warehouses', permission: 'inventory.view', label: 'المخازن', icon: Warehouse },
            { to: '/inventory/custody', permission: 'inventory.manage', label: 'العهد', icon: HandCoins },
            { to: '/inventory/movements', permission: 'inventory.view', label: 'سجل الحركة', icon: ArrowLeftRight },
        ],
    },
    { to: '/sales', permission: 'sales.manage', label: 'المبيعات', icon: FileText, roles: ['admin', 'manager'], short: 'بيع' },
    { to: '/purchasing', permission: 'purchasing.manage', label: 'المشتريات', icon: Truck, roles: ['admin', 'manager'], short: 'شراء' },
    {
        to: '/invoices',
        permission: 'invoices.manage',
        label: 'الفواتير',
        icon: Receipt,
        roles: ['admin', 'manager'],
        short: 'مالية',
        // The money group. The parent is the invoice list itself, so it is not
        // repeated as a child — two rows pointing at one route would both
        // light up. Accounting keeps its own seven-section strip inside.
        children: [
            { to: '/treasury', permission: 'treasury.manage', label: 'الخزينة', icon: Wallet },
            { to: '/cheques', permission: 'cheques.manage', label: 'الشيكات', icon: Banknote },
            { to: '/accounting', permission: 'accounting.view', label: 'المحاسبة المالية', icon: Calculator },
        ],
    },
    {
        to: '/reports',
        permission: 'reports.view',
        label: 'التقارير',
        icon: BarChart3,
        roles: ['admin', 'manager'],
        // Six sections is more than the sidebar should carry flat, and the
        // parent redirects to the first, so it is not repeated as a child.
        children: [
            { to: '/reports/sales', permission: 'reports.view', label: 'المبيعات', icon: TrendingUp },
            { to: '/reports/profit', permission: 'reports.view', label: 'الأرباح', icon: Scale },
            { to: '/reports/stock', permission: 'reports.view', label: 'المخزون', icon: BoxesIcon },
            { to: '/reports/custody', permission: 'reports.view', label: 'العهد', icon: HandCoins },
        ],
    },
    { to: '/stock', label: 'عهدتي', icon: Package, roles: ['technician'] },
    {
        to: '/users',
        permission: 'users.manage',
        label: 'الإدارة',
        icon: Users,
        roles: ['admin'],
        short: 'إدارة',
        children: [
            { to: '/audit', permission: 'audit.view', label: 'سجل العمليات', icon: ScrollText },
            { to: '/settings', permission: 'settings.manage', label: 'بيانات الشركة', icon: Settings2 },
        ],
    },
]

export function AppLayout() {
    const { user, logout, canDispatch, can } = useAuth()
    const { path } = useArea()
    const navigate = useNavigate()
    const location = useLocation()
    const [notificationsOpen, setNotificationsOpen] = useState(false)

    // Re-register the device on every session so a subscription the server
    // lost is restored without the user having to notice anything went wrong.
    useEffect(() => {
        void syncPushSubscription()
    }, [])

    const { data: notifications } = useNotifications()

    const unread = notifications?.meta.unread_count ?? 0
    // Role decides which application you get; the permission decides whether
    // an entry inside it is yours. Children are filtered too, or a parent
    // would open onto a list of things that all refuse you.
    const allowed = (item: NavItem) =>
        (! item.roles || (user && item.roles.includes(user.role))) &&
        (! item.permission || can(item.permission))

    const visibleNav = NAV.filter(allowed).map((item) =>
        item.children ? { ...item, children: item.children.filter(allowed) } : item,
    )

    // Admins carry the whole system in their nav, which is more than a bar can
    // hold without shrinking the labels past reading. They get the sidebar back
    // on wide screens; managers and technicians never do.
    const hasSidebar = user?.role === 'admin'

    // The compose button belongs in the middle of the bar, so the items split
    // around it rather than trailing off one end.
    const mid = Math.ceil(visibleNav.length / 2)
    const barStart = canDispatch ? visibleNav.slice(0, mid) : visibleNav
    const barEnd = canDispatch ? visibleNav.slice(mid) : []

    const handleLogout = async () => {
        await logout()
        navigate('/login')
    }

    return (
        <div className="min-h-dvh bg-navy-50" dir="rtl">
            {/* ══ Admin sidebar (wide screens only) ════════════ */}
            {hasSidebar && (
                <aside className="surface-brand fixed inset-y-0 right-0 z-30 hidden w-72 flex-col lg:flex">
                    <div className="flex items-center gap-3 px-6 py-7">
                        <img src="/brand/logo-mark.png" alt="" className="size-10 object-contain" />
                        <div className="min-w-0">
                            <p className="truncate text-[15px] leading-tight font-extrabold text-white">
                                City Engineering
                            </p>
                            <p className="truncate text-[10px] text-brand-200">
                                Expertise in Standby Energy
                            </p>
                        </div>
                    </div>

                    {/* Scrolls. An admin's nav is now longer than a laptop
                        screen, and without this the last few entries sit below
                        the fold with no way to reach them at all. */}
                    <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-4 pb-4">
                        {visibleNav.map((item) => (
                            <div key={item.to}>
                                <SidebarLink item={item} href={path(item.to)} />

                                {/* Children stay visible rather than collapsing:
                                    the whole point is that the sub-sections are
                                    reachable in one click, not two. */}
                                {item.children && (
                                    <div className="mt-0.5 mr-4 space-y-0.5 border-r border-white/10 pr-2">
                                        {item.children.map((child) => (
                                            <SidebarLink
                                                key={child.to}
                                                item={child}
                                                href={path(child.to)}
                                                nested
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </nav>

                    {canDispatch && (
                        <div className="px-4 pb-5">
                            <Link
                                to={path('/tasks/new')}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500"
                            >
                                <Plus className="size-4" />
                                مهمة جديدة
                            </Link>
                        </div>
                    )}
                </aside>
            )}

            <div className={clsx(hasSidebar && 'lg:mr-72')}>
            {/* ══ Top bar ══════════════════════════════════════ */}
            <header className="safe-top sticky top-0 z-20 border-b border-navy-100 bg-white/90 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
                    {/* Tapping yourself opens your own account — no menu in
                        between, since there is no longer a drawer to open. */}
                    <Link
                        to={path('/profile')}
                        className="tap group flex min-w-0 items-center gap-2.5 rounded-2xl p-1 pl-3 transition hover:bg-navy-50 active:scale-[0.98]"
                    >
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm ring-2 ring-white transition group-hover:shadow-md">
                            {user?.name.charAt(0)}
                        </span>
                        <span className="hidden min-w-0 sm:block">
                            <span className="block truncate text-sm leading-tight font-bold text-navy-900">
                                {user?.name}
                            </span>
                            <span className="block truncate text-[11px] text-navy-400">
                                {user?.role_label}
                            </span>
                        </span>
                    </Link>

                    {/* The wordmark stays on phones too. Hiding it left the header
                        as a bare circle with no indication of whose app this is,
                        which is the one thing a brand mark is there to do. */}
                    {/* The wordmark stays on phones too. Hiding it left the header
                        as a bare circle with no indication of whose app this is,
                        which is the one thing a brand mark is there to do.
                        Sized down at 320px so the name survives whole rather
                        than truncating to "...gineering". */}
                    <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 sm:gap-2">
                        {/* Below 360px the mark yields to the name — between an
                            icon and the words, the words identify the app. */}
                        <img
                            src="/brand/logo-mark.png"
                            alt=""
                            className="hidden size-7 shrink-0 object-contain min-[360px]:block sm:size-8"
                        />
                        <span className="truncate text-[11px] font-extrabold text-navy-900 min-[360px]:text-[13px] sm:text-sm">
                            City Engineering
                        </span>
                    </div>

                    <button
                        onClick={() => setNotificationsOpen(true)}
                        className="tap relative grid shrink-0 place-items-center rounded-xl p-2 text-navy-600 transition hover:bg-navy-100"
                        aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ''}`}
                    >
                        <Bell className="size-5" />
                        {unread > 0 && (
                            <span className="tabular absolute top-1 left-1 grid size-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                {unread > 9 ? '9+' : unread}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={handleLogout}
                        className="tap grid shrink-0 place-items-center rounded-xl p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="تسجيل الخروج"
                    >
                        <LogOut className="size-5" />
                    </button>
                </div>
            </header>

            {/* ══ Content ══════════════════════════════════════ */}
            <main
                key={location.pathname}
                className="animate-in mx-auto max-w-6xl px-4 py-6 pb-32 sm:px-6"
            >
                <Outlet />
            </main>

            {/* ══ Bottom bar ═══════════════════════════════════ */}
            {/* Floating rather than edge-to-edge: it keeps the same shape on a
                phone and on a wide screen, where a full-width strip would read
                as a stray footer. */}
            <nav
                className={clsx(
                    'safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3',
                    hasSidebar && 'lg:hidden',
                )}
            >
                {/* Scrolls rather than squeezes. An admin carries enough
                    destinations to overflow a phone, and a label clipped to
                    "المستخدـ…" is worse than one the thumb has to reach. */}
                <div className="no-scrollbar pointer-events-auto mx-auto flex max-w-lg items-stretch gap-0.5 overflow-x-auto rounded-3xl border border-navy-100 bg-white/95 p-1.5 shadow-[0_8px_30px_rgba(11,27,58,0.16)] backdrop-blur">
                    {barStart.map((item) => (
                        <BottomLink key={item.to} item={item} href={path(item.to)} />
                    ))}

                    {canDispatch && (
                        <Link
                            to={path('/tasks/new')}
                            className="tap flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95"
                            aria-label="مهمة جديدة"
                        >
                            {/* Lifted out of the row so it reads as the one
                                action rather than a fifth destination. */}
                            <span className="grid size-10 -translate-y-1 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30 ring-4 ring-white">
                                <Plus className="size-5" />
                            </span>
                            <span className="-mt-1 text-[10px] leading-none font-bold text-navy-500">
                                جديدة
                            </span>
                        </Link>
                    )}

                    {barEnd.map((item) => (
                        <BottomLink key={item.to} item={item} href={path(item.to)} />
                    ))}
                </div>
            </nav>
            </div>

            <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
        </div>
    )
}

function SidebarLink({
    item,
    href,
    nested = false,
}: {
    item: NavItem
    href: string
    nested?: boolean
}) {
    const Icon = item.icon

    return (
        <NavLink
            to={href}
            // A parent with children would otherwise light up on every child
            // route and leave two rows looking selected at once. Nested items
            // keep prefix matching so a detail page still highlights its
            // section.
            end={item.to === '/' || Boolean(item.children)}
            className={({ isActive }) =>
                clsx(
                    'flex items-center gap-3 rounded-xl font-semibold transition-all',
                    nested ? 'px-3 py-2 text-[13px]' : 'px-4 py-3 text-sm',
                    isActive
                        ? 'bg-white/15 text-white shadow-lg ring-1 ring-white/20'
                        : 'text-brand-100/70 hover:bg-white/10 hover:text-white',
                )
            }
        >
            <Icon className={clsx('shrink-0', nested ? 'size-4' : 'size-4.5')} />
            {item.label}
        </NavLink>
    )
}

function BottomLink({ item, href }: { item: NavItem; href: string }) {
    const Icon = item.icon

    return (
        <NavLink
            to={href}
            end={item.to === '/'}
            className={({ isActive }) =>
                clsx(
                    // The floor is what keeps a label whole; below it the bar
                    // scrolls instead of clipping the text.
                    'tap flex min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition active:scale-95',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-navy-400 hover:bg-navy-50',
                )
            }
        >
            {({ isActive }) => (
                <>
                    <Icon className={clsx('size-5 shrink-0', isActive && 'stroke-[2.5]')} />
                    <span
                        className={clsx(
                            'w-full truncate text-center text-[10px] leading-none',
                            isActive ? 'font-extrabold' : 'font-bold',
                        )}
                    >
                        {item.short ?? item.label}
                    </span>
                </>
            )}
        </NavLink>
    )
}

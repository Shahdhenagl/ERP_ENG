import clsx from 'clsx'
import { Bell, ChevronDown, LogOut, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useArea } from '@/lib/nav'
import { NAV, type NavItem } from '@/lib/menu'
import { useNotifications } from '@/lib/queries'
import { useNotificationAlerts } from '@/lib/useNotificationAlerts'
import { syncPushSubscription } from '@/lib/push'
import { NotificationPanel } from '@/components/NotificationPanel'
import { LanguageToggle } from '@/components/LanguageToggle'
import { tr, useI18n, useT } from '@/lib/i18n'
import { ThemeToggle } from '@/components/ThemeToggle'

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

    // A chime + desktop popup the moment a new one arrives; the bell is untouched.
    useNotificationAlerts()

    const unread = notifications?.meta.unread_count ?? 0
    // Role decides which application you get; the permission decides whether
    // an entry inside it is yours. Children are filtered too, or a parent
    // would open onto a list of things that all refuse you.
    const allowed = (item: NavItem) =>
        (! item.roles || (user && item.roles.includes(user.role))) &&
        (! item.permission || can(item.permission)) &&
        (! item.anyPermission || item.anyPermission.some((p) => can(p)))

    const visibleNav = NAV.flatMap((item) => {
        if (!allowed(item)) return []
        if (!item.children) return [item]

        const children = item.children.filter(allowed)

        // A module with no permitted screen must disappear completely. Keeping
        // the parent made a removed permission look as if the module still
        // existed, even though every child had been filtered out.
        return children.length ? [{ ...item, children }] : []
    })

    /**
     * Who gets the sidebar on a wide screen.
     *
     * A manager's nav is nearly the whole system too — sales, purchasing,
     * stock, contracts, treasury — and a bar cannot hold that without shrinking
     * the labels past reading. Restricting the sidebar to admins left every
     * manager on a desktop using the phone layout: a bottom bar and no way to
     * see where they were in a module.
     *
     * A technician's does not: four destinations, used one-handed in a van, and
     * a bar is the right control for that at any width.
     */
    const hasSidebar = canDispatch

    // The compose button belongs in the middle of the bar, so the items split
    // around it rather than trailing off one end.
    const mid = Math.ceil(visibleNav.length / 2)
    const barStart = canDispatch ? visibleNav.slice(0, mid) : visibleNav
    const barEnd = canDispatch ? visibleNav.slice(mid) : []

    const { dir } = useI18n()

    const handleLogout = async () => {
        await logout()
        navigate('/login')
    }

    return (
        <div className="min-h-dvh bg-navy-50" dir={dir}>
            {/* ══ Office sidebar (wide screens only) ═══════════ */}
            {hasSidebar && (
                <aside className="surface-brand fixed inset-y-0 start-0 z-30 hidden w-72 flex-col lg:flex">
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
                        {visibleNav.map((item) =>
                            item.children?.length ? (
                                <SidebarGroup key={item.to} item={item} path={path} />
                            ) : (
                                <SidebarLink key={item.to} item={item} href={path(item.to)} />
                            ),
                        )}
                    </nav>

                    {canDispatch && (
                        <div className="px-4 pb-5">
                            <Link
                                to={path('/tasks/new')}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500"
                            >
                                <Plus className="size-4" />
                                {tr('مهمة جديدة')}
                            </Link>
                        </div>
                    )}
                </aside>
            )}

            <div className={clsx(hasSidebar && 'lg:ms-72')}>
            {/* ══ Top bar ══════════════════════════════════════ */}
            <header className="safe-top sticky top-0 z-20 border-b border-navy-100 bg-surface/90 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
                    {/* Tapping yourself opens your own account — no menu in
                        between, since there is no longer a drawer to open. */}
                    <Link
                        to={path('/profile')}
                        className="tap group flex min-w-0 items-center gap-2.5 rounded-2xl p-1 pe-3 transition hover:bg-navy-50 active:scale-[0.98]"
                    >
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm ring-2 ring-white transition group-hover:shadow-md">
                            {user?.name.charAt(0)}
                        </span>
                        <span className="hidden min-w-0 sm:block">
                            <span className="block truncate text-sm leading-tight font-bold text-navy-900">
                                {user?.name}
                            </span>
                            <span className="block truncate text-[11px] text-navy-400">
                                {user?.effective_role_label ?? user?.position_label ?? user?.role_label}
                            </span>
                        </span>
                    </Link>

                    {/* The header wordmark, centred. It is the app's only brand
                        mark wherever the sidebar is not — on phones, and for
                        every role but an admin on a wide screen. There the
                        sidebar already carries the name, so the centre mark
                        hides rather than print it twice; the flex spacer stays
                        so the bell and logout keep their end of the bar. */}
                    <div className="flex min-w-0 flex-1 items-center justify-center">
                        <div
                            className={clsx(
                                'flex min-w-0 items-center gap-1.5 sm:gap-2',
                                hasSidebar && 'lg:hidden',
                            )}
                        >
                            {/* Below 360px the mark yields to the name — between
                                an icon and the words, the words identify the app. */}
                            <img
                                src="/brand/logo-mark.png"
                                alt=""
                                className="hidden size-7 shrink-0 object-contain min-[360px]:block sm:size-8"
                            />
                            <span className="truncate text-[11px] font-extrabold text-navy-900 min-[360px]:text-[13px] sm:text-sm">
                                City Engineering
                            </span>
                        </div>
                    </div>

                    <LanguageToggle />

                    <ThemeToggle />

                    <button
                        onClick={() => setNotificationsOpen(true)}
                        className="tap relative grid shrink-0 place-items-center rounded-xl p-2 text-navy-600 transition hover:bg-navy-100"
                        aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ''}`}
                    >
                        <Bell className="size-5" />
                        {unread > 0 && (
                            <span className="tabular absolute top-1 end-1 grid size-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
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
                className="animate-in mx-auto max-w-6xl px-4 py-6 pb-44 sm:px-6 sm:pb-32"
            >
                <Outlet />
            </main>

            {/* ══ Bottom bar ═══════════════════════════════════ */}
            {/* Floating rather than edge-to-edge: it keeps the same shape on a
                phone and on a wide screen, where a full-width strip would read
                as a stray footer. */}
            <nav
                className={clsx(
                    'safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-navy-50 via-navy-50/90 to-transparent px-3 pt-4 pb-3',
                    hasSidebar && 'lg:hidden',
                )}
            >
                {/* Scrolls rather than squeezes. An admin carries enough
                    destinations to overflow a phone, and a label clipped to
                    "المستخدـ…" is worse than one the thumb has to reach. */}
                <div className="no-scrollbar pointer-events-auto mx-auto flex max-w-lg items-stretch gap-0.5 overflow-x-auto rounded-3xl border border-navy-100 bg-surface p-1.5 shadow-[0_8px_30px_rgba(11,27,58,0.16)] backdrop-blur">
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
                                {tr('جديدة')}
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

/**
 * A collapsible group in the sidebar — the header folds its sub-sections away
 * until asked for, so the whole system fits without becoming a wall of links.
 *
 * It opens itself when the page you are on lives inside it, and after that
 * follows your clicks. The header is a toggle, not a link: every destination is
 * a child, so there is no second thing the same row could mean.
 */
function SidebarGroup({ item, path }: { item: NavItem; path: (suffix: string) => string }) {
    const location = useLocation()
    const Icon = item.icon
    const children = item.children ?? []

    const containsActive = children.some((child) => {
        const href = path(child.to)
        return location.pathname === href || location.pathname.startsWith(`${href}/`)
    })

    const t = useT()
    const [open, setOpen] = useState(containsActive)

    useEffect(() => {
        if (containsActive) setOpen(true)
    }, [containsActive])

    return (
        <div>
            <button
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className={clsx(
                    'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
                    containsActive && !open
                        ? 'text-white'
                        : 'text-brand-100/70 hover:bg-white/10 hover:text-white',
                )}
            >
                <Icon className="size-4.5 shrink-0" />
                <span className="flex-1 text-start">{t(item.label)}</span>
                <ChevronDown className={clsx('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
                <div className="mt-0.5 ms-4 space-y-0.5 border-s border-white/10 ps-2">
                    {children.map((child) => (
                        <SidebarLink key={child.to} item={child} href={path(child.to)} nested />
                    ))}
                </div>
            )}
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
    const t = useT()
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
            {t(item.label)}
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

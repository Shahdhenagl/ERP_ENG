import clsx from 'clsx'
import {
    Bell,
    Building2,
    ClipboardList,
    HardDrive,
    LayoutDashboard,
    LogOut,
    Plus,
    Users,
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
}

/**
 * Everything reachable from the bar. The profile is deliberately absent —
 * it hangs off the avatar instead, the way a phone app does it.
 */
const NAV: NavItem[] = [
    { to: '/', label: 'الرئيسية', icon: LayoutDashboard },
    { to: '/tasks', label: 'المهام', icon: ClipboardList },
    { to: '/customers', label: 'العملاء', icon: Building2, roles: ['admin', 'manager'] },
    { to: '/assets', label: 'الأجهزة', icon: HardDrive, roles: ['admin', 'manager'] },
    { to: '/users', label: 'المستخدمون', icon: Users, roles: ['admin'] },
]

export function AppLayout() {
    const { user, logout, canDispatch } = useAuth()
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
    const visibleNav = NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role)))

    const handleLogout = async () => {
        await logout()
        navigate('/login')
    }

    return (
        <div className="min-h-dvh bg-navy-50" dir="rtl">
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

                    <div className="flex flex-1 items-center justify-center gap-2">
                        <img src="/brand/logo-mark.png" alt="" className="size-8 object-contain" />
                        <span className="hidden text-sm font-extrabold text-navy-900 sm:block">
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
            <nav className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3">
                <div className="pointer-events-auto mx-auto flex max-w-lg items-stretch gap-0.5 rounded-3xl border border-navy-100 bg-white/95 p-1.5 shadow-[0_8px_30px_rgba(11,27,58,0.16)] backdrop-blur">
                    {visibleNav.map((item) => (
                        <BottomLink key={item.to} item={item} href={path(item.to)} />
                    ))}

                    {canDispatch && (
                        <Link
                            to={path('/tasks/new')}
                            className="tap flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 transition active:scale-95"
                            aria-label="مهمة جديدة"
                        >
                            <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                                <Plus className="size-4.5" />
                            </span>
                            <span className="text-[10px] font-bold text-navy-500">جديدة</span>
                        </Link>
                    )}
                </div>
            </nav>

            <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
        </div>
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
                    'tap flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition active:scale-95',
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
                        {item.label}
                    </span>
                </>
            )}
        </NavLink>
    )
}

import clsx from 'clsx'
import {
    Bell,
    Building2,
    ClipboardList,
    HardDrive,
    LayoutDashboard,
    LogOut,
    Plus,
    UserCog,
    Users,
    X,
    type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useArea } from '@/lib/nav'
import { useNotifications } from '@/lib/queries'
import { NotificationPanel } from '@/components/NotificationPanel'

interface NavItem {
    /** Path within the user's area — prefixed with /tech or /manager at render. */
    to: string
    label: string
    icon: LucideIcon
    /** Roles allowed to see this entry; undefined means everyone. */
    roles?: Array<'admin' | 'manager' | 'technician'>
    /** Shown in the mobile bottom bar */
    mobile?: boolean
}

const NAV: NavItem[] = [
    { to: '/', label: 'الرئيسية', icon: LayoutDashboard, mobile: true },
    { to: '/tasks', label: 'المهام', icon: ClipboardList, mobile: true },
    { to: '/customers', label: 'العملاء', icon: Building2, roles: ['admin', 'manager'], mobile: true },
    { to: '/assets', label: 'الأجهزة', icon: HardDrive, roles: ['admin', 'manager'] },
    { to: '/users', label: 'المستخدمون', icon: Users, roles: ['admin'] },
    { to: '/profile', label: 'حسابي', icon: UserCog },
]

export function AppLayout() {
    const { user, logout, canDispatch } = useAuth()
    const { path } = useArea()
    const navigate = useNavigate()
    const location = useLocation()
    const [menuOpen, setMenuOpen] = useState(false)
    const [notificationsOpen, setNotificationsOpen] = useState(false)
    const { data: notifications } = useNotifications()

    const unread = notifications?.meta.unread_count ?? 0
    const visibleNav = NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role)))
    const mobileNav = visibleNav.filter((item) => item.mobile)

    const handleLogout = async () => {
        await logout()
        navigate('/login')
    }

    return (
        <div className="min-h-dvh bg-navy-50" dir="rtl">
            {/* ══ Desktop sidebar ══════════════════════════════ */}
            <aside className="surface-brand fixed inset-y-0 right-0 z-30 hidden w-72 flex-col lg:flex">
                <div className="flex items-center gap-3 px-6 py-7">
                    {/* The mark alone — the full lockup bakes in a white plate
                        that reads as a sticker on a dark sidebar. */}
                    <img src="/brand/logo-mark.png" alt="" className="size-10 object-contain" />
                    <div className="min-w-0">
                        <p className="truncate text-[15px] leading-tight font-extrabold text-white">
                            City Engineering
                        </p>
                        <p className="truncate text-[10px] text-brand-200">Expertise in Standby Energy</p>
                    </div>
                </div>

                <nav className="flex-1 space-y-1 px-4">
                    {visibleNav.map((item) => (
                        <SidebarLink key={item.to} item={item} href={path(item.to)} />
                    ))}
                </nav>

                {canDispatch && (
                    <div className="px-4 pb-3">
                        <Link
                            to={path('/tasks/new')}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500"
                        >
                            <Plus className="size-4" />
                            مهمة جديدة
                        </Link>
                    </div>
                )}

                <div className="border-t border-white/10 p-4">
                    <div className="flex items-center gap-3">
                        <Link
                            to={path('/profile')}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition hover:bg-white/10"
                        >
                            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
                                {user?.name.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-white">{user?.name}</p>
                                <p className="truncate text-[11px] text-brand-200">{user?.role_label}</p>
                            </div>
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="tap grid place-items-center rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                            aria-label="تسجيل الخروج"
                        >
                            <LogOut className="size-4" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* ══ Mobile drawer ════════════════════════════════ */}
            {menuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="absolute inset-0 bg-navy-950/60"
                        onClick={() => setMenuOpen(false)}
                    />
                    <aside className="surface-brand animate-in absolute inset-y-0 right-0 flex w-72 flex-col">
                        <div className="safe-top flex items-start justify-between px-5 pt-5 pb-4">
                            {/* Opened from the avatar, so it leads with who you are
                                rather than repeating the brand mark. */}
                            <Link
                                to={path('/profile')}
                                onClick={() => setMenuOpen(false)}
                                className="flex min-w-0 items-center gap-3"
                            >
                                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-base font-bold text-white">
                                    {user?.name.charAt(0)}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-bold text-white">
                                        {user?.name}
                                    </span>
                                    <span className="block truncate text-[11px] text-brand-200">
                                        {user?.role_label}
                                    </span>
                                </span>
                            </Link>
                            <button
                                onClick={() => setMenuOpen(false)}
                                className="tap -mt-1 grid place-items-center rounded-lg p-2 text-white/60"
                                aria-label="إغلاق"
                            >
                                <X className="size-5" />
                            </button>
                        </div>

                        <nav className="flex-1 space-y-1 px-4" onClick={() => setMenuOpen(false)}>
                            {visibleNav.map((item) => (
                                <SidebarLink key={item.to} item={item} href={path(item.to)} />
                            ))}
                        </nav>

                        <div className="border-t border-white/10 p-4">
                            <button
                                onClick={handleLogout}
                                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                            >
                                <LogOut className="size-4" />
                                تسجيل الخروج
                            </button>
                        </div>
                    </aside>
                </div>
            )}

            {/* ══ Main column ══════════════════════════════════ */}
            <div className="lg:mr-72">
                <header className="safe-top sticky top-0 z-20 border-b border-navy-100 bg-white">
                    <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
                        {/* The avatar is the menu. A hamburger is a web convention;
                            a phone app puts your own face in that corner. */}
                        <button
                            onClick={() => setMenuOpen(true)}
                            className="tap grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white transition active:scale-95 lg:hidden"
                            aria-label="الحساب والقائمة"
                        >
                            {user?.name.charAt(0)}
                        </button>

                        <div className="flex min-w-0 items-center gap-2 lg:hidden">
                            <img src="/brand/logo-mark.png" alt="" className="size-8 object-contain" />
                            <span className="truncate text-sm font-extrabold text-navy-900">
                                City Engineering
                            </span>
                        </div>

                        <div className="flex-1" />

                        <button
                            onClick={() => setNotificationsOpen(true)}
                            className="tap relative grid place-items-center rounded-xl p-2 text-navy-600 transition hover:bg-navy-100"
                            aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ''}`}
                        >
                            <Bell className="size-5" />
                            {unread > 0 && (
                                <span className="tabular absolute top-1 left-1 grid size-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                    {unread > 9 ? '9+' : unread}
                                </span>
                            )}
                        </button>
                    </div>
                </header>

                <main
                    key={location.pathname}
                    className="animate-in mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 lg:pb-10"
                >
                    <Outlet />
                </main>
            </div>

            {/* ══ Mobile bottom bar ════════════════════════════ */}
            <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-navy-100 bg-white lg:hidden">
                <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
                    {mobileNav.map((item) => (
                        <BottomLink key={item.to} item={item} href={path(item.to)} />
                    ))}

                    {canDispatch && (
                        <NavLink
                            to={path('/tasks/new')}
                            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-navy-400"
                        >
                            <span className="grid size-8 place-items-center rounded-xl bg-brand-600 text-white">
                                <Plus className="size-4.5" />
                            </span>
                            <span className="text-[10px] font-bold">جديدة</span>
                        </NavLink>
                    )}
                </div>
            </nav>

            <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
        </div>
    )
}

function SidebarLink({ item, href }: { item: NavItem; href: string }) {
    const Icon = item.icon

    return (
        <NavLink
            to={href}
            end={item.to === '/'}
            className={({ isActive }) =>
                clsx(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
                    isActive
                        ? 'bg-white/15 text-white shadow-lg ring-1 ring-white/20'
                        : 'text-brand-100/70 hover:bg-white/10 hover:text-white',
                )
            }
        >
            <Icon className="size-4.5 shrink-0" />
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
                    'flex flex-1 flex-col items-center gap-1 py-2.5 transition',
                    isActive ? 'text-brand-600' : 'text-navy-400',
                )
            }
        >
            {({ isActive }) => (
                <>
                    <span
                        className={clsx(
                            'grid size-8 place-items-center rounded-xl transition',
                            isActive && 'bg-brand-50',
                        )}
                    >
                        <Icon className="size-4.5" />
                    </span>
                    <span className="text-[10px] font-bold">{item.label}</span>
                </>
            )}
        </NavLink>
    )
}

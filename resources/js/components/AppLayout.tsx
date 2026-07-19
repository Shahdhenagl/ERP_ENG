import clsx from 'clsx'
import {
    Bell,
    Building2,
    ClipboardList,
    LayoutDashboard,
    LogOut,
    Menu,
    Plus,
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
    { to: '/users', label: 'المستخدمون', icon: Users, roles: ['admin'] },
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
                <div className="flex items-center gap-3 px-6 py-6">
                    <img
                        src="/brand/logo.png"
                        alt="City Engineering"
                        className="size-11 rounded-xl bg-white/95 object-contain p-1"
                    />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-white">City Engineering</p>
                        <p className="truncate text-[11px] text-brand-200">Expertise in Standby Energy</p>
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
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20"
                        >
                            <Plus className="size-4" />
                            مهمة جديدة
                        </Link>
                    </div>
                )}

                <div className="border-t border-white/10 p-4">
                    <div className="flex items-center gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/20 text-sm font-bold text-brand-200 ring-1 ring-white/10">
                            {user?.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">{user?.name}</p>
                            <p className="truncate text-[11px] text-brand-200">{user?.role_label}</p>
                        </div>
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
                        className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
                        onClick={() => setMenuOpen(false)}
                    />
                    <aside className="surface-brand animate-in absolute inset-y-0 right-0 flex w-72 flex-col">
                        <div className="flex items-center justify-between px-5 py-5">
                            <div className="flex items-center gap-3">
                                <img
                                    src="/brand/logo.png"
                                    alt=""
                                    className="size-10 rounded-xl bg-white/95 object-contain p-1"
                                />
                                <p className="text-sm font-extrabold text-white">City Engineering</p>
                            </div>
                            <button
                                onClick={() => setMenuOpen(false)}
                                className="tap grid place-items-center rounded-lg p-2 text-white/60"
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
                <header className="safe-top sticky top-0 z-20 border-b border-navy-100 bg-white/85 backdrop-blur-lg">
                    <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
                        <button
                            onClick={() => setMenuOpen(true)}
                            className="tap grid place-items-center rounded-xl p-2 text-navy-600 transition hover:bg-navy-100 lg:hidden"
                            aria-label="القائمة"
                        >
                            <Menu className="size-5" />
                        </button>

                        <img
                            src="/brand/logo.png"
                            alt=""
                            className="size-9 rounded-lg object-contain lg:hidden"
                        />

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
            <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-navy-100 bg-white/95 backdrop-blur-lg lg:hidden">
                <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
                    {mobileNav.map((item) => (
                        <BottomLink key={item.to} item={item} href={path(item.to)} />
                    ))}

                    {canDispatch && (
                        <NavLink
                            to={path('/tasks/new')}
                            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-navy-400"
                        >
                            <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-l from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30">
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

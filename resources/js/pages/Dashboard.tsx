import clsx from 'clsx'
import {
    AlertTriangle,
    Building2,
    CalendarCheck,
    ClipboardList,
    Inbox,
    TrendingUp,
    UserX,
    Users,
    type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { TaskCard } from '@/components/TaskCard'
import { EmptyState, ErrorState, PageHeader, SkeletonCard } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { STATUS, STATUS_FLOW } from '@/lib/domain'
import { useArea } from '@/lib/nav'
import { useDashboard } from '@/lib/queries'

export function Dashboard() {
    const { user, canDispatch } = useAuth()
    const { path } = useArea()
    const { data, isLoading, isError, refetch } = useDashboard()

    if (isError) {
        return <ErrorState message="تعذّر تحميل لوحة المعلومات." onRetry={() => void refetch()} />
    }

    const stats = data?.stats

    return (
        <>
            <PageHeader
                title={`أهلاً، ${user?.name.split(' ')[0]}`}
                subtitle={
                    canDispatch
                        ? 'نظرة عامة على العمليات الجارية'
                        : 'مهامك الحالية ومواعيدها'
                }
            />

            {/* ── Headline numbers ───────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatTile
                    icon={ClipboardList}
                    label="مهام مفتوحة"
                    value={stats?.open_total}
                    loading={isLoading}
                    tone="brand"
                    to={path('/tasks?open_only=1')}
                />
                <StatTile
                    icon={CalendarCheck}
                    label="منتهية اليوم"
                    value={stats?.completed_today}
                    loading={isLoading}
                    tone="emerald"
                />
                <StatTile
                    icon={AlertTriangle}
                    label="متأخرة"
                    value={stats?.overdue}
                    loading={isLoading}
                    tone={stats?.overdue ? 'red' : 'slate'}
                />
                {canDispatch ? (
                    <StatTile
                        icon={UserX}
                        label="بدون فني"
                        value={stats?.unassigned}
                        loading={isLoading}
                        tone={stats?.unassigned ? 'amber' : 'slate'}
                    />
                ) : (
                    <StatTile
                        icon={TrendingUp}
                        label="منتهية هذا الشهر"
                        value={stats?.completed_this_month}
                        loading={isLoading}
                        tone="navy"
                    />
                )}
            </div>

            {/* ── Status breakdown ───────────────────────────── */}
            <section className="mt-6">
                <h2 className="mb-3 text-sm font-bold text-navy-700">توزيع المهام حسب الحالة</h2>
                <div className="card overflow-hidden p-4">
                    {isLoading ? (
                        <div className="shimmer h-6 rounded-lg" />
                    ) : (
                        <StatusBar counts={stats?.by_status} />
                    )}
                </div>
            </section>

            {/* ── Technician workload (dispatchers only) ─────── */}
            {canDispatch && stats?.technician_load && stats.technician_load.length > 0 && (
                <section className="mt-6">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-navy-700">حِمل العمل على الفنيين</h2>
                        <Link to={path('/users')} className="text-xs font-bold text-brand-600 hover:underline">
                            كل المستخدمين
                        </Link>
                    </div>

                    <div className="card divide-y divide-navy-100">
                        {stats.technician_load.map((technician) => {
                            const max = Math.max(...stats.technician_load!.map((t) => t.open_count), 1)
                            const width = (technician.open_count / max) * 100

                            return (
                                <div key={technician.id} className="flex items-center gap-4 p-4">
                                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-navy-50 text-sm font-bold text-navy-600">
                                        {technician.name.charAt(0)}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-navy-900">
                                            {technician.name}
                                        </p>
                                        {technician.job_title && (
                                            <p className="truncate text-xs text-navy-400">
                                                {technician.job_title}
                                            </p>
                                        )}
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-l from-brand-600 to-brand-400 transition-all"
                                                style={{ width: `${width}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="shrink-0 text-left">
                                        <p className="tabular text-lg font-extrabold text-navy-900">
                                            {technician.open_count}
                                        </p>
                                        <p className="text-[10px] font-semibold text-navy-400">مفتوحة</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* ── Secondary counts ───────────────────────────── */}
            {canDispatch && (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
                    <StatTile
                        icon={Building2}
                        label="العملاء"
                        value={stats?.customers_total}
                        loading={isLoading}
                        tone="navy"
                        to={path('/customers')}
                    />
                    <StatTile
                        icon={Users}
                        label="الفنيون"
                        value={stats?.technicians_total}
                        loading={isLoading}
                        tone="navy"
                    />
                </div>
            )}

            {/* ── What needs attention now ───────────────────── */}
            <section className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-navy-700">
                        {canDispatch ? 'الأقرب تنفيذًا' : 'مهامك القادمة'}
                    </h2>
                    <Link to={path('/tasks')} className="text-xs font-bold text-brand-600 hover:underline">
                        عرض الكل
                    </Link>
                </div>

                {isLoading ? (
                    <div className="space-y-3">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                ) : !data?.upcoming.length ? (
                    <EmptyState
                        icon={Inbox}
                        title="لا توجد مهام مفتوحة"
                        description={
                            canDispatch
                                ? 'كل المهام منتهية — أو لم يتم إنشاء مهام بعد.'
                                : 'لا توجد مهام مسندة إليك حاليًا.'
                        }
                    />
                ) : (
                    <div className="space-y-3">
                        {data.upcoming.map((task) => (
                            <TaskCard key={task.id} task={task} showTechnician={canDispatch} />
                        ))}
                    </div>
                )}
            </section>
        </>
    )
}

/* ── Pieces ──────────────────────────────────────────────── */

const TONES = {
    brand: 'from-brand-500 to-brand-600 text-white shadow-brand-500/25',
    emerald: 'from-emerald-500 to-emerald-600 text-white shadow-emerald-500/25',
    red: 'from-red-500 to-red-600 text-white shadow-red-500/25',
    amber: 'from-amber-500 to-amber-600 text-white shadow-amber-500/25',
    navy: 'from-navy-700 to-navy-900 text-white shadow-navy-700/25',
    slate: 'from-navy-100 to-navy-200 text-navy-500 shadow-navy-200/40',
}

interface StatTileProps {
    icon: LucideIcon
    label: string
    value: number | undefined
    loading: boolean
    tone: keyof typeof TONES
    to?: string
}

function StatTile({ icon: Icon, label, value, loading, tone, to }: StatTileProps) {
    const content = (
        <div className="card flex items-center gap-3 p-4 transition-all hover:shadow-[var(--shadow-card-hover)]">
            <span
                className={clsx(
                    'grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-lg',
                    TONES[tone],
                )}
            >
                <Icon className="size-5" />
            </span>

            <div className="min-w-0">
                {loading ? (
                    <div className="shimmer h-7 w-12 rounded-md" />
                ) : (
                    <p className="tabular text-2xl leading-none font-extrabold text-navy-900">
                        {value ?? 0}
                    </p>
                )}
                <p className="mt-1 truncate text-xs font-semibold text-navy-400">{label}</p>
            </div>
        </div>
    )

    return to ? <Link to={to}>{content}</Link> : content
}

function StatusBar({ counts }: { counts?: Record<string, number> }) {
    if (!counts) return null

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

    if (total === 0) {
        return <p className="py-2 text-center text-sm text-navy-400">لا توجد مهام بعد</p>
    }

    const order = [...STATUS_FLOW, 'cancelled' as const]

    return (
        <div className="space-y-3">
            <div className="flex h-3 overflow-hidden rounded-full bg-navy-100">
                {order.map((status) => {
                    const count = counts[status] ?? 0

                    if (!count) return null

                    return (
                        <div
                            key={status}
                            className={clsx('h-full transition-all', STATUS[status].solid)}
                            style={{ width: `${(count / total) * 100}%` }}
                            title={`${STATUS[status].label}: ${count}`}
                        />
                    )
                })}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2">
                {order.map((status) => {
                    const count = counts[status] ?? 0

                    if (!count) return null

                    return (
                        <span key={status} className="flex items-center gap-1.5 text-xs">
                            <span className={clsx('size-2.5 rounded-full', STATUS[status].solid)} />
                            <span className="font-semibold text-navy-600">{STATUS[status].label}</span>
                            <span className="tabular font-bold text-navy-900">{count}</span>
                        </span>
                    )
                })}
            </div>
        </div>
    )
}

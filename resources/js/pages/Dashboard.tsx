import clsx from 'clsx'
import {
    AlertTriangle,
    Building2,
    CalendarCheck,
    CalendarClock,
    ClipboardList,
    Inbox,
    Plus,
    Receipt,
    TrendingUp,
    UserX,
    Users,
    Wallet,
    type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CustodyExpenseModal } from '@/components/CustodyExpenseModal'
import { TaskCard } from '@/components/TaskCard'
import { Button, EmptyState, ErrorState, PageHeader, SkeletonCard } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { formatMoney, STATUS, STATUS_FLOW } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useDashboard, useMyCustody } from '@/lib/queries'

export function Dashboard() {
    const { user, canDispatch, can } = useAuth()
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

            {/* ── My custody (technicians) ───────────────────── */}
            {!canDispatch && <MyCustodyCard />}

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
                        to={can('customers.manage') ? path('/customers') : undefined}
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

            {/* ── Contract visits waiting for a technician ───── */}
            {/* The reason contracts exist: a signed schedule is worthless if
                nobody is told the date has come round. */}
            {canDispatch && Boolean(data?.maintenance_due?.length) && (
                <section className="mt-8">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-navy-700">
                            <CalendarClock className="size-4 text-brand-600" />
                            زيارات صيانة تنتظر الإسناد
                        </h2>
                        <Link
                            to={path('/contracts')}
                            className="text-xs font-bold text-brand-600 hover:underline"
                        >
                            العقود
                        </Link>
                    </div>

                    <div className="space-y-3">
                        {data?.maintenance_due?.map((task) => (
                            <TaskCard key={task.id} task={task} showTechnician={false} />
                        ))}
                    </div>
                </section>
            )}

            {/* ── Cover running out ──────────────────────────── */}
            {/* Each of these is money waiting to be asked for: a renewal or an
                extension sold before the customer feels uncovered, not after.
                Gated by the permission that opens the module it links to, so an
                office user who cannot see contracts is not shown their list. */}
            {can('contracts.manage') && Boolean(data?.contracts_expiring?.length) && (
                <ExpiryAlert
                    title="عقود قاربت على الانتهاء"
                    tone="amber"
                    linkTo={path('/contracts')}
                    linkLabel="العقود"
                    rows={data!.contracts_expiring!.map((contract) => ({
                        id: `c-${contract.id}`,
                        title: contract.customer?.name ?? contract.label,
                        subtitle: contract.code,
                        endsOn: contract.ends_on,
                        daysRemaining: contract.days_remaining,
                    }))}
                />
            )}

            {can('warranties.manage') && Boolean(data?.warranties_expiring?.length) && (
                <ExpiryAlert
                    title="ضمانات قاربت على الانتهاء"
                    tone="violet"
                    linkTo={path('/warranties')}
                    linkLabel="الضمانات"
                    rows={data!.warranties_expiring!.map((warranty) => ({
                        id: `w-${warranty.id}`,
                        title: `${warranty.asset_code} · ${warranty.asset ?? ''}`,
                        subtitle: `${warranty.customer ?? ''} · ${warranty.code}`,
                        endsOn: warranty.ends_on,
                        daysRemaining: warranty.days_remaining,
                    }))}
                />
            )}

            {/* Someone you promised to get back to, past the date. Gated by the
                CRM permission, like the alerts above are by their modules'. */}
            {can('crm.manage') && Boolean(data?.follow_ups_due?.length) && (
                <section className="mt-8">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-navy-700">
                            <AlertTriangle className="size-4 text-red-600" />
                            متابعات فات موعدها
                        </h2>
                        <Link to={path('/crm')} className="text-xs font-bold text-brand-600 hover:underline">
                            المتابعات
                        </Link>
                    </div>

                    <div className="space-y-2">
                        {data!.follow_ups_due!.map((followUp) => (
                            <Link
                                key={followUp.id}
                                to={path('/crm')}
                                className="card-interactive flex items-center justify-between gap-3 p-3.5"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-navy-900">
                                        {followUp.subject ?? '—'}
                                    </p>
                                    <p className="tabular truncate text-[11px] text-navy-400">
                                        {followUp.type_label}
                                        {followUp.due_at && ` · ${followUp.due_at}`}
                                        {followUp.owner && ` · ${followUp.owner}`}
                                    </p>
                                </div>
                                <span className="badge shrink-0 bg-red-50 text-red-700">متأخّر</span>
                            </Link>
                        ))}
                    </div>
                </section>
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

/** The technician's own float: balance up front, a way to log an expense, and
 *  the last few they recorded. */
function MyCustodyCard() {
    const { data, isLoading } = useMyCustody()
    const [spending, setSpending] = useState(false)

    if (isLoading || !data) return <div className="mt-6 shimmer h-24 rounded-2xl" />

    const balance = data.cash.balance
    const expenses = data.expenses ?? []

    return (
        <section className="mt-6">
            <div className="card p-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                            <Wallet className="size-5" />
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-navy-400">رصيد العهدة النقدية</p>
                            <p className={clsx('tabular text-2xl font-extrabold', balance < 0 ? 'text-red-700' : 'text-navy-900')}>
                                {formatMoney(balance)}
                            </p>
                        </div>
                    </div>

                    <Button icon={Plus} onClick={() => setSpending(true)}>
                        تسجيل مصروف
                    </Button>
                </div>

                {balance < 0 && (
                    <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                        عهدتك بالسالب {formatMoney(balance)} — صرفت أكثر من عهدتك، والفرق مستحق لك من الإدارة.
                    </p>
                )}

                {expenses.length > 0 && (
                    <div className="mt-4 border-t border-navy-100 pt-3">
                        <p className="mb-2 text-[11px] font-bold text-navy-400">آخر المصروفات</p>
                        <div className="space-y-1.5">
                            {expenses.slice(0, 4).map((expense) => (
                                <div key={expense.id} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="flex min-w-0 items-center gap-2 text-navy-700">
                                        <Receipt className="size-3.5 shrink-0 text-navy-300" />
                                        <span className="truncate">{expense.category ?? 'مصروف'}</span>
                                        <span className="tabular shrink-0 text-[10px] text-navy-400">
                                            {formatDate(expense.created_at)}
                                        </span>
                                    </span>
                                    <span className="tabular shrink-0 font-bold text-navy-900">
                                        {formatMoney(expense.amount)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {spending && <CustodyExpenseModal balance={balance} onClose={() => setSpending(false)} />}
        </section>
    )
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

/** Amber as a term runs down, red once it has. Same chip as the reports use. */
function daysChip(days: number): string {
    if (days < 0) return 'bg-red-50 text-red-700'
    if (days <= 30) return 'bg-amber-50 text-amber-700'

    return 'bg-emerald-50 text-emerald-700'
}

interface ExpiryRow {
    id: string
    title: string
    subtitle: string
    endsOn: string | null
    daysRemaining: number
}

function ExpiryAlert({
    title,
    tone,
    linkTo,
    linkLabel,
    rows,
}: {
    title: string
    tone: 'amber' | 'violet'
    linkTo: string
    linkLabel: string
    rows: ExpiryRow[]
}) {
    const accent = tone === 'amber' ? 'text-amber-600' : 'text-violet-600'

    return (
        <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-navy-700">
                    <AlertTriangle className={clsx('size-4', accent)} />
                    {title}
                </h2>
                <Link to={linkTo} className="text-xs font-bold text-brand-600 hover:underline">
                    {linkLabel}
                </Link>
            </div>

            <div className="space-y-2">
                {rows.map((row) => (
                    <Link
                        key={row.id}
                        to={linkTo}
                        className="card-interactive flex items-center justify-between gap-3 p-3.5"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-navy-900">{row.title}</p>
                            <p className="tabular truncate text-[11px] text-navy-400">
                                {row.subtitle}
                            </p>
                        </div>

                        <span
                            className={clsx(
                                'badge shrink-0',
                                daysChip(row.daysRemaining),
                            )}
                        >
                            {row.daysRemaining >= 0
                                ? `باقٍ ${row.daysRemaining} يوم`
                                : `انتهى منذ ${Math.abs(row.daysRemaining)} يوم`}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    )
}

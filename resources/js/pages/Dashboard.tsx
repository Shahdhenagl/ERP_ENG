import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import {
    AlertTriangle,
    Building2,
    CalendarCheck,
    CalendarClock,
    ClipboardList,
    Clock,
    Inbox,
    LogIn,
    LogOut,
    MapPin,
    TrendingUp,
    UserX,
    Users,
    type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { OperationsOverview } from '@/pages/OperationsDashboard'
import { TaskCard } from '@/components/TaskCard'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, ErrorState, PageHeader, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatMoney, STATUS, STATUS_FLOW } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { currentPosition } from '@/lib/geo'
import { useArea } from '@/lib/nav'
import {
    useAttendancePunch,
    useDashboard,
    useMyAttendanceToday,
} from '@/lib/queries'
import type { DashboardData } from '@/types'

export function Dashboard() {
    const now = new Date()
    const [monthStr, setMonthStr] = useState(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    )
    const [year, month] = monthStr.split('-').map(Number)

    const { data, isLoading, isError, refetch } = useDashboard({ year, month })

    if (isError) {
        return <ErrorState message={tr('تعذّر تحميل لوحة المعلومات.')} onRetry={() => void refetch()} />
    }

    const stats = data?.stats

    return (
        <>
            <PageHeader
                title={`${tr('أهلاً')}، ${user?.name.split(' ')[0]}`}
                subtitle={
                    canDispatch
                        ? tr('نظرة عامة على العمليات الجارية')
                        : tr('مهامك الحالية ومواعيدها')
                }
                action={
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-navy-100 shadow-sm">
                        <span className="text-xs font-semibold text-navy-600">{tr('تصفح الشهر')}:</span>
                        <input
                            type="month"
                            value={monthStr}
                            onChange={(e) => e.target.value && setMonthStr(e.target.value)}
                            className="text-xs font-bold text-brand-600 bg-transparent border-0 focus:ring-0 p-0 cursor-pointer"
                        />
                    </div>
                }
            />

            {/* ── Headline numbers ───────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatTile
                    icon={ClipboardList}
                    label={tr('مهام مفتوحة')}
                    value={stats?.open_total}
                    loading={isLoading}
                    tone="brand"
                    to={path('/tasks?open_only=1')}
                />
                <StatTile
                    icon={CalendarCheck}
                    label={tr('منتهية اليوم')}
                    value={stats?.completed_today}
                    loading={isLoading}
                    tone="emerald"
                />
                <StatTile
                    icon={AlertTriangle}
                    label={tr('متأخرة')}
                    value={stats?.overdue}
                    loading={isLoading}
                    tone={stats?.overdue ? 'red' : 'slate'}
                />
                {canDispatch ? (
                    <StatTile
                        icon={UserX}
                        label={tr('بدون فني')}
                        value={stats?.unassigned}
                        loading={isLoading}
                        tone={stats?.unassigned ? 'amber' : 'slate'}
                    />
                ) : (
                    <StatTile
                        icon={TrendingUp}
                        label={tr('منتهية هذا الشهر')}
                        value={stats?.completed_this_month}
                        loading={isLoading}
                        tone="navy"
                    />
                )}
            </div>

            {/* ── Attendance & custody (technicians) ─────────── */}
            {!canDispatch && <AttendanceCard />}

            {/* ── Field attendance today (dispatchers) ───────── */}
            {canDispatch && Boolean(data?.attendance_today?.length) && (
                <AttendanceToday rows={data!.attendance_today!} stats={stats} />
            )}

            {/* ── Status breakdown ───────────────────────────── */}
            <section className="mt-6">
                <h2 className="mb-3 text-sm font-bold text-navy-700">{tr('توزيع المهام حسب الحالة')}</h2>
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
                        <h2 className="text-sm font-bold text-navy-700">{tr('حِمل العمل على الفنيين')}</h2>
                        <Link to={path('/users')} className="text-xs font-bold text-brand-600 hover:underline">
                            {tr('كل المستخدمين')}
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
                                        <p className="text-[10px] font-semibold text-navy-400">{tr('مفتوحة')}</p>
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
                        label={tr('العملاء')}
                        value={stats?.customers_total}
                        loading={isLoading}
                        tone="navy"
                        to={can('customers.manage') ? path('/customers') : undefined}
                    />
                    <StatTile
                        icon={Users}
                        label={tr('الفنيون')}
                        value={stats?.technicians_total}
                        loading={isLoading}
                        tone="navy"
                    />
                </div>
            )}

            {/* ── The estate overview (was the separate operations board) ── */}
            {canDispatch && (
                <section className="mt-8">
                    <h2 className="mb-3 text-sm font-bold text-navy-700">{tr('نظرة على المنشأة')}</h2>
                    <OperationsOverview />
                </section>
            )}

            {/* ── Standing alerts: what needs an action now ──── */}
            {canDispatch &&
                Boolean(
                    data?.low_stock?.length ||
                        data?.delayed_tasks?.length ||
                        data?.overdue_invoices?.length ||
                        data?.pending_approvals?.length ||
                        data?.contracts_expiring?.length,
                ) && (
                    <section className="mt-8">
                        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-700">
                            <AlertTriangle className="size-4 text-amber-600" />
                            {tr('تنبيهات تحتاج إجراء')}
                        </h2>

                        <div className="grid gap-4 lg:grid-cols-3">
                            {(can('inventory.view') || can('inventory.manage')) &&
                                Boolean(data?.low_stock?.length) && (
                                    <AlertColumn
                                        title={tr('نواقص المخزون')}
                                        count={stats?.low_stock}
                                        tone="amber"
                                        to={path('/inventory')}
                                        rows={data!.low_stock!.map((i) => ({
                                            key: `s-${i.id}`,
                                            title: i.name,
                                            subtitle: `${tr('المتاح')} ${i.qty} ${tr(i.unit)} · ${tr('حد الطلب')} ${i.reorder_level}`,
                                        }))}
                                    />
                                )}

                            {Boolean(data?.pending_approvals?.length) && (
                                <AlertColumn
                                    title={tr('عروض بانتظار الاعتماد')}
                                    count={stats?.pending_approvals}
                                    tone="amber"
                                    to={path('/sales/approvals')}
                                    rows={data!.pending_approvals!.map((q) => ({
                                        key: `q-${q.id}`,
                                        to: `${path('/sales/approvals')}?quote=${q.id}`,
                                        title: q.customer ?? q.title ?? q.code,
                                        subtitle: `${q.code} · ${formatMoney(q.total)}`,
                                    }))}
                                />
                            )}

                            {Boolean(data?.delayed_tasks?.length) && (
                                <AlertColumn
                                    title={tr('مهام متأخرة عن الوقت')}
                                    count={stats?.delayed}
                                    tone="red"
                                    to={path('/tasks?open_only=1')}
                                    rows={data!.delayed_tasks!.map((t) => ({
                                        key: `t-${t.id}`,
                                        to: path(`/tasks/${t.id}`),
                                        title: t.customer ?? t.title ?? t.code,
                                        subtitle: t.code,
                                    }))}
                                />
                            )}

                            {(can('invoices.manage') || can('treasury.manage')) &&
                                Boolean(data?.overdue_invoices?.length) && (
                                    <AlertColumn
                                        title={tr('فواتير متأخرة السداد')}
                                        count={stats?.overdue_invoices}
                                        tone="red"
                                        to={path('/invoices')}
                                        rows={data!.overdue_invoices!.map((i) => ({
                                            key: `i-${i.id}`,
                                            to: path(`/invoices/${i.id}`),
                                            title: i.customer ?? i.code,
                                            subtitle: `${i.code} · ${formatMoney(i.balance)}`,
                                        }))}
                                    />
                                )}

                            {Boolean(data?.contracts_expiring?.length) && (
                                <AlertColumn
                                    title={tr('عقود قاربت على الانتهاء')}
                                    count={stats?.contracts_expiring}
                                    tone="amber"
                                    to={path('/contracts')}
                                    rows={data!.contracts_expiring!.map((c) => ({
                                        key: `c-${c.id}`,
                                        to: path(`/contracts/${c.id}`),
                                        title: c.customer?.name ?? c.label ?? c.code,
                                        subtitle: `${c.code} · ${
                                            c.days_remaining != null
                                                ? `${tr('يتبقى')} ${c.days_remaining} ${tr('يوم')}`
                                                : c.ends_on
                                                  ? `${tr('ينتهي')} ${formatDate(c.ends_on)}`
                                                  : ''
                                        }`,
                                    }))}
                                />
                            )}
                        </div>
                    </section>
                )}

            {/* ── Contract visits waiting for a technician ───── */}
            {/* The reason contracts exist: a signed schedule is worthless if
                nobody is told the date has come round. */}
            {canDispatch && Boolean(data?.maintenance_due?.length) && (
                <section className="mt-8">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-navy-700">
                            <CalendarClock className="size-4 text-brand-600" />
                            {tr('زيارات صيانة تنتظر الإسناد')}
                        </h2>
                        <Link
                            to={path('/contracts')}
                            className="text-xs font-bold text-brand-600 hover:underline"
                        >
                            {tr('العقود')}
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
                    title={tr('عقود قاربت على الانتهاء')}
                    tone="amber"
                    linkTo={path('/contracts')}
                    linkLabel={tr('العقود')}
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
                    title={tr('ضمانات قاربت على الانتهاء')}
                    tone="violet"
                    linkTo={path('/warranties')}
                    linkLabel={tr('الضمانات')}
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
                            {tr('متابعات فات موعدها')}
                        </h2>
                        <Link to={path('/crm')} className="text-xs font-bold text-brand-600 hover:underline">
                            {tr('المتابعات')}
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
                                <span className="badge shrink-0 bg-red-50 text-red-700">{tr('متأخّر')}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* ── What needs attention now ───────────────────── */}
            <section className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-navy-700">
                        {canDispatch ? tr('الأقرب تنفيذًا') : tr('مهامك القادمة')}
                    </h2>
                    <Link to={path('/tasks')} className="text-xs font-bold text-brand-600 hover:underline">
                        {tr('عرض الكل')}
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
                        title={tr('لا توجد مهام مفتوحة')}
                        description={
                            canDispatch
                                ? tr('كل المهام منتهية — أو لم يتم إنشاء مهام بعد.')
                                : tr('لا توجد مهام مسندة إليك حاليًا.')
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
    navy: 'from-ink-soft to-ink text-white shadow-navy-950/25',
    slate: 'from-navy-100 to-navy-200 text-navy-500 shadow-navy-200/40',
}

/** The technician's own float: balance up front, a way to log an expense, and
 *  the last few they recorded. */
/** The technician's own punch clock: check in on arrival, out when done. */
function AttendanceCard() {
    const toast = useToast()
    const { data: today, isLoading } = useMyAttendanceToday()
    const checkIn = useAttendancePunch('check-in')
    const checkOut = useAttendancePunch('check-out')

    if (isLoading) return <div className="mt-6 shimmer h-24 rounded-2xl" />

    const checkedIn = Boolean(today?.check_in)
    const checkedOut = Boolean(today?.check_out)

    const punch = async (direction: 'check-in' | 'check-out') => {
        const location = await currentPosition()
        try {
            await (direction === 'check-in' ? checkIn : checkOut).mutateAsync(location)
            toast.success(direction === 'check-in' ? tr('تم تسجيل حضورك.') : tr('تم تسجيل انصرافك.'))
        } catch (caught) {
            toast.error(errorMessage(caught, tr('تعذّر التنفيذ.')))
        }
    }

    return (
        <section className="mt-6">
            <div className="card p-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                            <Clock className="size-5" />
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-navy-400">{tr('الحضور اليوم')}</p>
                            <p className="tabular text-sm font-extrabold text-navy-900">
                                {checkedIn ? (
                                    <>
                                        {tr('حضور')} {today!.check_in}
                                        {checkedOut && ` · ${tr('انصراف')} ${today!.check_out}`}
                                    </>
                                ) : (
                                    tr('لم تسجّل حضورك بعد')
                                )}
                            </p>
                            {checkedOut && (
                                <p className="text-[11px] text-navy-400">
                                    {tr('ساعات العمل')}: {today!.worked_hours}
                                </p>
                            )}
                        </div>
                    </div>

                    {!checkedIn ? (
                        <Button icon={LogIn} loading={checkIn.isPending} onClick={() => punch('check-in')}>
                            {tr('تسجيل حضور')}
                        </Button>
                    ) : !checkedOut ? (
                        <Button
                            icon={LogOut}
                            variant="secondary"
                            loading={checkOut.isPending}
                            onClick={() => punch('check-out')}
                        >
                            {tr('تسجيل انصراف')}
                        </Button>
                    ) : (
                        <span className="badge bg-emerald-50 text-emerald-700">{tr('اكتمل اليوم')}</span>
                    )}
                </div>
            </div>
        </section>
    )
}

/** Today's field attendance for a dispatcher — who is in, and from where. */
function AttendanceToday({
    rows,
    stats,
}: {
    rows: NonNullable<DashboardData['attendance_today']>
    stats?: DashboardData['stats']
}) {
    return (
        <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
                <Clock className="size-4 text-brand-600" />
                <h2 className="text-sm font-bold text-navy-700">{tr('حضور الفنيين اليوم')}</h2>
                <span className="tabular text-[11px] font-semibold text-navy-400">
                    {stats?.on_site_now ?? 0} {tr('في الموقع')} · {stats?.checked_in_today ?? 0} {tr('حضروا')}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rows.map((row) => (
                    <div key={row.id} className="card p-3.5 flex items-center gap-3">
                        <span
                            className={clsx(
                                'size-2.5 shrink-0 rounded-full',
                                row.check_out ? 'bg-navy-300' : 'bg-emerald-500',
                            )}
                            title={row.check_out ? tr('انصرف') : tr('في الموقع')}
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-navy-900">{row.employee}</p>
                            <p className="tabular text-[11px] text-navy-400">
                                {tr('حضور')} {row.check_in ?? '—'}
                                {row.check_out && ` · ${tr('انصراف')} ${row.check_out}`}
                                {row.check_out && ` · ${row.worked_hours} ${tr('ساعة')}`}
                            </p>

                            {/* A stamp with no coordinates is said out loud rather
                                than left as a missing pin — "no location" and "not
                                looked at" must not look the same. */}
                            {!row.check_in_location && !row.check_out_location ? (
                                <p className="text-[11px] text-navy-300">{tr('سُجّل بدون موقع')}</p>
                            ) : (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    {row.check_in_location && (
                                        <MapLink
                                            label={tr('موقع الحضور')}
                                            point={row.check_in_location}
                                            tone="in"
                                        />
                                    )}
                                    {row.check_out_location && (
                                        <MapLink
                                            label={tr('موقع الانصراف')}
                                            point={row.check_out_location}
                                            tone="out"
                                        />
                                    )}
                                    {row.check_out && !row.check_out_location && (
                                        <span className="text-[11px] text-navy-300">
                                            {tr('الانصراف بدون موقع')}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

/**
 * One end of a punch as a map link. The coordinates are on the chip on purpose:
 * two stamps from the same spot read the same at a glance, and telling that
 * apart is most of why anyone opens this list.
 */
function MapLink({
    label,
    point,
    tone,
}: {
    label: string
    point: { lat: number; lng: number }
    tone: 'in' | 'out'
}) {
    return (
        <a
            href={`https://maps.google.com/?q=${point.lat},${point.lng}`}
            target="_blank"
            rel="noreferrer"
            title={label}
            className={clsx(
                'tabular inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition',
                tone === 'in'
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-navy-50 text-navy-500 hover:bg-navy-100',
            )}
        >
            <MapPin className="size-3.5 shrink-0" />
            {tone === 'in' ? tr('حضور') : tr('انصراف')}
            <span className="text-navy-400" dir="ltr">
                {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
            </span>
        </a>
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

/** One column of standing alerts — a heading with a count and a short list. */
function AlertColumn({
    title,
    count,
    tone,
    to,
    rows,
}: {
    title: string
    count?: number
    tone: 'amber' | 'red'
    to: string
    rows: Array<{ key: string; to?: string; title: string; subtitle: string }>
}) {
    const chip = tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'

    return (
        <div className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
                <Link to={to} className="text-sm font-bold text-navy-800 hover:underline">
                    {title}
                </Link>
                {typeof count === 'number' && count > 0 && (
                    <span className={clsx('tabular badge shrink-0', chip)}>{count}</span>
                )}
            </div>

            <ul className="divide-y divide-navy-100">
                {rows.map((row) => {
                    const body = (
                        <>
                            <p className="truncate text-sm font-semibold text-navy-800">{row.title}</p>
                            <p className="tabular truncate text-[11px] text-navy-400">{row.subtitle}</p>
                        </>
                    )

                    return (
                        <li key={row.key} className="py-2">
                            {row.to ? (
                                <Link to={row.to} className="block min-w-0">
                                    {body}
                                </Link>
                            ) : (
                                <div className="min-w-0">{body}</div>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

function StatusBar({ counts }: { counts?: Record<string, number> }) {
    if (!counts) return null

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

    if (total === 0) {
        return <p className="py-2 text-center text-sm text-navy-400">{tr('لا توجد مهام بعد')}</p>
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
                                ? `${tr('باقٍ')} ${row.daysRemaining} ${tr('يوم')}`
                                : `${tr('انتهى منذ')} ${Math.abs(row.daysRemaining)} ${tr('يوم')}`}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    )
}

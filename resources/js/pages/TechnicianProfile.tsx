import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { Activity, ArrowRight, CalendarDays, ClipboardList, Clock, MapPin, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, Field, Input, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useTechnicianProfile } from '@/lib/queries'
import type { LeaveStatus, TaskStatus } from '@/types'

const TASK_STATUS_CHIP: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    accepted: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    on_the_way: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    cancelled: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

const LEAVE_CHIP: Record<LeaveStatus, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

/**
 * A manager's full read on one technician for a month: their work, attendance,
 * leave and pay in one place — the screen the owner uses to review and settle.
 */
export function TechnicianProfile() {
    const { id } = useParams<{ id: string }>()
    const { path } = useArea()

    const now = new Date()
    const [monthStr, setMonthStr] = useState(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    )
    const [year, month] = monthStr.split('-').map(Number)

    const { data, isLoading, isError, refetch } = useTechnicianProfile(id, { year, month })

    if (isError) return <ErrorState message="تعذّر تحميل ملف الفني." onRetry={() => void refetch()} />
    if (isLoading || !data) return <PageLoader />

    const { technician, performance, employee, tasks, attendance, leave, payslip } = data

    return (
        <>
            <Link
                to={path('/technicians')}
                className="tap mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy-500"
            >
                <ArrowRight className="size-4" />
                {tr('الفنيون')}
            </Link>

            {/* ── Identity ───────────────────────────────── */}
            <div className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-lg font-bold text-brand-700">
                            {technician.name.charAt(0)}
                        </span>
                        <div className="min-w-0">
                            <h1 className="text-xl font-extrabold text-navy-900">{technician.name}</h1>
                            <p className="text-sm text-navy-400">
                                {technician.job_title ?? 'فني'}
                                {technician.phone && ` · ${technician.phone}`}
                                {employee && ` · ${employee.code}`}
                            </p>
                        </div>
                    </div>

                    <span className="badge bg-navy-100 text-navy-600">
                        {technician.open_tasks} مهمة مفتوحة
                    </span>
                </div>

                <div className="mt-4 max-w-xs">
                    <Field label="الشهر">
                        <Input type="month" value={monthStr} onChange={(e) => setMonthStr(e.target.value)} />
                    </Field>
                </div>
            </div>

            {/* ── Performance ──────────────────────────────── */}
            <Section title="إحصائيات الأداء (الإجمالي)" icon={Activity}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Stat label="مسندة" value={performance.assigned.toString()} />
                    <Stat label="مكتملة" value={performance.completed.toString()} />
                    <Stat label="قيد العمل" value={performance.pending.toString()} />
                    <Stat label="متأخرة" value={performance.overdue.toString()} />
                    <Stat label="نسبة الإنجاز" value={`${performance.completion_percentage}%`} />
                    <Stat label="متوسط وقت المهمة" value={performance.avg_time} />
                </div>
            </Section>

            {/* ── Salary ─────────────────────────────────── */}
            {employee ? (
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="الراتب الأساسي" value={formatMoney(employee.basic_salary)} />
                    <Stat label="الإجمالي (الأساسي + البدلات)" value={formatMoney(employee.gross_salary)} />
                    <Stat
                        label="صافي راتب الشهر"
                        value={payslip ? formatMoney(payslip.net) : '—'}
                        hint={payslip?.paid_on ? `صُرف ${formatDate(payslip.paid_on)}` : payslip ? 'غير مصروف' : 'لا مسيّر لهذا الشهر'}
                    />
                    <Stat
                        label="رصيد الإجازة السنوية"
                        value={`${employee.annual_leave_remaining} / ${employee.annual_leave_days}`}
                        hint={`مأخوذ ${employee.annual_leave_taken}`}
                    />
                </div>
            ) : (
                <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
                    {tr('لا يوجد ملف موظف مرتبط بهذا الفني بعد — يُنشأ تلقائيًا عند أول تسجيل حضور أو طلب إجازة، أو أنشئه من «الموارد البشرية» لتحديد راتبه.')}
                </div>
            )}

            {/* ── Attendance ─────────────────────────────── */}
            <Section title="الحضور" icon={Clock} count={attendance.attended_days}>
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <MiniStat label="حضور" value={attendance.present_days} tone="ok" />
                    <MiniStat label="متأخر" value={attendance.late_days} tone="warn" />
                    <MiniStat label="غياب" value={attendance.absent_days} tone="down" />
                    <MiniStat label="إجازة" value={attendance.leave_days} />
                    <MiniStat label="ساعات" value={attendance.worked_hours} />
                </div>

                {attendance.rows.length > 0 && (
                    <div className="overflow-x-auto rounded-2xl border border-navy-100">
                        <table className="w-full min-w-[560px] text-sm text-right">
                            <thead className="bg-navy-50 text-xs text-navy-500">
                                <tr>
                                    <th className="px-3 py-2 font-medium">التاريخ</th>
                                    <th className="px-3 py-2 font-medium">الحالة</th>
                                    <th className="px-3 py-2 font-medium">الحضور والانصراف</th>
                                    <th className="px-3 py-2 font-medium">ساعات العمل</th>
                                    <th className="px-3 py-2 font-medium">الموقع</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-navy-100 bg-white">
                                {attendance.rows.map((row) => (
                                    <tr key={row.id} className="hover:bg-navy-50/50 transition-colors">
                                        <td className="px-3 py-2.5 tabular-nums text-navy-600 font-medium text-xs">
                                            {formatDate(row.date)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="badge bg-navy-100 text-navy-700">{row.status_label}</span>
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums text-navy-500 text-xs">
                                            {row.check_in ?? '—'}
                                            {row.check_out && ` — ${row.check_out}`}
                                        </td>
                                        <td className="px-3 py-2.5 text-navy-500 text-xs">
                                            {row.check_out ? (
                                                <span className="font-semibold text-brand-600">{row.worked_hours} ساعة</span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {row.check_in_location ? (
                                                <a
                                                    href={`https://maps.google.com/?q=${row.check_in_location.lat},${row.check_in_location.lng}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center justify-center size-7 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
                                                    aria-label="موقع الحضور"
                                                >
                                                    <MapPin className="size-3.5" />
                                                </a>
                                            ) : <span className="text-navy-300">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* ── Tasks in the month ─────────────────────── */}
            <Section title="المهام" icon={ClipboardList} count={tasks.total}>
                {tasks.rows.length === 0 ? (
                    <EmptyState icon={ClipboardList} title="لا توجد مهام في هذا الشهر" />
                ) : (
                    <>
                        <p className="mb-2 text-[11px] text-navy-400">
                            منها {tasks.completed} منتهية
                        </p>
                        <div className="overflow-x-auto rounded-2xl border border-navy-100">
                            <table className="w-full min-w-[640px] text-sm text-right">
                                <thead className="bg-navy-50 text-xs text-navy-500">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">الرقم</th>
                                        <th className="px-3 py-2 font-medium">التاريخ</th>
                                        <th className="px-3 py-2 font-medium">العميل والمهمة</th>
                                        <th className="px-3 py-2 font-medium">النوع</th>
                                        <th className="px-3 py-2 font-medium">الحالة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-navy-100 bg-white">
                                    {tasks.rows.map((task) => (
                                        <tr key={task.id} className="hover:bg-navy-50/50 transition-colors">
                                            <td className="px-3 py-2.5">
                                                <Link
                                                    to={path(`/tasks/${task.id}`)}
                                                    className="tabular-nums text-[11px] font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded hover:bg-brand-100 transition-colors inline-block"
                                                >
                                                    {task.code}
                                                </Link>
                                            </td>
                                            <td className="tabular-nums px-3 py-2.5 text-navy-500 text-xs">
                                                {task.date ? formatDate(task.date) : '—'}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {task.title && (
                                                    <Link
                                                        to={path(`/tasks/${task.id}`)}
                                                        className="block text-navy-700 font-medium hover:text-brand-600 transition-colors"
                                                    >
                                                        {task.title}
                                                    </Link>
                                                )}
                                                {task.customer && (
                                                    <span className="block text-[11px] text-navy-400 mt-0.5">
                                                        <span className="text-navy-500">{task.customer}</span>
                                                        {task.branch && ` · ${task.branch}`}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className="text-xs text-navy-600 bg-navy-50 px-2 py-1 rounded-md">{task.type_label}</span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span
                                                    className={clsx(
                                                        'badge',
                                                        TASK_STATUS_CHIP[task.status as TaskStatus] ??
                                                            'bg-navy-100 text-navy-500',
                                                    )}
                                                >
                                                    {task.status_label}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Section>

            {/* ── Leave this year ────────────────────────── */}
            <Section title="الإجازات" icon={CalendarDays} count={leave.length}>
                {leave.length === 0 ? (
                    <EmptyState icon={CalendarDays} title="لا توجد إجازات مسجّلة هذا العام" />
                ) : (
                    <div className="space-y-2">
                        {leave.map((row) => (
                            <div key={row.id} className="card flex items-center justify-between gap-3 p-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="badge bg-navy-100 text-navy-600">{row.type_label}</span>
                                        <span className={clsx('badge', LEAVE_CHIP[row.status])}>
                                            {row.status_label}
                                        </span>
                                    </div>
                                    <p className="tabular mt-1 text-[11px] text-navy-400">
                                        {formatDate(row.from_date)} — {formatDate(row.to_date)} · {row.days} يوم
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* ── Payslip ────────────────────────────────── */}
            {payslip && (
                <Section title="مسيّر الرواتب" icon={Wallet} count={undefined}>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <MiniStat label="الإجمالي" value={payslip.gross} money />
                        <MiniStat label="الاستقطاعات" value={payslip.total_deductions} money tone="down" />
                        <MiniStat label="الصافي" value={payslip.net} money tone="ok" />
                    </div>
                </Section>
            )}
        </>
    )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="card p-4">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p className="tabular mt-1 text-lg font-extrabold text-navy-900">{value}</p>
            {hint && <p className="mt-0.5 text-[10px] text-navy-400">{hint}</p>}
        </div>
    )
}

function MiniStat({
    label,
    value,
    tone,
    money,
}: {
    label: string
    value: number
    tone?: 'ok' | 'warn' | 'down'
    money?: boolean
}) {
    return (
        <div className="rounded-xl bg-navy-50 px-3 py-2">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular text-sm font-extrabold',
                    tone === 'ok'
                        ? 'text-emerald-600'
                        : tone === 'warn'
                          ? 'text-amber-600'
                          : tone === 'down'
                            ? 'text-red-600'
                            : 'text-navy-900',
                )}
            >
                {money ? formatMoney(value) : value}
            </p>
        </div>
    )
}

function Section({
    title,
    icon: Icon,
    count,
    children,
}: {
    title: string
    icon: typeof Clock
    count?: number
    children: React.ReactNode
}) {
    return (
        <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
                <Icon className="size-4 text-navy-400" />
                <h2 className="text-sm font-bold text-navy-800">{title}</h2>
                {typeof count === 'number' && (
                    <span className="tabular text-[11px] font-semibold text-navy-400">{count}</span>
                )}
            </div>
            {children}
        </section>
    )
}

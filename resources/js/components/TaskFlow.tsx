import clsx from 'clsx'
import {
    Camera,
    Check,
    ClipboardCheck,
    Clock,
    FileText,
    MapPin,
    Navigation,
    Phone,
    Receipt,
    Route,
    Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { formatMoney } from '@/lib/domain'
import { formatSmart, telLink } from '@/lib/format'
import type { Task, TaskStatus } from '@/types'

/**
 * The job as one step at a time, for a phone in a van.
 *
 * The desktop screen shows everything a job is and lets a dispatcher move it
 * anywhere it may go. That is the wrong shape on a phone held in one hand at a
 * customer's gate: there is exactly one thing to do next, and the screen should
 * be that thing.
 *
 * The step is derived from the status the server already holds, so closing the
 * app and reopening the job lands on the step it was left at — nothing extra is
 * stored to keep them in agreement, because agreement is the failure mode.
 */

export interface FlowStep {
    key: TaskStatus
    label: string
    short: string
    hint: string
    icon: typeof Check
}

export const FLOW_STEPS: FlowStep[] = [
    { key: 'pending', label: 'قبول المهمة', short: 'القبول', hint: 'اقبل المهمة لتبدأ', icon: Check },
    {
        key: 'accepted',
        label: 'بيانات العميل',
        short: 'العميل',
        hint: 'راجع الموقع وخط السير قبل التحرك',
        icon: MapPin,
    },
    {
        key: 'on_the_way',
        label: 'الوصول والمعاينة',
        short: 'الوصول',
        hint: 'صوّر الحالة واملأ تقرير المعاينة',
        icon: Camera,
    },
    {
        key: 'in_progress',
        label: 'تنفيذ العمل',
        short: 'التنفيذ',
        hint: 'أنهِ العمل ثم املأ تقرير الإنهاء',
        icon: Wrench,
    },
    { key: 'completed', label: 'تمت المهمة', short: 'الإنهاء', hint: '', icon: ClipboardCheck },
]

/** Where in the run a status sits; a cancelled job is out of the run entirely. */
export function stepIndexFor(status: TaskStatus): number {
    const index = FLOW_STEPS.findIndex((step) => step.key === status)

    return index === -1 ? FLOW_STEPS.length - 1 : index
}

/** The rail across the top: what is done, what is now, what is left. */
export function FlowRail({ status }: { status: TaskStatus }) {
    const current = stepIndexFor(status)

    return (
        <ol className="mb-4 flex items-center gap-1.5">
            {FLOW_STEPS.map((step, index) => {
                const done = index < current
                const active = index === current

                return (
                    <li key={step.key} className="flex flex-1 flex-col items-center gap-1">
                        <span
                            className={clsx(
                                'grid size-8 place-items-center rounded-full text-[11px] font-bold transition',
                                active && 'bg-navy-900 text-white shadow-lg shadow-navy-900/25',
                                done && 'bg-emerald-500 text-white',
                                !active && !done && 'bg-navy-100 text-navy-400',
                            )}
                        >
                            {done ? <Check className="size-4" /> : <step.icon className="size-4" />}
                        </span>

                        <span
                            className={clsx(
                                'text-[10px] font-bold',
                                active ? 'text-navy-900' : 'text-navy-400',
                            )}
                        >
                            {step.short}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

/** The one card the step is about, with its single action at the bottom. */
export function FlowStepCard({
    status,
    children,
    action,
    blockedBy,
}: {
    status: TaskStatus
    children?: ReactNode
    action?: ReactNode
    /** What is still missing before the action may be taken. */
    blockedBy?: string | null
}) {
    const step = FLOW_STEPS[stepIndexFor(status)]

    return (
        <section className="card overflow-hidden">
            <header className="flex items-center gap-3 border-b border-navy-100 bg-navy-50/60 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
                    <step.icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-sm font-extrabold text-navy-900">{step.label}</h2>
                    {step.hint && <p className="text-[11px] text-navy-400">{step.hint}</p>}
                </div>
            </header>

            {children && <div className="space-y-3 p-4">{children}</div>}

            {action && (
                <div className="border-t border-navy-100 p-4">
                    {blockedBy && (
                        <p className="mb-2.5 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                            <Clock className="mt-0.5 size-3.5 shrink-0" />
                            {blockedBy}
                        </p>
                    )}
                    {action}
                </div>
            )}
        </section>
    )
}

/**
 * Who the job is for and how to reach them — the card a technician looks at
 * most, so it carries its own weight rather than sitting as grey text.
 */
export function SiteCard({ task }: { task: Task }) {
    const address = task.effective_address ?? task.branch?.address ?? task.site_address
    const maps = task.navigation_url ?? task.branch?.maps_url
    const phone = task.branch?.contact_number ?? task.customer?.phone

    return (
        <div className="overflow-hidden rounded-2xl bg-gradient-to-bl from-navy-900 to-navy-800 text-white">
            <div className="p-4">
                <p className="text-[10px] font-bold text-white/50">العميل</p>
                <p className="mt-0.5 text-base font-extrabold">{task.customer?.name}</p>

                {task.branch?.name && (
                    <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold">
                        <MapPin className="size-3" />
                        {task.branch.name}
                    </p>
                )}

                {address && <p className="mt-2.5 text-xs leading-relaxed text-white/70">{address}</p>}

                {task.branch?.working_hours && (
                    <p className="mt-1 text-[11px] text-white/50">
                        مواعيد العمل: {task.branch.working_hours}
                    </p>
                )}
            </div>

            {(maps || phone) && (
                <div className="grid grid-cols-2 divide-x divide-x-reverse divide-white/10 border-t border-white/10">
                    {maps && (
                        <a
                            href={maps}
                            target="_blank"
                            rel="noreferrer"
                            className="tap flex items-center justify-center gap-2 py-3 text-xs font-bold transition hover:bg-white/10"
                        >
                            <Navigation className="size-4" />
                            الاتجاهات
                        </a>
                    )}
                    {phone && (
                        <a
                            href={telLink(phone)}
                            className="tap flex items-center justify-center gap-2 py-3 text-xs font-bold transition hover:bg-white/10"
                        >
                            <Phone className="size-4" />
                            اتصال
                        </a>
                    )}
                </div>
            )}
        </div>
    )
}

/**
 * What the step needs before it will let the job move on, shown as things to
 * tick rather than a button that simply refuses.
 */
export function Requirement({
    done,
    label,
    hint,
    icon: Icon,
    onClick,
}: {
    done: boolean
    label: string
    hint?: string
    icon: typeof FileText
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                'tap flex w-full items-center gap-3 rounded-2xl p-3 text-right ring-1 transition',
                done
                    ? 'bg-emerald-50 ring-emerald-200'
                    : 'bg-white ring-navy-200 hover:bg-navy-50',
            )}
        >
            <span
                className={clsx(
                    'grid size-9 shrink-0 place-items-center rounded-xl',
                    done ? 'bg-emerald-500 text-white' : 'bg-navy-100 text-navy-500',
                )}
            >
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
            </span>

            <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-navy-900">{label}</span>
                {hint && <span className="block text-[11px] text-navy-400">{hint}</span>}
            </span>

            <span
                className={clsx(
                    'shrink-0 text-[10px] font-bold',
                    done ? 'text-emerald-600' : 'text-navy-400',
                )}
            >
                {done ? 'تم' : 'مطلوب'}
            </span>
        </button>
    )
}

/**
 * Money and the road, pinned within reach at every step — a fare is recorded
 * when it is paid, not when the job happens to reach a screen that offers it.
 */
export function ExpenseBar({
    task,
    onAdd,
    onRoute,
}: {
    task: Task
    onAdd: () => void
    onRoute: () => void
}) {
    const spent = task.expenses_total ?? 0
    const route = task.branch?.route_total ?? 0

    return (
        <div className="safe-bottom sticky bottom-0 z-20 -mx-4 mt-5 border-t border-navy-100 bg-white/95 px-4 pt-3 pb-2 backdrop-blur">
            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={onAdd}
                    className="tap flex items-center gap-2.5 rounded-2xl bg-brand-600 px-3 py-2.5 text-right text-white shadow-lg shadow-brand-600/20 transition active:scale-[0.98]"
                >
                    <Receipt className="size-4 shrink-0" />
                    <span className="min-w-0">
                        <span className="block text-xs font-extrabold">تسجيل مصروف</span>
                        <span className="tabular block text-[10px] text-white/70">
                            {spent > 0 ? `صُرف ${formatMoney(spent)}` : 'لم يُسجَّل شيء'}
                        </span>
                    </span>
                </button>

                <button
                    type="button"
                    onClick={onRoute}
                    disabled={!task.branch}
                    className="tap flex items-center gap-2.5 rounded-2xl bg-navy-100 px-3 py-2.5 text-right text-navy-800 transition active:scale-[0.98] disabled:opacity-40"
                >
                    <Route className="size-4 shrink-0" />
                    <span className="min-w-0">
                        <span className="block text-xs font-extrabold">خط السير</span>
                        <span className="tabular block text-[10px] text-navy-500">
                            {route > 0 ? formatMoney(route) : 'غير مسجَّل'}
                        </span>
                    </span>
                </button>
            </div>
        </div>
    )
}

/**
 * What the job came to, kept as the screen for a finished job — the record a
 * technician shows when asked what happened, rather than a queue item that has
 * gone quiet.
 */
export function CompletedSummary({ task }: { task: Task }) {
    const spent = task.expenses_total ?? 0
    const photos = (task.attachments ?? []).length
    const reports = task.reports ?? []

    const minutes =
        task.started_at && task.completed_at
            ? Math.max(
                  0,
                  Math.round(
                      (new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()) /
                          60000,
                  ),
              )
            : null

    const duration =
        minutes == null
            ? '—'
            : minutes >= 60
              ? `${Math.floor(minutes / 60)} س ${minutes % 60} د`
              : `${minutes} د`

    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl bg-gradient-to-bl from-emerald-600 to-emerald-500 text-white">
                <div className="p-5 text-center">
                    <span className="mx-auto grid size-14 place-items-center rounded-full bg-white/15">
                        <ClipboardCheck className="size-7" />
                    </span>
                    <p className="mt-3 text-lg font-extrabold">تمت المهمة</p>
                    <p className="text-xs text-white/70">
                        {task.completed_at ? formatSmart(task.completed_at) : ''}
                    </p>
                </div>

                <div className="grid grid-cols-3 divide-x divide-x-reverse divide-white/15 border-t border-white/15 text-center">
                    <Figure label="مدة التنفيذ" value={duration} />
                    <Figure label="الصور" value={String(photos)} />
                    <Figure label="المصروفات" value={spent > 0 ? formatMoney(spent) : '—'} />
                </div>
            </div>

            <SiteCard task={task} />

            {reports.length > 0 && (
                <div className="card p-4">
                    <p className="mb-2 text-[11px] font-bold text-navy-400">التقارير المرفوعة</p>
                    <div className="space-y-1.5">
                        {reports.map((report) => (
                            <div
                                key={report.id}
                                className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"
                            >
                                <Check className="size-3.5 shrink-0" />
                                {report.type === 'completion' ? 'تقرير الإنهاء' : 'تقرير المعاينة'}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function Figure({ label, value }: { label: string; value: string }) {
    return (
        <div className="px-2 py-3">
            <p className="tabular text-sm font-extrabold">{value}</p>
            <p className="text-[10px] text-white/60">{label}</p>
        </div>
    )
}

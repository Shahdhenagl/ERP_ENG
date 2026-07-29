import clsx from 'clsx'
import {
    Camera,
    Check,
    ChevronLeft,
    ClipboardCheck,
    MapPin,
    Navigation,
    Phone,
    Receipt,
    Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { telLink } from '@/lib/format'
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
    hint: string
    icon: typeof Check
}

export const FLOW_STEPS: FlowStep[] = [
    { key: 'pending', label: 'قبول المهمة', hint: 'اقبل المهمة لتظهر في قائمتك', icon: Check },
    { key: 'accepted', label: 'بيانات العميل', hint: 'راجع العنوان وخط السير قبل التحرك', icon: MapPin },
    { key: 'on_the_way', label: 'الوصول', hint: 'صوّر الحالة عند الوصول وسجّل ملاحظاتك', icon: Camera },
    { key: 'in_progress', label: 'التنفيذ', hint: 'نفّذ العمل ثم املأ تقرير الإنهاء', icon: Wrench },
    { key: 'completed', label: 'الإنهاء', hint: 'تم إقفال المهمة', icon: ClipboardCheck },
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
        <ol className="no-scrollbar -mx-4 mb-4 flex items-center gap-1 overflow-x-auto px-4">
            {FLOW_STEPS.map((step, index) => {
                const done = index < current
                const active = index === current

                return (
                    <li key={step.key} className="flex shrink-0 items-center gap-1">
                        <span
                            className={clsx(
                                'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition',
                                active && 'bg-navy-900 text-white',
                                done && 'bg-emerald-50 text-emerald-700',
                                !active && !done && 'bg-navy-100 text-navy-400',
                            )}
                        >
                            {done ? <Check className="size-3" /> : <step.icon className="size-3" />}
                            {step.label}
                        </span>

                        {index < FLOW_STEPS.length - 1 && (
                            <ChevronLeft className="size-3 shrink-0 text-navy-300" />
                        )}
                    </li>
                )
            })}
        </ol>
    )
}

/**
 * The one card the step is about: what to read here, and the single button
 * that moves the job on.
 */
export function FlowStepCard({
    task,
    children,
    action,
}: {
    task: Task
    children?: ReactNode
    action?: ReactNode
}) {
    const step = FLOW_STEPS[stepIndexFor(task.status)]

    return (
        <section className="card p-4">
            <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <step.icon className="size-5" />
                </span>
                <div className="min-w-0">
                    <h2 className="font-bold text-navy-900">{step.label}</h2>
                    <p className="mt-0.5 text-[11px] text-navy-400">{step.hint}</p>
                </div>
            </div>

            {children && <div className="mt-4 space-y-3">{children}</div>}
            {action && <div className="mt-4">{action}</div>}
        </section>
    )
}

/** Where the job is, how to get there, and who to ring on arrival. */
export function SiteCard({ task }: { task: Task }) {
    const address = task.effective_address ?? task.branch?.address ?? task.site_address
    const maps = task.navigation_url ?? task.branch?.maps_url
    const phone = task.branch?.contact_number ?? task.customer?.phone

    return (
        <div className="rounded-2xl bg-navy-50 p-3.5">
            <p className="font-bold text-navy-900">{task.customer?.name}</p>
            {task.branch?.name && (
                <p className="text-xs font-semibold text-navy-600">{task.branch.name}</p>
            )}

            {address && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-navy-500">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-navy-300" />
                    {address}
                </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
                {maps && (
                    <a href={maps} target="_blank" rel="noreferrer" className="btn-secondary py-2 text-xs">
                        <Navigation className="size-3.5" />
                        الاتجاهات
                    </a>
                )}
                {phone && (
                    <a href={telLink(phone)} className="btn-secondary py-2 text-xs">
                        <Phone className="size-3.5" />
                        اتصال
                    </a>
                )}
            </div>
        </div>
    )
}

/**
 * The route to this site and what it is expected to cost, kept within reach at
 * every step — a technician records a fare when they pay it, not when the job
 * happens to reach a screen that offers the option.
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
    const spent = (task.expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0)
    const route = task.branch?.route_total

    return (
        <div className="safe-bottom sticky bottom-0 z-20 -mx-4 mt-4 border-t border-navy-100 bg-white/95 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-2">
                <Button variant="secondary" icon={Receipt} className="flex-1 text-xs" onClick={onAdd}>
                    تسجيل مصروف
                </Button>

                {Boolean(route) && (
                    <button
                        type="button"
                        onClick={onRoute}
                        className="tap rounded-xl bg-navy-50 px-3 py-2 text-[11px] font-bold text-navy-600"
                    >
                        خط السير · {formatMoney(route!)}
                    </button>
                )}

                {spent > 0 && (
                    <span className="tabular shrink-0 text-[11px] font-bold text-navy-500">
                        صُرف {formatMoney(spent)}
                    </span>
                )}
            </div>
        </div>
    )
}

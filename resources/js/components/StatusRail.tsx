import clsx from 'clsx'
import { Check, XCircle } from 'lucide-react'
import { STATUS, STATUS_FLOW } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import type { Task } from '@/types'

/**
 * Horizontal icon stepper — the shape people expect from a delivery or
 * service app, not a web timeline. Flows right-to-left with the document.
 *
 * Steps that have happened collapse to a check; the live step keeps its own
 * icon so you can tell at a glance what is actually going on right now.
 */
export function StatusRail({ task }: { task: Task }) {
    if (task.status === 'cancelled') {
        return (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <XCircle className="mt-0.5 size-5 shrink-0 text-slate-400" />
                <div>
                    <p className="text-sm font-bold text-slate-700">تم إلغاء المهمة</p>
                    {task.cancelled_at && (
                        <p className="mt-0.5 text-xs text-slate-500">{formatSmart(task.cancelled_at)}</p>
                    )}
                    {task.cancel_reason && (
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{task.cancel_reason}</p>
                    )}
                </div>
            </div>
        )
    }

    const timestamps: Record<string, string | null> = {
        pending: task.created_at,
        accepted: task.accepted_at,
        on_the_way: task.on_the_way_at,
        in_progress: task.started_at,
        completed: task.completed_at,
    }

    const currentIndex = STATUS_FLOW.indexOf(task.status)
    const currentStamp = timestamps[task.status]

    return (
        <div>
            {/* Equal-width columns with the connector drawn from one circle's
                centre to the next. Grid rather than flex so the label can never
                widen its own column and push the row past the viewport. */}
            <ol
                className="grid"
                style={{ gridTemplateColumns: `repeat(${STATUS_FLOW.length}, minmax(0, 1fr))` }}
            >
                {STATUS_FLOW.map((status, index) => {
                    const meta = STATUS[status]
                    const Icon = meta.icon
                    const done = index < currentIndex
                    const current = index === currentIndex
                    const reached = done || current
                    const isLast = index === STATUS_FLOW.length - 1

                    return (
                        <li key={status} className="relative flex min-w-0 flex-col items-center">
                            {!isLast && (
                                <span
                                    className={clsx(
                                        'absolute top-[17px] start-1/2 h-0.5 w-full',
                                        done ? 'bg-brand-600' : 'bg-navy-100',
                                    )}
                                    aria-hidden
                                />
                            )}

                            <span
                                className={clsx(
                                    'relative z-10 grid size-9 shrink-0 place-items-center rounded-full transition',
                                    reached ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-400',
                                    // A ring, not a pulse: it marks the live step
                                    // without turning the card into an animation.
                                    current && 'ring-4 ring-brand-100',
                                )}
                            >
                                {done ? <Check className="size-4.5" /> : <Icon className="size-4.5" />}
                            </span>

                            <span
                                className={clsx(
                                    'mt-2 w-full px-0.5 text-center text-[10px] leading-tight font-bold sm:text-[11px]',
                                    current ? 'text-navy-900' : reached ? 'text-navy-600' : 'text-navy-300',
                                )}
                            >
                                {meta.label}
                            </span>
                        </li>
                    )
                })}
            </ol>

            {currentStamp && (
                <p className="mt-4 border-t border-navy-100 pt-3 text-center text-xs text-navy-400">
                    {STATUS[task.status].label} · {formatSmart(currentStamp)}
                </p>
            )}
        </div>
    )
}

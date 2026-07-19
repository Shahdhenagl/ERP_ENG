import clsx from 'clsx'
import { Check, XCircle } from 'lucide-react'
import { STATUS, STATUS_FLOW } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import type { Task } from '@/types'

/**
 * Vertical progress rail showing where the job stands and when each step
 * happened. Cancelled jobs bail out of the happy path entirely.
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

    return (
        <ol className="relative space-y-0">
            {STATUS_FLOW.map((status, index) => {
                const meta = STATUS[status]
                const Icon = meta.icon
                const done = index < currentIndex
                const current = index === currentIndex
                const timestamp = timestamps[status]
                const isLast = index === STATUS_FLOW.length - 1

                return (
                    <li key={status} className="relative flex gap-3 pb-6 last:pb-0">
                        {/* Connector */}
                        {!isLast && (
                            <span
                                className={clsx(
                                    'absolute top-8 right-[15px] h-full w-0.5',
                                    done ? meta.solid : 'bg-navy-100',
                                )}
                                aria-hidden
                            />
                        )}

                        <span
                            className={clsx(
                                'relative z-10 grid size-8 shrink-0 place-items-center rounded-full transition',
                                done && `${meta.solid} text-white`,
                                current && `${meta.solid} text-white ring-4 ring-brand-100`,
                                !done && !current && 'bg-navy-100 text-navy-300',
                            )}
                        >
                            {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                        </span>

                        <div className="min-w-0 flex-1 pt-1">
                            <p
                                className={clsx(
                                    'text-sm font-bold',
                                    current ? 'text-navy-900' : done ? 'text-navy-700' : 'text-navy-300',
                                )}
                            >
                                {meta.label}
                                {current && (
                                    <span className="mr-2 inline-flex items-center gap-1 text-[10px] font-bold text-brand-600">
                                        <span className="size-1.5 animate-pulse rounded-full bg-brand-500" />
                                        الحالية
                                    </span>
                                )}
                            </p>
                            {timestamp && (done || current) && (
                                <p className="mt-0.5 text-xs text-navy-400">{formatSmart(timestamp)}</p>
                            )}
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}

import clsx from 'clsx'
import { Building2, CalendarClock, ChevronLeft, MapPin, User2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PRIORITY, STATUS, TASK_TYPE } from '@/lib/domain'
import { formatSmart, isOverdue } from '@/lib/format'
import type { Task } from '@/types'

interface TaskCardProps {
    task: Task
    /** Managers need to see who it is assigned to; a technician already knows. */
    showTechnician?: boolean
}

export function TaskCard({ task, showTechnician = true }: TaskCardProps) {
    const status = STATUS[task.status]
    const priority = PRIORITY[task.priority]
    const type = TASK_TYPE[task.type]
    const StatusIcon = status.icon
    const TypeIcon = type.icon

    const overdue = !task.is_terminal && isOverdue(task.scheduled_at)

    return (
        <Link
            to={`/tasks/${task.id}`}
            className={clsx(
                'card-interactive group relative flex gap-0 overflow-hidden',
                task.priority === 'urgent' && !task.is_terminal && priority.ring,
            )}
        >
            {/* Status accent rail — lets you read a long feed by colour alone */}
            <span className={clsx('w-1.5 shrink-0', status.accent)} aria-hidden />

            <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="tabular text-xs font-bold text-brand-600">{task.code}</span>
                            <span className={clsx('badge', priority.chip)}>
                                <span className={clsx('size-1.5 rounded-full', priority.dot)} />
                                {task.priority_label}
                            </span>
                        </div>
                        <h3 className="mt-1.5 truncate text-sm font-bold text-navy-900 group-hover:text-brand-700">
                            {task.title}
                        </h3>
                    </div>

                    <span className={clsx('badge shrink-0', status.chip)}>
                        <StatusIcon className="size-3.5" />
                        {task.status_label}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-navy-500">
                    {task.customer && (
                        <span className="flex min-w-0 items-center gap-1.5">
                            <Building2 className="size-3.5 shrink-0 text-navy-300" />
                            <span className="truncate font-medium">{task.customer.name}</span>
                        </span>
                    )}

                    <span className="flex items-center gap-1.5">
                        <TypeIcon className="size-3.5 shrink-0 text-navy-300" />
                        {task.type_label}
                    </span>

                    {showTechnician && task.technician && (
                        <span className="flex min-w-0 items-center gap-1.5">
                            <User2 className="size-3.5 shrink-0 text-navy-300" />
                            <span className="truncate">{task.technician.name}</span>
                        </span>
                    )}

                    {task.effective_address && (
                        <span className="flex min-w-0 items-center gap-1.5">
                            <MapPin className="size-3.5 shrink-0 text-navy-300" />
                            <span className="truncate">{task.effective_address}</span>
                        </span>
                    )}
                </div>

                {task.scheduled_at && (
                    <div
                        className={clsx(
                            'flex items-center gap-1.5 text-xs font-semibold',
                            overdue ? 'text-red-600' : 'text-navy-400',
                        )}
                    >
                        <CalendarClock className="size-3.5" />
                        {formatSmart(task.scheduled_at)}
                        {overdue && <span className="badge bg-red-50 text-red-700">متأخرة</span>}
                    </div>
                )}
            </div>

            <ChevronLeft className="mt-4 ml-3 size-5 shrink-0 self-start text-navy-200 transition group-hover:text-brand-400" />
        </Link>
    )
}

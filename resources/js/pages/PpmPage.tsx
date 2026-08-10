import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { CalendarClock, ExternalLink, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { usePpmSummary, usePpmVisits, useRunPpm } from '@/lib/queries'
import type { VisitStatus } from '@/types'

const STATUS: Record<VisitStatus, string> = {
    planned: 'bg-navy-100 text-navy-600',
    scheduled: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    done: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    skipped: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

type Filter = 'upcoming' | 'overdue' | 'done' | 'all'

const FILTERS: Array<[Filter, string]> = [
    ['upcoming', 'قادمة'],
    ['overdue', 'متأخرة'],
    ['done', 'تمت'],
    ['all', 'الكل'],
]

export function PpmPage() {
    const toast = useToast()
    const { path } = useArea()
    const [filter, setFilter] = useState<Filter>('upcoming')
    const run = useRunPpm()

    const params =
        filter === 'upcoming'
            ? { within: 45 }
            : filter === 'overdue'
              ? { overdue: 1 }
              : filter === 'done'
                ? { status: 'done' }
                : {}

    const { data: visits, isLoading } = usePpmVisits(params)
    const { data: summary } = usePpmSummary()

    return (
        <>
            <PageHeader
                title="الصيانة الوقائية (PPM)"
                subtitle="جدول زيارات الصيانة الدورية ونسبة الالتزام"
                actions={
                    <Button
                        icon={PlayCircle}
                        loading={run.isPending}
                        onClick={async () => {
                            try {
                                const result = await run.mutateAsync()
                                toast.success(result.message)
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر التنفيذ.'))
                            }
                        }}
                    >
                        {tr('إصدار الأوامر المستحقة')}
                    </Button>
                }
            />

            {summary && (
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Stat label="إجمالي الصيانات" value={String(summary.total)} />
                    <Stat label="المستحقة اليوم" value={String(summary.due_today)} accent />
                    <Stat label="خلال 7 أيام" value={String(summary.upcoming_7)} />
                    <Stat label="المتأخرة" value={String(summary.overdue)} tone={summary.overdue ? 'down' : undefined} />
                    <Stat label="تم تنفيذها" value={String(summary.done)} tone="up" />
                    <Stat
                        label="نسبة الالتزام"
                        value={summary.compliance !== null ? `${summary.compliance}%` : '—'}
                        accent
                    />
                </div>
            )}

            <div className="mb-4 flex gap-1 rounded-xl bg-navy-100 p-1">
                {FILTERS.map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                            filter === value ? 'bg-surface text-navy-900 shadow-sm' : 'text-navy-500',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !visits?.length ? (
                <EmptyState
                    icon={CalendarClock}
                    title="لا توجد زيارات"
                    description="زيارات الصيانة الدورية تُخطَّط تلقائيًا من عقود الصيانة النشطة."
                />
            ) : (
                <div className="space-y-2">
                    {visits.map((visit) => (
                        <div key={visit.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {visit.contract_code}
                                        </span>
                                        <span className={clsx('badge', STATUS[visit.status])}>
                                            {visit.status_label}
                                        </span>
                                        {visit.is_overdue && (
                                            <span className="badge bg-red-50 text-red-700">متأخرة</span>
                                        )}
                                    </div>
                                    <p className="mt-1 truncate font-bold text-navy-900">
                                        {visit.customer ?? '—'}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        الزيارة {visit.sequence}
                                        {visit.planned_for && ` · ${formatDate(visit.planned_for)}`}
                                        {visit.task_status_label && ` · ${visit.task_status_label}`}
                                    </p>
                                </div>

                                {visit.task_id && (
                                    <Link
                                        to={path(`/tasks/${visit.task_id}`)}
                                        className="tap inline-flex shrink-0 items-center gap-1 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-700"
                                    >
                                        <ExternalLink className="size-3.5" />
                                        {visit.task_code}
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

function Stat({
    label,
    value,
    accent,
    tone,
}: {
    label: string
    value: string
    accent?: boolean
    tone?: 'up' | 'down'
}) {
    return (
        <div className="card p-3 text-center">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular mt-0.5 text-lg font-extrabold',
                    accent
                        ? 'text-brand-600'
                        : tone === 'up'
                          ? 'text-emerald-600'
                          : tone === 'down'
                            ? 'text-red-600'
                            : 'text-navy-900',
                )}
            >
                {value}
            </p>
        </div>
    )
}

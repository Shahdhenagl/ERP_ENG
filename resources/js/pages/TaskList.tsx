import clsx from 'clsx'
import {
    FileSpreadsheet,
    Inbox,
    Plus,
    Printer,
    Search,
    SlidersHorizontal,
    X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TaskCard } from '@/components/TaskCard'
import { useViewMode, ViewToggle } from '@/components/ViewToggle'
import { Button, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { downloadCsv } from '@/lib/csv'
import { PRIORITY, STATUS, STATUS_FLOW, TASK_TYPE } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useIsPhone } from '@/lib/viewport'
import { useCustomers, useTasks, useTechnicians } from '@/lib/queries'
import type { Task, TaskStatus } from '@/types'


const QUICK_FILTERS: Array<{ key: string; label: string; params: Record<string, string> }> = [
    { key: 'all', label: 'الكل', params: {} },
    { key: 'open', label: 'المفتوحة', params: { open_only: '1' } },
    ...STATUS_FLOW.filter((s) => s !== 'completed').map((status) => ({
        key: status,
        label: STATUS[status].label,
        params: { status },
    })),
    { key: 'completed', label: 'منتهية', params: { status: 'completed' } },
]

/** The last calendar day of a YYYY-MM, as YYYY-MM-DD. */
function endOfMonth(month: string): string {
    const [year, m] = month.split('-').map(Number)
    const last = new Date(year, m, 0).getDate()
    return `${month}-${String(last).padStart(2, '0')}`
}

export function TaskList() {
    const { canDispatch } = useAuth()
    const { path } = useArea()
    const [searchParams, setSearchParams] = useSearchParams()
    const [showFilters, setShowFilters] = useState(false)

    const filters = useMemo(() => {
        const entries = Object.fromEntries(searchParams.entries())
        // `month` (YYYY-MM) and `day` (YYYY-MM-DD) are the UI's own filters; the
        // API knows a scheduled-date range, so translate before sending. A day
        // narrows to itself; otherwise a month spans its whole length.
        // A hand-picked span wins, then a single day, then the month it sits in.
        const { month, day, from, to, ...rest } = entries
        const range: Record<string, string> = {}

        if (from || to) {
            if (from) range.scheduled_after = from
            if (to) range.scheduled_before = to
        } else if (day) {
            range.scheduled_after = day
            range.scheduled_before = day
        } else if (month) {
            range.scheduled_after = `${month}-01`
            range.scheduled_before = endOfMonth(month)
        }

        return { ...rest, ...range, per_page: '30' }
    }, [searchParams])

    const { data, isLoading, isError, refetch, isFetching } = useTasks(filters)
    const { data: technicians } = useTechnicians()
    const { data: customerPage } = useCustomers({ active_only: 1, per_page: 200 })

    const [view, setViewMode] = useViewMode('tasks')

    // A phone gets cards and is not asked. An eight-column table is not a
    // narrow table on a small screen, it is the wrong control — and printing
    // or exporting is not something anyone does from one.
    const phone = useIsPhone()
    const effectiveView = phone ? 'cards' : view

    // Export what the filters describe, not the page being looked at — a
    // spreadsheet of thirty rows out of four hundred is a trap.
    const [exporting, setExporting] = useState(false)
    const exportRows = async () => {
        setExporting(true)

        try {
            const { data: page } = await api.get<{ data: Task[] }>('/tasks', {
                params: { ...filters, per_page: 1000 },
            })

            downloadCsv(
                `tasks-${new Date().toISOString().slice(0, 10)}`,
                ['المهمة', 'العنوان', 'الحالة', 'العميل', 'الفرع', 'الفني', 'بداية التنفيذ', 'انتهاء التنفيذ'],
                page.data.map((task) => [
                    task.code,
                    task.title,
                    STATUS[task.status].label,
                    task.customer?.name,
                    task.branch?.name,
                    task.technician?.name,
                    task.started_at ? formatDateTime(task.started_at) : '',
                    task.completed_at ? formatDateTime(task.completed_at) : '',
                ]),
            )
        } finally {
            setExporting(false)
        }
    }

    const setParam = (key: string, value: string) => {
        const next = new URLSearchParams(searchParams)

        if (value) {
            next.set(key, value)
        } else {
            next.delete(key)
        }

        next.delete('page')
        setSearchParams(next)
    }

    const activeQuickFilter =
        QUICK_FILTERS.find((filter) => {
            const status = searchParams.get('status')
            const openOnly = searchParams.get('open_only')

            if (filter.key === 'all') return !status && !openOnly
            if (filter.key === 'open') return openOnly === '1' && !status

            return status === filter.key
        })?.key ?? 'all'

    const applyQuickFilter = (filter: (typeof QUICK_FILTERS)[number]) => {
        const next = new URLSearchParams(searchParams)
        next.delete('status')
        next.delete('open_only')

        Object.entries(filter.params).forEach(([key, value]) => next.set(key, value))
        next.delete('page')
        setSearchParams(next)
    }

    const hasAdvancedFilters = Boolean(
        searchParams.get('type') ||
            searchParams.get('priority') ||
            searchParams.get('assigned_to') ||
            searchParams.get('customer_id') ||
            searchParams.get('month') ||
            searchParams.get('day') ||
            searchParams.get('from') ||
            searchParams.get('to'),
    )

    // Wait for a pause in typing before hitting the API.
    const searchTimer = useRef<number>(0)
    const debouncedSearch = (value: string) => {
        window.clearTimeout(searchTimer.current)
        searchTimer.current = window.setTimeout(() => setParam('search', value), 350)
    }

    useEffect(() => () => window.clearTimeout(searchTimer.current), [])

    return (
        <>
            <PageHeader
                title="المهام"
                subtitle={data ? `${data.meta.total} مهمة` : undefined}
                actions={
                    <div className="flex flex-wrap gap-2">
                        {!phone && (
                            <>
                                <Button
                                    variant="secondary"
                                    icon={FileSpreadsheet}
                                    loading={exporting}
                                    onClick={() => void exportRows()}
                                >
                                    تصدير Excel
                                </Button>
                                <Link
                                    to={`${path('/print/tasks')}?${searchParams.toString()}`}
                                    target="_blank"
                                    className="btn-secondary"
                                >
                                    <Printer className="size-4" />
                                    طباعة
                                </Link>
                            </>
                        )}
                        {canDispatch && (
                            <Link to={path('/tasks/new')} className="btn-primary">
                                <Plus className="size-4" />
                                مهمة جديدة
                            </Link>
                        )}
                    </div>
                }
            />

            {/* ── Search + filter toggle ─────────────────────── */}
            <div className="mb-4 flex gap-2">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={searchParams.get('search') ?? ''}
                        onChange={(event) => debouncedSearch(event.target.value)}
                        placeholder={phone ? 'ابحث…' : 'ابحث برقم المهمة أو العنوان أو السيريال أو اسم العميل…'}
                        className="pr-10"
                    />
                </div>

                <button
                    onClick={() => setShowFilters((open) => !open)}
                    className={clsx(
                        'btn tap shrink-0 px-3',
                        hasAdvancedFilters || showFilters
                            ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                            : 'btn-secondary',
                    )}
                    aria-label="فلاتر متقدمة"
                >
                    <SlidersHorizontal className="size-4" />
                </button>
            </div>

            {/* Table to scan many at once, cards for the detail on each. */}
            {!phone && (
                <div className="mb-3 flex justify-end">
                    <ViewToggle view={view} onChange={setViewMode} />
                </div>
            )}

            {/* ── Quick status chips ─────────────────────────── */}
            <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:rounded-2xl sm:bg-navy-50/60 sm:px-2 sm:py-1.5">
                {QUICK_FILTERS.map((filter) => (
                    <button
                        key={filter.key}
                        onClick={() => applyQuickFilter(filter)}
                        className={clsx(
                            'shrink-0 rounded-full px-4 py-2 text-xs font-bold transition',
                            activeQuickFilter === filter.key
                                ? 'bg-navy-900 text-white shadow-lg shadow-navy-900/20'
                                : 'bg-white text-navy-600 ring-1 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {/* ── Advanced filters ───────────────────────────── */}
            {showFilters && (
                <div className="card animate-in mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Select
                        value={searchParams.get('type') ?? ''}
                        onChange={(event) => setParam('type', event.target.value)}
                    >
                        <option value="">كل الأنواع</option>
                        {Object.entries(TASK_TYPE).map(([value, meta]) => (
                            <option key={value} value={value}>
                                {meta.label}
                            </option>
                        ))}
                    </Select>

                    <Select
                        value={searchParams.get('priority') ?? ''}
                        onChange={(event) => setParam('priority', event.target.value)}
                    >
                        <option value="">كل الأولويات</option>
                        {Object.entries(PRIORITY).map(([value, meta]) => (
                            <option key={value} value={value}>
                                {meta.label}
                            </option>
                        ))}
                    </Select>

                    {canDispatch && (
                        <Select
                            value={searchParams.get('assigned_to') ?? ''}
                            onChange={(event) => setParam('assigned_to', event.target.value)}
                        >
                            <option value="">كل الفنيين</option>
                            {technicians?.map((technician) => (
                                <option key={technician.id} value={technician.id}>
                                    {technician.name}
                                </option>
                            ))}
                        </Select>
                    )}

                    <Select
                        value={searchParams.get('customer_id') ?? ''}
                        onChange={(event) => setParam('customer_id', event.target.value)}
                    >
                        <option value="">كل العملاء</option>
                        {customerPage?.data.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                                {customer.name}
                            </option>
                        ))}
                    </Select>

                    {/* By the task's scheduled date. Most specific wins: a picked
                        span, then a single day, then the month around it. */}
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-navy-400">الشهر</span>
                        <Input
                            type="month"
                            value={searchParams.get('month') ?? ''}
                            onChange={(event) => setParam('month', event.target.value)}
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-navy-400">اليوم</span>
                        <Input
                            type="date"
                            value={searchParams.get('day') ?? ''}
                            onChange={(event) => setParam('day', event.target.value)}
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-navy-400">من تاريخ</span>
                        <Input
                            type="date"
                            value={searchParams.get('from') ?? ''}
                            onChange={(event) => setParam('from', event.target.value)}
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-navy-400">إلى تاريخ</span>
                        <Input
                            type="date"
                            value={searchParams.get('to') ?? ''}
                            onChange={(event) => setParam('to', event.target.value)}
                        />
                    </label>

                    {hasAdvancedFilters && (
                        <button
                            onClick={() => setSearchParams(new URLSearchParams())}
                            className="btn-ghost justify-start text-xs sm:col-span-3"
                        >
                            <X className="size-3.5" />
                            مسح كل الفلاتر
                        </button>
                    )}
                </div>
            )}

            {/* ── Results ────────────────────────────────────── */}
            {isError ? (
                <ErrorState message="تعذّر تحميل المهام." onRetry={() => void refetch()} />
            ) : isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <SkeletonCard key={index} />
                    ))}
                </div>
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Inbox}
                    title="لا توجد مهام مطابقة"
                    description="جرّب تغيير الفلاتر أو البحث بكلمة أخرى."
                    action={
                        canDispatch && (
                            <Link to={path('/tasks/new')} className="btn-primary">
                                <Plus className="size-4" />
                                إنشاء مهمة
                            </Link>
                        )
                    }
                />
            ) : (
                <>
                    <div className={clsx('transition-opacity', isFetching && 'opacity-60')}>
                        {effectiveView === 'table' ? (
                            <TaskTable tasks={data.data} href={(id) => path(`/tasks/${id}`)} />
                        ) : (
                            <div className="space-y-3">
                                {data.data.map((task) => (
                                    <TaskCard key={task.id} task={task} showTechnician={canDispatch} />
                                ))}
                            </div>
                        )}
                    </div>

                    {data.meta.last_page > 1 && (
                        <Pagination
                            current={data.meta.current_page}
                            last={data.meta.last_page}
                            onChange={(page) => setParam('page', String(page))}
                        />
                    )}
                </>
            )}
        </>
    )
}

function Pagination({
    current,
    last,
    onChange,
}: {
    current: number
    last: number
    onChange: (page: number) => void
}) {
    return (
        <div className="mt-6 flex items-center justify-center gap-2">
            <Button
                variant="secondary"
                disabled={current <= 1}
                onClick={() => onChange(current - 1)}
            >
                السابق
            </Button>
            <span className="tabular px-4 text-sm font-semibold text-navy-600">
                {current} / {last}
            </span>
            <Button
                variant="secondary"
                disabled={current >= last}
                onClick={() => onChange(current + 1)}
            >
                التالي
            </Button>
        </div>
    )
}

export type { TaskStatus }

/**
 * The jobs as rows: what it is, whose it is, where it went, and the two times
 * that say how long it actually took.
 *
 * Scrolls inside itself rather than widening the page — eight columns do not
 * fit a phone, and a horizontally scrolling body loses the sidebar with it.
 */
function TaskTable({ tasks, href }: { tasks: Task[]; href: (id: number) => string }) {
    return (
        <div className="card overflow-x-auto">
            <table className="w-full min-w-[52rem] text-right text-sm">
                <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                    <tr>
                        <th className="px-3 py-2.5">المهمة</th>
                        <th className="px-3 py-2.5">العميل</th>
                        <th className="px-3 py-2.5">الفرع</th>
                        <th className="w-28 px-3 py-2.5">الحالة</th>
                        <th className="w-40 px-3 py-2.5">بداية التنفيذ</th>
                        <th className="w-40 px-3 py-2.5">انتهاء التنفيذ</th>
                    </tr>
                </thead>
                <tbody>
                    {tasks.map((task) => {
                        const meta = STATUS[task.status]

                        return (
                            <tr key={task.id} className="border-t border-navy-100 hover:bg-navy-50/60">
                                <td className="px-3 py-2.5">
                                    <Link to={href(task.id)} className="block">
                                        <span className="tabular block text-[11px] font-bold text-brand-600">
                                            {task.code}
                                        </span>
                                        <span className="block truncate font-semibold text-navy-800">
                                            {task.title}
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-3 py-2.5 text-navy-700">{task.customer?.name ?? '—'}</td>
                                <td className="px-3 py-2.5 text-navy-600">{task.branch?.name ?? '—'}</td>
                                <td className="px-3 py-2.5">
                                    <span className={clsx('badge', meta.chip)}>{meta.label}</span>
                                </td>
                                <td className="tabular px-3 py-2.5 text-navy-600">
                                    {task.started_at ? formatDateTime(task.started_at) : '—'}
                                </td>
                                <td className="tabular px-3 py-2.5 text-navy-600">
                                    {task.completed_at ? formatDateTime(task.completed_at) : '—'}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

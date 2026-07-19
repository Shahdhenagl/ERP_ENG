import clsx from 'clsx'
import { Inbox, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TaskCard } from '@/components/TaskCard'
import { Button, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { PRIORITY, STATUS, STATUS_FLOW, TASK_TYPE } from '@/lib/domain'
import { useArea } from '@/lib/nav'
import { useTasks, useTechnicians } from '@/lib/queries'
import type { TaskStatus } from '@/types'

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

export function TaskList() {
    const { canDispatch } = useAuth()
    const { path } = useArea()
    const [searchParams, setSearchParams] = useSearchParams()
    const [showFilters, setShowFilters] = useState(false)

    const filters = useMemo(() => {
        const entries = Object.fromEntries(searchParams.entries())

        return { ...entries, per_page: '30' }
    }, [searchParams])

    const { data, isLoading, isError, refetch, isFetching } = useTasks(filters)
    const { data: technicians } = useTechnicians()

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
        searchParams.get('type') || searchParams.get('priority') || searchParams.get('assigned_to'),
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
                    canDispatch && (
                        <Link to={path('/tasks/new')} className="btn-primary">
                            <Plus className="size-4" />
                            مهمة جديدة
                        </Link>
                    )
                }
            />

            {/* ── Search + filter toggle ─────────────────────── */}
            <div className="mb-4 flex gap-2">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={searchParams.get('search') ?? ''}
                        onChange={(event) => debouncedSearch(event.target.value)}
                        placeholder="ابحث برقم المهمة أو العنوان أو السيريال أو اسم العميل…"
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

            {/* ── Quick status chips ─────────────────────────── */}
            <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
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
                <div className="card animate-in mb-4 grid gap-3 p-4 sm:grid-cols-3">
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
                    <div className={clsx('space-y-3 transition-opacity', isFetching && 'opacity-60')}>
                        {data.data.map((task) => (
                            <TaskCard key={task.id} task={task} showTechnician={canDispatch} />
                        ))}
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

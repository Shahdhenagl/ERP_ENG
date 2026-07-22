import clsx from 'clsx'
import { ChevronDown, ScrollText, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SectionTabs } from '@/components/SectionTabs'
import {
    Button,
    EmptyState,
    Field,
    Input,
    PageHeader,
    Select,
    SkeletonCard,
} from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { useActivity, useActivityFilters } from '@/lib/queries'
import { ADMIN_SECTIONS } from '@/lib/sections'
import type { ActivityEntry } from '@/types'

/**
 * The audit trail.
 *
 * Read-only, and deliberately so: entries are a by-product of doing the work,
 * and a log anyone can edit answers nothing. There is no delete either — a
 * trail with a delete button proves nothing by being empty.
 */
export function AuditLog() {
    const [search, setSearch] = useState('')
    const [module, setModule] = useState('')
    const [userId, setUserId] = useState('')
    const [sensitive, setSensitive] = useState(false)
    const [range, setRange] = useState({ from: '', to: '' })
    const [page, setPage] = useState(1)

    const { data: options } = useActivityFilters()
    const { data, isLoading } = useActivity({
        search,
        module,
        user_id: userId,
        sensitive: sensitive ? 1 : undefined,
        from: range.from,
        to: range.to,
        page,
        per_page: 50,
    })

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
            setSearch(value)
            setPage(1)
        }, 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    return (
        <>
            <PageHeader
                title="سجل العمليات"
                subtitle={data ? `${data.meta.total} عملية مسجّلة` : undefined}
            />

            <SectionTabs sections={ADMIN_SECTIONS} />

            <div className="mb-4 space-y-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        placeholder="ابحث بالوصف أو المستخدم أو عنوان IP…"
                        className="pr-10"
                        onChange={(e) => debounced(e.target.value)}
                    />
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                    <Field label="الموديول">
                        <Select
                            value={module}
                            onChange={(e) => {
                                setModule(e.target.value)
                                setPage(1)
                            }}
                        >
                            <option value="">الكل</option>
                            {options?.modules.map((row) => (
                                <option key={row.value} value={row.value}>
                                    {row.label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="المستخدم">
                        <Select
                            value={userId}
                            onChange={(e) => {
                                setUserId(e.target.value)
                                setPage(1)
                            }}
                        >
                            <option value="">الكل</option>
                            {options?.users.map((row) => (
                                <option key={row.value} value={row.value}>
                                    {row.label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="من">
                        <Input
                            type="date"
                            value={range.from}
                            onChange={(e) => {
                                setRange((r) => ({ ...r, from: e.target.value }))
                                setPage(1)
                            }}
                        />
                    </Field>

                    <Field label="إلى">
                        <Input
                            type="date"
                            value={range.to}
                            onChange={(e) => {
                                setRange((r) => ({ ...r, to: e.target.value }))
                                setPage(1)
                            }}
                        />
                    </Field>
                </div>

                {/* The rows someone opening this page came to find. */}
                <button
                    onClick={() => {
                        setSensitive((current) => !current)
                        setPage(1)
                    }}
                    className={clsx(
                        'tap inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                        sensitive
                            ? 'bg-red-50 text-red-700 ring-red-200'
                            : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                    )}
                >
                    <ShieldAlert className="size-3.5" />
                    العمليات الحسّاسة
                    {options?.sensitive_count ? ` (${options.sensitive_count})` : ''}
                </button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={ScrollText}
                    title="لا توجد عمليات"
                    description="سيظهر هنا كل إنشاء وتعديل وحذف وتغيير حالة، بمن نفّذه ومتى."
                />
            ) : (
                <>
                    <div className="space-y-1.5">
                        {data.data.map((entry) => (
                            <Row key={entry.id} entry={entry} />
                        ))}
                    </div>

                    {data.meta.last_page > 1 && (
                        <div className="mt-4 flex items-center justify-between">
                            <Button
                                variant="secondary"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                السابق
                            </Button>

                            <span className="tabular text-xs font-bold text-navy-500">
                                صفحة {data.meta.current_page} من {data.meta.last_page}
                            </span>

                            <Button
                                variant="secondary"
                                disabled={page >= data.meta.last_page}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                التالي
                            </Button>
                        </div>
                    )}
                </>
            )}
        </>
    )
}

function Row({ entry }: { entry: ActivityEntry }) {
    const [open, setOpen] = useState(false)
    const hasDetail = Boolean(entry.properties) || Boolean(entry.subject_type)

    return (
        <div
            className={clsx(
                'card p-3',
                entry.is_sensitive && 'ring-1 ring-red-200',
            )}
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={clsx(
                                'badge',
                                entry.is_sensitive
                                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                                    : 'bg-navy-100 text-navy-600',
                            )}
                        >
                            {entry.label}
                        </span>

                        {/* A failed login has no user attached, and that is the
                            case most worth noticing rather than hiding. */}
                        <span className="text-[11px] font-bold text-navy-700">
                            {entry.user ?? 'غير معروف'}
                        </span>

                        {entry.user_role && (
                            <span className="text-[11px] text-navy-400">{entry.user_role}</span>
                        )}
                    </div>

                    {entry.description && (
                        <p className="mt-1 text-sm text-navy-700">{entry.description}</p>
                    )}
                </div>

                <div className="shrink-0 text-left">
                    <p className="tabular text-[11px] text-navy-400">
                        {formatDateTime(entry.created_at)}
                    </p>
                    {entry.ip_address && (
                        <p className="tabular text-[10px] text-navy-300" dir="ltr">
                            {entry.ip_address}
                        </p>
                    )}
                </div>
            </div>

            {hasDetail && (
                <>
                    <button
                        onClick={() => setOpen((current) => !current)}
                        className="tap mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-navy-400"
                    >
                        <ChevronDown
                            className={clsx('size-3 transition', open && 'rotate-180')}
                        />
                        التفاصيل
                    </button>

                    {open && (
                        <div className="mt-2 space-y-1 rounded-lg bg-navy-50 p-2.5 text-[11px]">
                            {entry.subject_type && (
                                <p className="tabular text-navy-500" dir="ltr">
                                    {entry.subject_type}#{entry.subject_id}
                                </p>
                            )}
                            {entry.properties && (
                                <pre
                                    className="overflow-x-auto whitespace-pre-wrap text-navy-600"
                                    dir="ltr"
                                >
                                    {JSON.stringify(entry.properties, null, 2)}
                                </pre>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

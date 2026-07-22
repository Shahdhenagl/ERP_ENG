import clsx from 'clsx'
import { AlertTriangle, FileText, Search, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SectionTabs } from '@/components/SectionTabs'
import { MONEY_SECTIONS } from '@/lib/sections'
import { EmptyState, ErrorState, Input, PageHeader, SkeletonCard } from '@/components/ui'
import { formatMoney, PAYMENT_STATE } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useInvoices, useTreasurySummary } from '@/lib/queries'

type Filter = 'all' | 'outstanding' | 'overdue'

export function InvoiceList() {
    const { path } = useArea()
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<Filter>('all')

    const { data: summary } = useTreasurySummary()
    const { data, isLoading, isError, refetch } = useInvoices({
        search,
        outstanding: filter === 'outstanding' ? 1 : undefined,
        overdue: filter === 'overdue' ? 1 : undefined,
        per_page: 40,
    })

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    return (
        <>
            <PageHeader
                title="الفواتير"
                subtitle={data ? `${data.meta.total} فاتورة` : undefined}
            />

            <SectionTabs sections={MONEY_SECTIONS} />

            {summary && (
                <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="المستحق على العملاء" value={formatMoney(summary.receivable)} />
                    <Stat label="النقدية بالخزائن" value={formatMoney(summary.cash_on_hand)} tone="good" />
                    <Stat label="تحصيل هذا الشهر" value={formatMoney(summary.collected_this_month)} />
                    <Stat
                        label="فواتير متأخرة"
                        value={String(summary.overdue_count)}
                        tone={summary.overdue_count > 0 ? 'bad' : undefined}
                    />
                </div>
            )}

            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={search}
                        onChange={(event) => debounced(event.target.value)}
                        placeholder="ابحث برقم الفاتورة أو اسم العميل…"
                        className="pr-10"
                    />
                </div>

                <div className="flex gap-1 rounded-xl bg-navy-100 p-1">
                    {(
                        [
                            ['all', 'الكل'],
                            ['outstanding', 'غير محصّلة'],
                            ['overdue', 'متأخرة'],
                        ] as Array<[Filter, string]>
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={clsx(
                                'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                                filter === value ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {isError ? (
                <ErrorState message="تعذّر تحميل الفواتير." onRetry={() => void refetch()} />
            ) : isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonCard key={index} />
                    ))}
                </div>
            ) : !data?.data.length ? (
                <EmptyState
                    icon={FileText}
                    title="لا توجد فواتير"
                    description="تُنشأ الفاتورة من صفحة المهمة بعد انتهائها، بزر «إصدار فاتورة»."
                />
            ) : (
                <div className="space-y-3">
                    {data.data.map((invoice) => {
                        const state = PAYMENT_STATE[invoice.payment_state]

                        return (
                            <Link
                                key={invoice.id}
                                to={path(`/invoices/${invoice.id}`)}
                                className="card-interactive block p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular text-[11px] font-bold text-brand-600">
                                                {invoice.code}
                                            </span>
                                            <span className={clsx('badge', state.chip)}>{state.label}</span>
                                            {invoice.is_overdue && (
                                                <AlertTriangle className="size-3.5 text-red-500" />
                                            )}
                                        </div>

                                        <p className="mt-1.5 truncate font-bold text-navy-900">
                                            {invoice.customer?.name}
                                        </p>

                                        <p className="mt-0.5 text-xs text-navy-400">
                                            {invoice.issue_date && formatDate(invoice.issue_date)}
                                            {invoice.due_date && ` · استحقاق ${formatDate(invoice.due_date)}`}
                                        </p>
                                    </div>

                                    <div className="shrink-0 text-left">
                                        <p className="tabular font-extrabold text-navy-900">
                                            {formatMoney(invoice.total)}
                                        </p>
                                        {invoice.balance > 0 && (
                                            <p className="tabular text-[11px] font-semibold text-amber-600">
                                                متبقٍ {formatMoney(invoice.balance)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}

            <Link
                to={path('/treasury')}
                className="card mt-6 flex items-center justify-between gap-3 p-4 transition hover:bg-navy-50"
            >
                <span className="flex items-center gap-2 font-bold text-navy-900">
                    <Wallet className="size-4 text-navy-400" />
                    الخزينة والتحصيل
                </span>
                <span className="tabular text-sm font-extrabold text-brand-600">
                    {summary ? formatMoney(summary.cash_on_hand) : '—'}
                </span>
            </Link>
        </>
    )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
    return (
        <div className="card p-4">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular mt-1 text-base font-extrabold',
                    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-navy-900',
                )}
            >
                {value}
            </p>
        </div>
    )
}

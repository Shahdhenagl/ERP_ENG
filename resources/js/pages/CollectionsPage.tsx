import { HandCoins, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Input, PageHeader, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { usePayments } from '@/lib/queries'

/**
 * Money collected from customers — the receipts, newest first.
 *
 * A read-through of what came in and against which invoice, so a collector can
 * see the day's takings without opening the treasury. Recording a receipt still
 * belongs to the invoice it settles; this is the ledger side of it.
 */
export function CollectionsPage() {
    const { path } = useArea()
    const { data, isLoading } = usePayments({ per_page: 50 })
    const [search, setSearch] = useState('')

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase()
        const list = data?.data ?? []

        if (!term) return list

        return list.filter(
            (payment) =>
                (payment.customer ?? '').toLowerCase().includes(term) ||
                payment.code.toLowerCase().includes(term) ||
                (payment.invoice_code ?? '').toLowerCase().includes(term),
        )
    }, [data, search])

    const total = useMemo(
        () => rows.reduce((sum, payment) => sum + payment.amount, 0),
        [rows],
    )

    return (
        <>
            <PageHeader
                title="التحصيلات"
                subtitle={data ? `${data.data.length} سند · ${formatMoney(total)}` : undefined}
            />

            <div className="relative mb-4">
                <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ابحث بالعميل أو رقم السند أو الفاتورة…"
                    className="pr-10"
                />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={HandCoins}
                    title="لا توجد تحصيلات"
                    description="تظهر هنا سندات القبض من العملاء بمجرد تسجيلها على الفواتير."
                />
            ) : (
                <div className="space-y-2">
                    {rows.map((payment) => (
                        <div key={payment.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {payment.code}
                                        </span>
                                        <span className="badge bg-navy-100 text-navy-600">
                                            {payment.method_label}
                                        </span>
                                        {payment.invoice_code && (
                                            <Link
                                                to={path(`/invoices/${payment.invoice_id}`)}
                                                className="tabular text-[11px] font-bold text-emerald-600 hover:underline"
                                            >
                                                ← {payment.invoice_code}
                                            </Link>
                                        )}
                                    </div>

                                    <p className="mt-1.5 truncate font-bold text-navy-900">
                                        {payment.customer ?? '—'}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {payment.cash_box && `${payment.cash_box} · `}
                                        {formatSmart(payment.paid_at ?? payment.created_at)}
                                        {payment.actor && ` · ${payment.actor}`}
                                    </p>
                                </div>

                                <p className="tabular shrink-0 font-extrabold text-emerald-600">
                                    {formatMoney(payment.amount)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

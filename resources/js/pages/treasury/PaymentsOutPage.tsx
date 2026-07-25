import { useMemo } from 'react'
import { Banknote } from 'lucide-react'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useCashMovements } from '@/lib/queries'

/**
 * Money out — supplier payments, expenses and advances, every disbursement off
 * the treasury newest first with its heading and box. The paying side of the
 * ledger, read as vouchers rather than analysed.
 */
export function PaymentsOutPage() {
    const { data, isLoading } = useCashMovements({ per_page: 80 })

    const rows = useMemo(() => (data ?? []).filter((m) => m.direction === 'out'), [data])
    const total = useMemo(() => rows.reduce((sum, m) => sum + m.amount, 0), [rows])

    return (
        <>
            <PageHeader
                title="سند صرف"
                subtitle={rows.length ? `${rows.length} حركة · ${formatMoney(total)}` : 'المدفوعات والمصروفات'}
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={Banknote}
                    title="لا توجد مدفوعات"
                    description="مدفوعات الموردين والمصروفات والتحويلات الصادرة تظهر هنا."
                />
            ) : (
                <div className="space-y-2">
                    {rows.map((m) => (
                        <div key={m.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="badge bg-navy-100 text-navy-600">
                                            {m.source_label}
                                        </span>
                                        {m.box && (
                                            <span className="text-[11px] font-bold text-navy-400">
                                                {m.box}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 truncate font-bold text-navy-900">
                                        {m.customer ?? m.category ?? m.note ?? m.source_label}
                                    </p>
                                    <p className="text-[11px] text-navy-400">
                                        {formatSmart(m.created_at)}
                                        {m.actor && ` · ${m.actor}`}
                                    </p>
                                </div>
                                <p className="tabular shrink-0 font-extrabold text-red-600">
                                    −{formatMoney(m.amount)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

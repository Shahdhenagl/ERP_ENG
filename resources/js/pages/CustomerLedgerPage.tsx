import clsx from 'clsx'
import { FileText, HandCoins, Printer, ReceiptText, ScrollText, Undo2, Users, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Field, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useCustomers, useCustomerTimeline, type TimelineEvent } from '@/lib/queries'

const TYPE: Record<TimelineEvent['type'], { icon: typeof FileText; tint: string }> = {
    quotation: { icon: FileText, tint: 'bg-sky-50 text-sky-600' },
    invoice: { icon: ReceiptText, tint: 'bg-brand-50 text-brand-600' },
    payment: { icon: HandCoins, tint: 'bg-emerald-50 text-emerald-600' },
    return: { icon: Undo2, tint: 'bg-red-50 text-red-600' },
    contract: { icon: ScrollText, tint: 'bg-indigo-50 text-indigo-600' },
    task: { icon: Wrench, tint: 'bg-amber-50 text-amber-600' },
}

/**
 * One customer's whole history, read down the page.
 *
 * Pick a customer and every quote, invoice, receipt, credit note, contract and
 * service ticket lines up newest-first — the account's story in order, which
 * the grouped profile never shows as one stream.
 */
export function CustomerLedgerPage() {
    const { path } = useArea()
    const { data: customerPage } = useCustomers({ per_page: 200 })
    const customers = customerPage?.data ?? []
    const [customerId, setCustomerId] = useState<number | null>(null)

    const { data, isLoading } = useCustomerTimeline(customerId ?? undefined)

    return (
        <>
            <PageHeader title="سجل تعاملات العميل" subtitle="كل الحركات مرتبة بالتاريخ" />

            <div className="mb-4 flex max-w-xl items-end gap-2">
                <Field label="العميل" className="flex-1">
                    <Select
                        value={customerId ?? ''}
                        onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">اختر العميل…</option>
                        {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                                {customer.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                {customerId && Boolean(data?.data.length) && (
                    <Link
                        to={path(`/print/customer-ledger/${customerId}`)}
                        target="_blank"
                        className="btn-secondary shrink-0 text-xs"
                    >
                        <Printer className="size-4" />
                        طباعة
                    </Link>
                )}
            </div>

            {!customerId ? (
                <EmptyState
                    icon={Users}
                    title="اختر عميلًا لعرض سجله"
                    description="سيظهر كل ما تم معه — عروض وفواتير وتحصيلات وعقود وتذاكر — بترتيب زمني."
                />
            ) : isLoading || !data ? (
                <SkeletonCard />
            ) : !data.data.length ? (
                <EmptyState icon={FileText} title="لا توجد حركات لهذا العميل بعد" />
            ) : (
                <div className="relative space-y-2 before:absolute before:top-2 before:bottom-2 before:right-[19px] before:w-px before:bg-navy-100">
                    {data.data.map((event, index) => {
                        const meta = TYPE[event.type]
                        const Icon = meta.icon

                        return (
                            <div key={`${event.type}-${event.code}-${index}`} className="relative flex gap-3">
                                <span
                                    className={clsx(
                                        'relative z-10 grid size-10 shrink-0 place-items-center rounded-full ring-4 ring-navy-50',
                                        meta.tint,
                                    )}
                                >
                                    <Icon className="size-4.5" />
                                </span>

                                <div className="card mb-1 flex-1 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-xs font-bold text-navy-500">
                                                    {event.type_label}
                                                </span>
                                                {event.code && (
                                                    <span className="tabular text-[11px] font-bold text-brand-600">
                                                        {event.code}
                                                    </span>
                                                )}
                                                {event.status && (
                                                    <span className="badge bg-navy-100 text-navy-600">
                                                        {event.status}
                                                    </span>
                                                )}
                                            </div>
                                            {event.title && (
                                                <p className="mt-0.5 truncate text-sm text-navy-700">
                                                    {event.title}
                                                </p>
                                            )}
                                            <p className="tabular text-[11px] text-navy-400">
                                                {formatDate(event.date)}
                                            </p>
                                        </div>

                                        {event.amount != null && (
                                            <p
                                                className={clsx(
                                                    'tabular shrink-0 font-extrabold',
                                                    event.type === 'payment'
                                                        ? 'text-emerald-600'
                                                        : event.type === 'return'
                                                          ? 'text-red-600'
                                                          : 'text-navy-900',
                                                )}
                                            >
                                                {formatMoney(event.amount)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </>
    )
}

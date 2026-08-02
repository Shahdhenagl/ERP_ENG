import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { AlertTriangle, PackageCheck, Printer, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatQty, SALES_ORDER_STATUS } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useSalesOrderAction, useSalesOrders } from '@/lib/queries'

type Filter = 'pending' | 'delivered' | 'all'

const FILTERS: Array<[Filter, string]> = [
    ['pending', 'بانتظار التسليم'],
    ['delivered', 'تم تسليمها'],
    ['all', 'الكل'],
]

/**
 * Delivery from the shipping side: the orders to hand over, a printable note
 * for the driver to get signed, and the "delivered" stamp. Same orders as the
 * sales tab, read for the gate rather than the books.
 */
export function DeliveryNotesPage() {
    const toast = useToast()
    const { path } = useArea()
    const action = useSalesOrderAction()
    const { data: orders, isLoading } = useSalesOrders()
    const [filter, setFilter] = useState<Filter>('pending')

    const rows = useMemo(() => {
        const list = (orders ?? []).filter((order) => order.status !== 'cancelled')
        if (filter === 'pending') return list.filter((order) => order.status === 'open')
        if (filter === 'delivered') return list.filter((order) => order.status === 'delivered')
        return list
    }, [orders, filter])

    const deliver = async (id: number) => {
        try {
            await action.mutateAsync({ id, action: 'deliver' })
            toast.success('تم تسجيل التسليم.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
        }
    }

    return (
        <>
            <PageHeader title="أذون التسليم" subtitle="تسليم البضاعة للعميل وطباعة الإذن" />

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
            ) : !rows.length ? (
                <EmptyState
                    icon={Truck}
                    title="لا توجد أوامر بيع"
                    description="أوامر البيع المؤكدة تظهر هنا لتسليمها للعميل وطباعة إذن التسليم."
                />
            ) : (
                <div className="space-y-2">
                    {rows.map((order) => (
                        <div key={order.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {order.code}
                                        </span>
                                        <span className={clsx('badge', SALES_ORDER_STATUS[order.status].chip)}>
                                            {order.status_label}
                                        </span>
                                    </div>
                                    <p className="mt-1 truncate font-bold text-navy-900">{order.customer}</p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {order.order_date && formatDate(order.order_date)}
                                    </p>
                                </div>
                                <p className="tabular shrink-0 font-extrabold text-navy-900">
                                    {formatMoney(order.total)}
                                </p>
                            </div>

                            {/* Whether the store can actually cover it. The invoice
                                refuses a shortage, so the gate is the wrong place
                                to find out — this is. */}
                            {order.stock?.state === 'short' ? (
                                <div className="mt-3 rounded-xl bg-red-50 p-2.5">
                                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-red-700">
                                        <AlertTriangle className="size-3.5 shrink-0" />
                                        {tr('ناقص بالمخزن')}
                                    </p>
                                    {order.stock.short.map((line) => (
                                        <p key={line.item} className="tabular mt-0.5 text-[11px] text-red-600">
                                            {line.item}: مطلوب {formatQty(line.needed)} — المتاح{' '}
                                            {formatQty(line.available)}
                                        </p>
                                    ))}
                                </div>
                            ) : order.stock?.state === 'ready' && order.status === 'open' ? (
                                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                                    <PackageCheck className="size-3.5 shrink-0" />
                                    {tr('البضاعة متوفرة بالمخزن الرئيسي')}
                                </p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                <Link
                                    to={path(`/print/delivery/${order.id}`)}
                                    target="_blank"
                                    className="btn-secondary text-xs"
                                >
                                    <Printer className="size-4" />
                                    {tr('طباعة إذن التسليم')}
                                </Link>
                                {order.status === 'open' && (
                                    <Button
                                        variant="secondary"
                                        icon={Truck}
                                        className="text-xs"
                                        loading={action.isPending}
                                        onClick={() => deliver(order.id)}
                                    >
                                        {tr('تم التسليم')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

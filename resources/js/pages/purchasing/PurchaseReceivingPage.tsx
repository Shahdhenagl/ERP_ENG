import clsx from 'clsx'
import { PackageCheck, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ReceiveOrderForm } from '@/components/ReceiveOrderForm'
import { Button, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { usePurchaseOrder, usePurchaseOrders } from '@/lib/queries'

const FULFILMENT_CHIP: Record<string, string> = {
    awaiting: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    partly_received: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    received: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

/**
 * Receiving from the warehouse side: the sent orders still waiting on goods,
 * and the door to book a delivery in against each. Same orders as the
 * purchasing tab, read for the loading bay rather than the buyer's desk.
 */
export function PurchaseReceivingPage() {
    const { data: orders, isLoading } = usePurchaseOrders()
    const [receivingId, setReceivingId] = useState<number | null>(null)

    // Only what can actually be received: sent, and not fully arrived.
    const rows = useMemo(
        () =>
            (orders ?? []).filter(
                (order) => order.status === 'sent' && order.fulfilment !== 'received',
            ),
        [orders],
    )

    return (
        <>
            <PageHeader title="استلام المشتريات" subtitle="تسجيل استلام البضاعة على أوامر الشراء" />

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={Truck}
                    title="لا توجد أوامر بانتظار الاستلام"
                    description="أوامر الشراء المُرسَلة للموردين تظهر هنا لتسجيل استلام البضاعة عليها."
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
                                        <span className={clsx('badge', FULFILMENT_CHIP[order.fulfilment])}>
                                            {order.fulfilment_label}
                                        </span>
                                    </div>
                                    <p className="mt-1 truncate font-bold text-navy-900">{order.supplier}</p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {order.order_date && formatDate(order.order_date)}
                                        {order.expected_date && ` · متوقّع ${formatDate(order.expected_date)}`}
                                    </p>
                                </div>
                                <p className="tabular shrink-0 font-extrabold text-navy-900">
                                    {formatMoney(order.total)}
                                </p>
                            </div>

                            <div className="mt-3 border-t border-navy-100 pt-3">
                                <Button
                                    icon={PackageCheck}
                                    className="text-xs"
                                    onClick={() => setReceivingId(order.id)}
                                >
                                    تسجيل استلام
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {receivingId && (
                <ReceiveGate id={receivingId} onClose={() => setReceivingId(null)} />
            )}
        </>
    )
}

/** Fetches the full order (with its outstanding lines) before opening the form. */
function ReceiveGate({ id, onClose }: { id: number; onClose: () => void }) {
    const { data: order } = usePurchaseOrder(id)

    if (!order) return null

    return <ReceiveOrderForm open onClose={onClose} order={order} />
}

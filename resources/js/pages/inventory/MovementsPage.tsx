import clsx from 'clsx'
import { ClipboardList } from 'lucide-react'
import { EmptyState, SkeletonCard } from '@/components/ui'
import { formatMoney, formatQty, MOVEMENT_TYPE } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useMovements } from '@/lib/queries'

/** The audit trail: every movement, newest first. */
export function MovementsPage() {
    const { data, isLoading } = useMovements({ per_page: 50 })

    if (isLoading) return <SkeletonCard />

    if (!data?.data.length) {
        return <EmptyState icon={ClipboardList} title="لا توجد حركات بعد" />
    }

    return (
        <div className="space-y-2">
            {data.data.map((movement) => {
                const meta = MOVEMENT_TYPE[movement.type]

                return (
                    <div key={movement.id} className="card p-3.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={clsx('badge', meta.chip)}>{movement.type_label}</span>
                                    {movement.task_code && (
                                        <span className="tabular text-[11px] font-bold text-navy-400">
                                            {movement.task_code}
                                        </span>
                                    )}
                                </div>

                                <p className="mt-1 truncate text-sm font-bold text-navy-900">
                                    {movement.item?.name}
                                </p>

                                <p className="mt-0.5 text-xs text-navy-500">
                                    {movement.from && `من ${movement.from}`}
                                    {movement.from && movement.to && ' ← '}
                                    {movement.to && `إلى ${movement.to}`}
                                    {movement.supplier && ` · ${movement.supplier}`}
                                </p>

                                <p className="mt-1 text-[11px] text-navy-400">
                                    {movement.actor} · {formatSmart(movement.created_at)}
                                </p>
                            </div>

                            <div className="shrink-0 text-left">
                                <p className="tabular font-extrabold text-navy-900">
                                    {meta.sign}
                                    {formatQty(movement.qty)}
                                </p>
                                <p className="tabular text-[11px] text-navy-400">
                                    {formatMoney(movement.value)}
                                </p>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

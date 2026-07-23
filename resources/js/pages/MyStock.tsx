import clsx from 'clsx'
import { Package } from 'lucide-react'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { formatQty, ITEM_CATEGORY, MOVEMENT_TYPE, MOVEMENT_TYPE_FALLBACK } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useMovements, useMyStock } from '@/lib/queries'

/**
 * What the technician is carrying. Read-only on purpose: stock reaches a van
 * by the storekeeper handing it over, and leaves it by being reported on a
 * job — never by editing a number here.
 */
export function MyStock() {
    const { data: lines, isLoading } = useMyStock()
    const { data: movements } = useMovements({ per_page: 20 })

    return (
        <>
            <PageHeader
                title="عهدتي"
                subtitle={lines ? `${lines.length} صنف معك` : undefined}
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !lines?.length ? (
                <EmptyState
                    icon={Package}
                    title="عهدتك فارغة"
                    description="لم يُسلَّم إليك أي قطع غيار بعد. راجع أمين المخزن."
                />
            ) : (
                <div className="space-y-2">
                    {lines.map((line) => (
                        <div key={line.item_id} className="card flex items-center justify-between gap-3 p-4">
                            <div className="min-w-0">
                                <p className="truncate font-bold text-navy-900">{line.name}</p>
                                <span className={clsx('badge mt-1', ITEM_CATEGORY[line.category].chip)}>
                                    {ITEM_CATEGORY[line.category].label}
                                </span>
                            </div>
                            <p className="tabular shrink-0 text-lg font-extrabold text-brand-600">
                                {formatQty(line.qty)}{' '}
                                <span className="text-xs font-semibold text-navy-400">{line.unit}</span>
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Their own movements only — the API scopes this to their van. */}
            {movements && movements.data.length > 0 && (
                <section className="mt-6">
                    <h2 className="mb-3 font-bold text-navy-900">آخر الحركات</h2>

                    <div className="space-y-2">
                        {movements.data.map((movement) => {
                            const meta = MOVEMENT_TYPE[movement.type] ?? MOVEMENT_TYPE_FALLBACK

                            return (
                                <div key={movement.id} className="card p-3.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <span className={clsx('badge', meta.chip)}>
                                                {movement.type_label}
                                            </span>
                                            <p className="mt-1 truncate text-sm font-bold text-navy-900">
                                                {movement.item?.name}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-navy-400">
                                                {movement.task_code && `${movement.task_code} · `}
                                                {formatSmart(movement.created_at)}
                                            </p>
                                        </div>
                                        <p className="tabular shrink-0 font-extrabold text-navy-900">
                                            {meta.sign}
                                            {formatQty(movement.qty)}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}
        </>
    )
}

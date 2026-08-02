import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { Package, Plus, Receipt, Wallet } from 'lucide-react'
import { useState } from 'react'
import { CustodyExpenseModal } from '@/components/CustodyExpenseModal'
import { Button, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import {
    formatMoney,
    formatQty,
    ITEM_CATEGORY,
    MOVEMENT_TYPE,
    MOVEMENT_TYPE_FALLBACK,
} from '@/lib/domain'
import { formatDate, formatSmart } from '@/lib/format'
import { useMovements, useMyCustody, useMyStock } from '@/lib/queries'

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

            {/* The float and what has been spent from it. It sat on the home
                screen, a page away from the stock it is spent alongside — on a
                phone that is two screens for one question. */}
            <MyCustodyCard />

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

function MyCustodyCard() {
    const { data, isLoading } = useMyCustody()
    const [spending, setSpending] = useState(false)

    if (isLoading || !data) return <div className="mt-6 shimmer h-24 rounded-2xl" />

    const balance = data.cash.balance
    const expenses = data.expenses ?? []

    return (
        <section className="mt-6">
            <div className="card p-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                            <Wallet className="size-5" />
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-navy-400">رصيد العهدة النقدية</p>
                            <p className={clsx('tabular text-2xl font-extrabold', balance < 0 ? 'text-red-700' : 'text-navy-900')}>
                                {formatMoney(balance)}
                            </p>
                        </div>
                    </div>

                    <Button icon={Plus} onClick={() => setSpending(true)}>
                        {tr('تسجيل مصروف')}
                    </Button>
                </div>

                {balance < 0 && (
                    <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                        عهدتك بالسالب {formatMoney(balance)} — صرفت أكثر من عهدتك، والفرق مستحق لك من الإدارة.
                    </p>
                )}

                {expenses.length > 0 && (
                    <div className="mt-4 border-t border-navy-100 pt-3">
                        <p className="mb-2 text-[11px] font-bold text-navy-400">آخر المصروفات</p>
                        <div className="space-y-1.5">
                            {expenses.slice(0, 4).map((expense) => (
                                <div key={expense.id} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="flex min-w-0 items-center gap-2 text-navy-700">
                                        <Receipt className="size-3.5 shrink-0 text-navy-300" />
                                        <span className="truncate">{expense.category ?? 'مصروف'}</span>
                                        <span className="tabular shrink-0 text-[10px] text-navy-400">
                                            {formatDate(expense.created_at)}
                                        </span>
                                    </span>
                                    <span className="tabular shrink-0 font-bold text-navy-900">
                                        {formatMoney(expense.amount)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {spending && <CustodyExpenseModal balance={balance} onClose={() => setSpending(false)} />}
        </section>
    )
}

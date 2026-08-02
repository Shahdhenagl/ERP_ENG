import { Link } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { usePartsUsed } from '@/lib/queries'

/**
 * Spare parts consumed on jobs — what the field used and what it cost, straight
 * off the stock ledger's issues to work orders. The maintenance read of the
 * same movements the inventory log carries.
 */
export function PartsUsedPage() {
    const { path } = useArea()
    const { data, isLoading } = usePartsUsed()

    return (
        <>
            <PageHeader
                title="قطع الغيار المستخدمة"
                subtitle={
                    data
                        ? `${data.data.length} حركة صرف · ${formatMoney(data.meta.total_value)}`
                        : 'القطع المصروفة على أوامر العمل'
                }
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Wrench}
                    title="لا توجد قطع مصروفة"
                    description="القطع المصروفة من المخزن على أوامر العمل تظهر هنا بتكلفتها."
                />
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-navy-100">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                            <tr>
                                <th className="px-3 py-2 text-start">الصنف</th>
                                <th className="w-20 px-2 py-2 text-center">الكمية</th>
                                <th className="w-24 px-2 py-2 text-left">التكلفة</th>
                                <th className="px-3 py-2 text-start">أمر العمل</th>
                                <th className="px-3 py-2 text-start">العميل</th>
                                <th className="w-24 px-2 py-2 text-start">التاريخ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((row) => (
                                <tr key={row.id} className="border-t border-navy-100">
                                    <td className="px-3 py-2.5">
                                        <p className="font-bold text-navy-900">{row.item}</p>
                                        {row.item_code && (
                                            <p className="tabular text-[10px] text-navy-400">{row.item_code}</p>
                                        )}
                                    </td>
                                    <td className="tabular px-2 py-2.5 text-center text-navy-700">
                                        {formatQty(row.qty)}
                                        {row.unit ? ` ${row.unit}` : ''}
                                    </td>
                                    <td className="tabular px-2 py-2.5 text-left font-bold text-navy-900">
                                        {formatMoney(row.value)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {row.task_id ? (
                                            <Link
                                                to={path(`/tasks/${row.task_id}`)}
                                                className="tabular text-[11px] font-bold text-brand-600 hover:underline"
                                            >
                                                {row.task_code}
                                            </Link>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 text-navy-600">{row.customer ?? '—'}</td>
                                    <td className="tabular px-2 py-2.5 text-navy-500">
                                        {formatDate(row.date)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    )
}

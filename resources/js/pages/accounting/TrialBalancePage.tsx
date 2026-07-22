import clsx from 'clsx'
import { Scale } from 'lucide-react'
import { EmptyState, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { useTrialBalance } from '@/lib/queries'
import { useAccounting } from '@/pages/accounting/AccountingLayout'

/**
 * Every account that moved, both sides, and the balance it ended on.
 *
 * The two totals at the foot must agree. When they do not, something has
 * written the journal other than the ledger service — so the difference is
 * stated plainly rather than rounded into the footer.
 */
export function TrialBalancePage() {
    const { period } = useAccounting()
    const { data, isLoading } = useTrialBalance(period.range)

    if (isLoading && !data) return <SkeletonCard />
    if (!data?.rows.length) return <EmptyState icon={Scale} title="لا توجد حركة في هذه الفترة" />

    const level = Math.abs(data.difference) < 0.005

    return (
        <div className="space-y-4">
            <div
                className={clsx(
                    'flex items-center justify-between rounded-2xl p-4',
                    level
                        ? 'bg-emerald-50 ring-1 ring-emerald-200'
                        : 'bg-red-50 ring-1 ring-red-200',
                )}
            >
                <span className="text-sm font-bold text-navy-700">
                    {level ? 'الميزان متوازن' : 'الميزان غير متوازن'}
                </span>
                <span
                    className={clsx(
                        'tabular text-lg font-extrabold',
                        level ? 'text-emerald-700' : 'text-red-700',
                    )}
                >
                    {level ? formatMoney(data.debit_total) : `فرق ${formatMoney(data.difference)}`}
                </span>
            </div>

            <div className="card overflow-x-auto">
                <table className="doc-table">
                    <thead>
                        <tr>
                            <th className="w-20">الحساب</th>
                            <th>الاسم</th>
                            <th className="w-28 text-left">مدين</th>
                            <th className="w-28 text-left">دائن</th>
                            <th className="w-28 text-left">رصيد مدين</th>
                            <th className="w-28 text-left">رصيد دائن</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row) => (
                            <tr key={row.id}>
                                <td className="tabular text-navy-500">{row.code}</td>
                                <td>
                                    <span className="font-semibold text-navy-800">{row.name}</span>
                                    <span className="block text-[11px] text-navy-400">
                                        {row.type_label}
                                    </span>
                                </td>
                                <td className="tabular text-left">
                                    {row.debit > 0 ? formatMoney(row.debit) : '—'}
                                </td>
                                <td className="tabular text-left">
                                    {row.credit > 0 ? formatMoney(row.credit) : '—'}
                                </td>
                                <td className="tabular text-left font-semibold text-navy-900">
                                    {row.balance_debit > 0 ? formatMoney(row.balance_debit) : '—'}
                                </td>
                                <td className="tabular text-left font-semibold text-navy-900">
                                    {row.balance_credit > 0 ? formatMoney(row.balance_credit) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="font-extrabold">
                            <td colSpan={2}>الإجمالي</td>
                            <td className="tabular text-left">{formatMoney(data.debit_total)}</td>
                            <td className="tabular text-left">{formatMoney(data.credit_total)}</td>
                            <td className="tabular text-left">
                                {formatMoney(data.balance_debit_total)}
                            </td>
                            <td className="tabular text-left">
                                {formatMoney(data.balance_credit_total)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}

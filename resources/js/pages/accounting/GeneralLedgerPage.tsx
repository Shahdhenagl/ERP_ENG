import clsx from 'clsx'
import { BookOpen } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, Field, Select, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useAccountLedger, useAccounts } from '@/lib/queries'
import { useAccounting } from '@/pages/accounting/AccountingLayout'

/**
 * One account's movements, with the balance carried down the page.
 *
 * The chosen account lives in the query string so a row in the chart can link
 * straight here, and so the page a manager is looking at survives being sent to
 * someone else.
 */
export function GeneralLedgerPage() {
    const { period } = useAccounting()
    const [params, setParams] = useSearchParams()

    const { data: accounts } = useAccounts()
    const postable = (accounts ?? []).filter((account) => !account.is_group)

    // Falling back to the first postable account means the page has something
    // to show on arrival rather than an empty frame and a dropdown.
    const selected = params.get('account') ?? (postable[0] ? String(postable[0].id) : '')
    const { data, isLoading } = useAccountLedger(selected ? Number(selected) : null, period.range)

    return (
        <>
            <Field label="الحساب" className="mb-4">
                <Select
                    value={selected}
                    onChange={(e) => setParams({ account: e.target.value }, { replace: true })}
                >
                    {postable.map((account) => (
                        <option key={account.id} value={account.id}>
                            {account.code} · {account.name}
                        </option>
                    ))}
                </Select>
            </Field>

            {isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Figure label="أول المدة" value={data.opening_balance} tone="muted" />
                        <Figure label="مدين" value={data.debit_total} tone="up" />
                        <Figure label="دائن" value={data.credit_total} tone="down" />
                        <Figure label="الرصيد" value={data.closing_balance} tone="brand" />
                    </div>

                    {data.rows.length === 0 ? (
                        <EmptyState icon={BookOpen} title="لا توجد حركة على هذا الحساب في الفترة" />
                    ) : (
                        <div className="card overflow-x-auto">
                            <table className="doc-table">
                                <thead>
                                    <tr>
                                        <th className="w-24">التاريخ</th>
                                        <th className="w-28">القيد</th>
                                        <th>البيان</th>
                                        <th className="w-28 text-left">مدين</th>
                                        <th className="w-28 text-left">دائن</th>
                                        <th className="w-32 text-left">الرصيد</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="tabular text-navy-500">
                                                {row.date ? formatDate(row.date) : '—'}
                                            </td>
                                            <td className="tabular text-xs text-navy-500">
                                                {row.code}
                                            </td>
                                            <td>
                                                <span className="font-semibold text-navy-800">
                                                    {row.memo ?? row.source_label}
                                                </span>
                                                {row.cost_center && (
                                                    <span className="block text-[11px] text-navy-400">
                                                        {row.cost_center}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="tabular text-left text-emerald-700">
                                                {row.debit > 0 ? formatMoney(row.debit) : '—'}
                                            </td>
                                            <td className="tabular text-left text-red-700">
                                                {row.credit > 0 ? formatMoney(row.credit) : '—'}
                                            </td>
                                            <td className="tabular text-left font-bold text-navy-900">
                                                {formatMoney(row.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}

function Figure({
    label,
    value,
    tone,
}: {
    label: string
    value: number
    tone: 'up' | 'down' | 'brand' | 'muted'
}) {
    const colour = {
        up: 'text-emerald-700',
        down: 'text-red-700',
        brand: 'text-brand-700',
        muted: 'text-navy-500',
    }[tone]

    return (
        <div className="card p-4">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p className={clsx('tabular mt-1 text-lg font-extrabold', colour)}>
                {formatMoney(value)}
            </p>
        </div>
    )
}

import clsx from 'clsx'
import { useSearchParams, useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentTotals } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useStatement } from '@/lib/queries'

/**
 * A customer's account: what was billed, what was collected, and the balance
 * carried down the page. This is what gets sent when chasing money.
 */
export function StatementPrint() {
    const { id } = useParams<{ id: string }>()
    const [params] = useSearchParams()

    const { data, isLoading, isError, refetch } = useStatement(id, {
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
    })

    if (isError) return <ErrorState message="تعذّر تحميل كشف الحساب." onRetry={() => void refetch()} />
    if (isLoading || !data) return <PageLoader />

    const { meta, data: rows } = data

    const period = [meta.from && `من ${formatDate(meta.from)}`, meta.to && `حتى ${formatDate(meta.to)}`]
        .filter(Boolean)
        .join(' ')

    return (
        <DocumentShell title="كشف حساب عميل" subtitle={period || 'منذ بداية التعامل'}>
            <DocumentParty
                heading="العميل"
                rows={[
                    ['الاسم', meta.customer.name],
                    ['الشركة', meta.customer.company],
                    ['الكود', meta.customer.code],
                    ['الهاتف', meta.customer.phone],
                    ['العنوان', meta.customer.address],
                ]}
            />

            {rows.length === 0 ? (
                <p className="doc-keep mt-6 rounded-lg bg-navy-50 p-4 text-center text-[13px] text-navy-400">
                    لا توجد حركات في هذه الفترة.
                </p>
            ) : (
                <table className="doc-table mt-5">
                    <thead>
                        <tr>
                            <th className="w-24">التاريخ</th>
                            <th className="w-20">النوع</th>
                            <th className="w-28">المستند</th>
                            <th>البيان</th>
                            <th className="w-24 text-left">مدين</th>
                            <th className="w-24 text-left">دائن</th>
                            <th className="w-28 text-left">الرصيد</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={`${row.code}-${index}`}>
                                <td className="tabular text-navy-500">
                                    {row.date ? formatDate(row.date) : '—'}
                                </td>
                                <td
                                    className={clsx(
                                        'font-bold',
                                        row.type === 'invoice' ? 'text-navy-700' : 'text-emerald-700',
                                    )}
                                >
                                    {row.type_label}
                                </td>
                                <td className="tabular text-navy-600">{row.code}</td>
                                <td className="text-navy-500">{row.note}</td>
                                <td className="tabular text-left">
                                    {row.debit > 0 ? formatMoney(row.debit) : '—'}
                                </td>
                                <td className="tabular text-left">
                                    {row.credit > 0 ? formatMoney(row.credit) : '—'}
                                </td>
                                <td className="tabular text-left font-bold text-navy-900">
                                    {formatMoney(row.balance)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <DocumentTotals
                rows={[
                    ['إجمالي الفواتير', formatMoney(meta.total_invoiced)],
                    ['إجمالي التحصيل', formatMoney(meta.total_collected)],
                ]}
                total={formatMoney(meta.balance)}
                totalLabel="الرصيد المستحق"
            />
        </DocumentShell>
    )
}

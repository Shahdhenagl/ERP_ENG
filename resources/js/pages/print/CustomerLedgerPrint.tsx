import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useCustomerTimeline } from '@/lib/queries'

/**
 * A customer's whole dealing history on one sheet — quotes, invoices, receipts,
 * returns, contracts and service tickets in date order. The full log the ledger
 * shows on screen, made printable.
 */
export function CustomerLedgerPrint() {
    const { id } = useParams<{ id: string }>()
    const { data, isLoading, isError, refetch } = useCustomerTimeline(Number(id) || undefined)

    if (isError) return <ErrorState message="تعذّر تحميل السجل." onRetry={() => void refetch()} />
    if (isLoading || !data) return <PageLoader />

    const { meta, data: rows } = data

    return (
        <DocumentShell title="سجل تعاملات العميل" subtitle={`${rows.length} حركة`}>
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
                    لا توجد حركات على هذا العميل.
                </p>
            ) : (
                <table className="doc-table mt-5">
                    <thead>
                        <tr>
                            <th className="w-24">التاريخ</th>
                            <th className="w-24">النوع</th>
                            <th className="w-28">المستند</th>
                            <th>البيان</th>
                            <th className="w-28 text-left">القيمة</th>
                            <th className="w-24">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={`${row.code}-${index}`}>
                                <td className="tabular text-navy-500">
                                    {row.date ? formatDate(row.date) : '—'}
                                </td>
                                <td className="font-bold text-navy-700">{row.type_label}</td>
                                <td className="tabular text-navy-600">{row.code ?? '—'}</td>
                                <td className="text-navy-600">{row.title ?? '—'}</td>
                                <td className="tabular text-left">
                                    {row.amount !== null ? formatMoney(row.amount) : '—'}
                                </td>
                                <td className="text-navy-600">{row.status ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </DocumentShell>
    )
}

import clsx from 'clsx'
import { useParams, useSearchParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentTotals } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useSupplierStatement } from '@/lib/queries'

/**
 * A supplier's account: what they delivered and billed, what was paid, and the
 * balance carried down the page. The sheet sent when agreeing a position with
 * them, so it opens with the balance brought forward rather than starting at
 * zero and quietly disagreeing.
 */
export function SupplierStatementPrint() {
    const { id } = useParams<{ id: string }>()
    const [params] = useSearchParams()

    const { data, isLoading, isError, refetch } = useSupplierStatement(id ? Number(id) : undefined, {
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
    })

    if (isError) return <ErrorState message="تعذّر تحميل كشف الحساب." onRetry={() => void refetch()} />
    if (isLoading || !data) return <PageLoader />

    const period = [
        data.period.from && `من ${formatDate(data.period.from)}`,
        data.period.to && `حتى ${formatDate(data.period.to)}`,
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <DocumentShell title="كشف حساب مورّد" subtitle={period || 'منذ بداية التعامل'}>
            <DocumentParty
                heading="المورّد"
                rows={[
                    ['الاسم', data.supplier.name],
                    ['الشركة', data.supplier.company],
                    ['الكود', data.supplier.code],
                    ['الهاتف', data.supplier.phone],
                    ['الرقم الضريبي', data.supplier.tax_id],
                ]}
            />

            <table className="doc-table mt-5">
                <thead>
                    <tr>
                        <th className="w-24">التاريخ</th>
                        <th className="w-24">النوع</th>
                        <th className="w-28">المستند</th>
                        <th>البيان</th>
                        <th className="w-24 text-left">مدين</th>
                        <th className="w-24 text-left">دائن</th>
                        <th className="w-28 text-left">الرصيد</th>
                    </tr>
                </thead>
                <tbody>
                    {/* Where the account stood before the period opened. Without
                        it the closing figure cannot be checked against anything. */}
                    <tr className="bg-navy-50">
                        <td colSpan={4} className="font-bold text-navy-700">
                            رصيد أول المدة
                        </td>
                        <td />
                        <td />
                        <td className="tabular text-left font-bold text-navy-800">
                            {formatMoney(data.opening_balance)}
                        </td>
                    </tr>

                    {data.rows.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="py-4 text-center text-navy-400">
                                لا توجد حركات في هذه الفترة.
                            </td>
                        </tr>
                    ) : (
                        data.rows.map((row, index) => (
                            <tr key={`${row.type}-${row.code}-${index}`}>
                                <td className="tabular text-navy-500">
                                    {row.date ? formatDate(row.date) : '—'}
                                </td>
                                <td className="text-navy-600">{row.type_label}</td>
                                <td className="tabular text-navy-600">{row.code}</td>
                                <td className="text-navy-700">{row.note ?? '—'}</td>
                                <td className="tabular text-left text-navy-700">
                                    {row.debit ? formatMoney(row.debit) : '—'}
                                </td>
                                <td className="tabular text-left text-navy-700">
                                    {row.credit ? formatMoney(row.credit) : '—'}
                                </td>
                                <td
                                    className={clsx(
                                        'tabular text-left font-bold',
                                        row.balance > 0 ? 'text-amber-700' : 'text-navy-700',
                                    )}
                                >
                                    {formatMoney(row.balance)}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {/* Goods booked in whose invoice has not arrived. Owed, and not on
                any line above — so it is stated rather than left to surprise. */}
            {data.uninvoiced > 0 && (
                <p className="doc-keep mt-3 rounded-lg bg-amber-50 p-3 text-[12px] text-amber-800">
                    مستلَم بلا فاتورة بعد:{' '}
                    <strong className="tabular">{formatMoney(data.uninvoiced)}</strong> — محمَّل على
                    الرصيد أعلاه، وبانتظار فاتورة المورّد.
                </p>
            )}

            <DocumentTotals
                rows={[
                    ['رصيد أول المدة', formatMoney(data.opening_balance)],
                    ['إجمالي المستحق خلال المدة', formatMoney(data.total_credit)],
                    ['إجمالي المسدَّد والمرتجع', formatMoney(data.total_debit)],
                ]}
                total={formatMoney(data.closing_balance)}
                totalLabel="رصيد آخر المدة"
            />
        </DocumentShell>
    )
}

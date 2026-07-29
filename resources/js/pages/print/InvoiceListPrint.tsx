import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DocumentShell } from '@/components/DocumentShell'
import { monthDayRange } from '@/components/MonthDayFilter'
import { PageLoader } from '@/components/ui'
import { formatMoney, PAYMENT_STATE } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useInvoices } from '@/lib/queries'

const MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const SOURCE_LABELS: Record<string, string> = {
    sales: 'مبيعات',
    contract: 'عقود صيانة',
    warranty: 'ضمان',
    service: 'أوامر شغل',
    manual: 'يدوية',
}

function filterSummary(params: URLSearchParams): string {
    const parts: string[] = []
    if (params.get('outstanding')) parts.push('غير محصّلة')
    if (params.get('overdue')) parts.push('متأخرة')
    const source = params.get('source')
    if (source && SOURCE_LABELS[source]) parts.push(SOURCE_LABELS[source])
    const month = params.get('month')
    const day = params.get('day')
    if (day) parts.push(formatDate(day))
    else if (month) {
        const [y, m] = month.split('-').map(Number)
        parts.push(`${MONTHS[m - 1]} ${y}`)
    }
    if (params.get('search')) parts.push(`بحث: ${params.get('search')}`)

    return parts.length ? parts.join(' · ') : 'كل الفواتير'
}

/** The invoice list, printed under whatever filters it was viewed with. */
export function InvoiceListPrint() {
    const [params] = useSearchParams()

    const filters = useMemo(() => {
        const entries = Object.fromEntries(params.entries())
        const { month, day, page, ...rest } = entries

        return { ...rest, ...monthDayRange(month ?? '', day ?? ''), per_page: '1000' }
    }, [params])

    const { data, isLoading } = useInvoices(filters)

    if (isLoading || !data) return <PageLoader />

    const invoices = data.data
    const total = invoices.reduce((sum, i) => sum + i.total, 0)
    const balance = invoices.reduce((sum, i) => sum + (i.balance ?? 0), 0)

    return (
        <DocumentShell
            title="قائمة الفواتير"
            subtitle={filterSummary(params)}
            footer={<p>عدد الفواتير: {invoices.length}</p>}
        >
            {invoices.length === 0 ? (
                <p className="rounded-lg bg-navy-50 p-4 text-center text-[13px] text-navy-500">
                    لا توجد فواتير مطابقة.
                </p>
            ) : (
                <table className="doc-table">
                    <thead>
                        <tr>
                            <th className="w-24">الكود</th>
                            <th>العميل</th>
                            <th className="w-24">التاريخ</th>
                            <th className="w-24">الحالة</th>
                            <th className="w-28 text-left">الإجمالي</th>
                            <th className="w-28 text-left">المتبقي</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map((invoice) => (
                            <tr key={invoice.id}>
                                <td className="tabular text-navy-600">{invoice.code}</td>
                                <td className="text-navy-700">{invoice.customer?.name ?? '—'}</td>
                                <td className="tabular text-navy-500">
                                    {invoice.issue_date ? formatDate(invoice.issue_date) : '—'}
                                </td>
                                <td className="text-navy-600">
                                    {PAYMENT_STATE[invoice.payment_state]?.label ?? invoice.payment_state}
                                </td>
                                <td className="tabular text-left font-semibold text-navy-900">
                                    {formatMoney(invoice.total)}
                                </td>
                                <td className="tabular text-left text-amber-700">
                                    {invoice.balance > 0 ? formatMoney(invoice.balance) : '—'}
                                </td>
                            </tr>
                        ))}
                        <tr className="font-extrabold">
                            <td colSpan={4} className="text-left">الإجمالي</td>
                            <td className="tabular text-left">{formatMoney(total)}</td>
                            <td className="tabular text-left">{formatMoney(balance)}</td>
                        </tr>
                    </tbody>
                </table>
            )}
        </DocumentShell>
    )
}

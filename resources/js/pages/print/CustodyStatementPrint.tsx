import { useParams, useSearchParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useCustodyStatement } from '@/lib/queries'

const MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/** A YYYY-MM into «يوليو 2026», or null when no month was chosen. */
function monthLabel(month: string | null): string | null {
    if (!month) return null
    const [year, m] = month.split('-')
    return `${MONTHS[Number(m) - 1] ?? m} ${year}`
}

/**
 * The employee custody statement, printed: the cash float, the stock in their
 * van and the devices in their hands as they stand today, and the expenses they
 * paid — for a chosen month, or the recent lot when none is named. The single
 * total is what the company is exposed with this person.
 */
export function CustodyStatementPrint() {
    const { id } = useParams<{ id: string }>()
    const [params] = useSearchParams()
    const month = params.get('month')

    const { data, isLoading, isError, refetch } = useCustodyStatement(
        id ? Number(id) : undefined,
        month ?? undefined,
    )

    if (isLoading) return <PageLoader />
    if (isError) return <ErrorState message="تعذّر تحميل الكشف." onRetry={() => void refetch()} />
    if (!data) return null

    const expenses = data.expenses ?? []
    const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0)
    const period = monthLabel(month)

    return (
        <DocumentShell
            title={`كشف عهدة ${data.technician.name}`}
            subtitle={period ? `عن شهر ${period}` : undefined}
            footer={<p>يُعتمد هذا الكشف بتوقيع الموظف والإدارة.</p>}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="الموظف"
                    rows={[
                        ['الاسم', data.technician.name],
                        ['الوظيفة', data.technician.job_title],
                        ['الهاتف', data.technician.phone],
                    ]}
                />
                <DocumentParty
                    heading="ملخص المسؤولية"
                    rows={[
                        ['نقدية في العهدة', formatMoney(data.cash.balance)],
                        ['قيمة المخزون', formatMoney(data.stock.value)],
                        ['عدد الأجهزة', String(data.devices.length)],
                    ]}
                />
            </div>

            <div className="doc-keep mt-5 flex items-baseline justify-between rounded-lg border-2 border-navy-900 p-4">
                <span className="text-[13px] font-bold text-navy-500">إجمالي المسؤولية</span>
                <span className="tabular text-2xl font-extrabold text-navy-900">
                    {formatMoney(data.total_value)}
                </span>
            </div>

            {data.stock.lines.length > 0 && (
                <section className="mt-6">
                    <h2 className="mb-2 text-sm font-bold text-navy-800">المخزون في العهدة</h2>
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th>الصنف</th>
                                <th className="w-28 text-left">الكمية</th>
                                <th className="w-32 text-left">القيمة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.stock.lines.map((line) => (
                                <tr key={line.item_id}>
                                    <td>{line.name}</td>
                                    <td className="tabular text-left">
                                        {formatQty(line.qty)} {line.unit}
                                    </td>
                                    <td className="tabular text-left">{formatMoney(line.value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            {data.devices.length > 0 && (
                <section className="mt-6">
                    <h2 className="mb-2 text-sm font-bold text-navy-800">الأجهزة في العهدة</h2>
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th>الجهاز</th>
                                <th>السبب</th>
                                <th className="w-28 text-left">منذ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.devices.map((device) => (
                                <tr key={device.id}>
                                    <td>
                                        {device.asset}
                                        {device.serial && (
                                            <span className="tabular mr-1.5 text-[11px] text-navy-400">
                                                {device.serial}
                                            </span>
                                        )}
                                    </td>
                                    <td>{device.reason_label}</td>
                                    <td className="tabular text-left">
                                        {device.taken_at ? formatDate(device.taken_at) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <section className="mt-6">
                <h2 className="mb-2 text-sm font-bold text-navy-800">
                    المصروفات{period ? ` — ${period}` : ''}
                </h2>
                {expenses.length === 0 ? (
                    <p className="rounded-lg bg-navy-50 p-3 text-center text-[13px] text-navy-400">
                        لا توجد مصروفات في هذه الفترة.
                    </p>
                ) : (
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th className="w-24">التاريخ</th>
                                <th>البند</th>
                                <th>المهمة</th>
                                <th className="w-28 text-left">المبلغ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.map((expense) => (
                                <tr key={expense.id}>
                                    <td className="tabular text-navy-500">
                                        {formatDate(expense.created_at)}
                                    </td>
                                    <td>
                                        {expense.category ?? 'مصروف'}
                                        {expense.note && (
                                            <span className="block text-[11px] text-navy-400">
                                                {expense.note}
                                            </span>
                                        )}
                                    </td>
                                    <td className="tabular text-navy-500">{expense.task_code ?? '—'}</td>
                                    <td className="tabular text-left font-bold">
                                        {formatMoney(expense.amount)}
                                    </td>
                                </tr>
                            ))}
                            <tr className="font-extrabold">
                                <td colSpan={3} className="text-left">الإجمالي</td>
                                <td className="tabular text-left">{formatMoney(expensesTotal)}</td>
                            </tr>
                        </tbody>
                    </table>
                )}
            </section>

            <DocumentSignatures labels={['الموظف', 'أمين الخزينة', 'الاعتماد']} />
        </DocumentShell>
    )
}

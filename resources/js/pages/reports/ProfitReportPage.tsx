import clsx from 'clsx'
import { SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useProfitReport } from '@/lib/queries'
import { Empty, Figure, Section } from '@/pages/reports/parts'
import { useReports } from '@/pages/reports/ReportsLayout'

export function ProfitReportPage() {
    const { period } = useReports()
    const { data, isLoading } = useProfitReport(period.range)

    if (isLoading || !data) return <SkeletonCard />

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="الإيراد" value={formatMoney(data.revenue)} tone="up" />
                <Figure label="تكلفة المبيعات" value={formatMoney(data.cost_of_sales)} tone="down" />
                <Figure
                    label="مجمل الربح"
                    value={formatMoney(data.gross_profit)}
                    tone="brand"
                    hint={`هامش ${data.gross_margin_pct}%`}
                />
                <Figure
                    label="صافي الربح"
                    value={formatMoney(data.net_profit)}
                    tone={data.net_profit >= 0 ? 'up' : 'down'}
                />
            </div>

            {/* Said out loud: a reader who does not know it will assume the
                report and the books are two separate answers. */}
            <p className="mt-3 rounded-xl bg-navy-50 p-3 text-[11px] text-navy-500">
                هذه الأرقام مقروءة من قائمة الدخل نفسها، فلا يمكن أن تختلف عن المحاسبة.
            </p>

            <Section title="ربحية أوامر العمل المفوترة" count={data.jobs.length}>
                {data.jobs.length === 0 ? (
                    <Empty>لا توجد أوامر عمل مفوترة في هذه الفترة.</Empty>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="doc-table">
                            <thead>
                                <tr>
                                    <th>الفاتورة</th>
                                    <th>العميل</th>
                                    <th className="w-24">التاريخ</th>
                                    <th className="w-24 text-left">الإيراد</th>
                                    <th className="w-24 text-left">القطع</th>
                                    <th className="w-24 text-left">الربح</th>
                                    <th className="w-20 text-left">الهامش</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.jobs.map((job) => (
                                    <tr key={job.invoice_id}>
                                        <td>
                                            <span className="tabular font-semibold text-navy-800">
                                                {job.code}
                                            </span>
                                            {job.task_code && (
                                                <span className="tabular block text-[11px] text-navy-400">
                                                    {job.task_code}
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-navy-600">{job.customer}</td>
                                        <td className="tabular text-navy-500">
                                            {job.date ? formatDate(job.date) : '—'}
                                        </td>
                                        <td className="tabular text-left">
                                            {formatMoney(job.revenue)}
                                        </td>
                                        <td className="tabular text-left text-red-700">
                                            {formatMoney(job.parts_cost)}
                                        </td>
                                        <td
                                            className={clsx(
                                                'tabular text-left font-bold',
                                                job.margin >= 0
                                                    ? 'text-emerald-700'
                                                    : 'text-red-700',
                                            )}
                                        >
                                            {formatMoney(job.margin)}
                                        </td>
                                        <td
                                            className={clsx(
                                                'tabular text-left font-bold',
                                                job.margin_pct >= 30
                                                    ? 'text-emerald-700'
                                                    : job.margin_pct >= 0
                                                      ? 'text-amber-600'
                                                      : 'text-red-700',
                                            )}
                                        >
                                            {job.margin_pct}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>
        </>
    )
}

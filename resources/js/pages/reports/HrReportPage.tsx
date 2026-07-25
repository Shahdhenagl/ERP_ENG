import { SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { useHrReport } from '@/lib/queries'
import { Empty, Figure, Ranked, Section } from '@/pages/reports/parts'
import { useReports } from '@/pages/reports/ReportsLayout'

/**
 * The workforce as numbers: who is on the books, what the month costs, and the
 * payroll that actually ran over the period.
 *
 * The payroll figures are summed off the slips each run froze, not recomputed
 * from salaries — the run is the record, this only totals it, so the report and
 * the مسير can never put a different number on the same month.
 */
export function HrReportPage() {
    const { period } = useReports()
    const { data, isLoading } = useHrReport(period.range)

    if (isLoading || !data) return <SkeletonCard />

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure
                    label="على رأس العمل"
                    value={String(data.headcount)}
                    tone="brand"
                    hint={`${data.total_on_book} بالسجل`}
                />
                <Figure label="الرواتب الشهرية" value={formatMoney(data.monthly_gross)} />
                <Figure
                    label="صافي مسير الفترة"
                    value={formatMoney(data.payroll.net)}
                    hint={`${data.payroll.runs} مسير`}
                />
                <Figure
                    label="سلف قائمة"
                    value={formatMoney(data.advances_outstanding)}
                    tone={data.advances_outstanding > 0 ? 'warn' : undefined}
                    hint={`${data.new_hires} تعيين جديد بالفترة`}
                />
            </div>

            <Section title="الموظفون حسب القسم" count={data.by_department.length}>
                {data.by_department.length ? (
                    <Ranked
                        rows={data.by_department.map((row) => ({
                            key: row.department,
                            label: row.department,
                            note: `${row.count} موظف`,
                            value: row.payroll,
                        }))}
                    />
                ) : (
                    <Empty>لا يوجد موظفون على رأس العمل.</Empty>
                )}
            </Section>

            <Section title="مسير الفترة">
                <div className="grid grid-cols-3 gap-3 text-center">
                    <Tile label="الإجمالي" value={formatMoney(data.payroll.gross)} />
                    <Tile label="الاستقطاعات" value={formatMoney(data.payroll.deductions)} />
                    <Tile label="الصافي" value={formatMoney(data.payroll.net)} />
                </div>
            </Section>

            <div className="grid gap-4 lg:grid-cols-2">
                <Section title="الإجازات المعتمدة" count={data.leave.reduce((sum, row) => sum + row.days, 0)}>
                    {data.leave.length ? (
                        <div className="space-y-2">
                            {data.leave.map((row) => (
                                <Row key={row.type} label={row.label} value={`${row.days} يوم`} note={`${row.requests} طلب`} />
                            ))}
                        </div>
                    ) : (
                        <Empty>لا إجازات معتمدة في الفترة.</Empty>
                    )}
                </Section>

                <Section title="الحضور والغياب" count={data.attendance.reduce((sum, row) => sum + row.count, 0)}>
                    {data.attendance.length ? (
                        <div className="space-y-2">
                            {data.attendance.map((row) => (
                                <Row key={row.status} label={row.label} value={String(row.count)} />
                            ))}
                        </div>
                    ) : (
                        <Empty>لا سجلات حضور في الفترة.</Empty>
                    )}
                </Section>
            </div>
        </>
    )
}

function Tile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-navy-50 p-3">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p className="tabular mt-1 text-sm font-extrabold text-navy-900">{value}</p>
        </div>
    )
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-navy-700">
                {label}
                {note && <span className="tabular mr-1.5 text-[11px] text-navy-400">{note}</span>}
            </span>
            <span className="tabular shrink-0 font-bold text-navy-900">{value}</span>
        </div>
    )
}

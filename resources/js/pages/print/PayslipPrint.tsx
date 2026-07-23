import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentTotals } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { usePayslip } from '@/lib/queries'

/**
 * قسيمة راتب — a month's pay for one employee, on one sheet.
 *
 * Earnings on one side, deductions on the other, and what is left. The figures
 * are the ones frozen when the run was approved, not recomputed here, so the
 * printed slip and the posted books tell the same story.
 */
export function PayslipPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: slip, isLoading, isError, refetch } = usePayslip(id)

    if (isLoading) return <PageLoader />
    if (isError) return <ErrorState message="تعذّر تحميل القسيمة." onRetry={() => void refetch()} />
    if (!slip) return null

    const deductionRows: Array<[string, string]> = []
    if (slip.unpaid_deduction > 0)
        deductionRows.push([`إجازات بدون أجر (${slip.unpaid_days} يوم)`, formatMoney(slip.unpaid_deduction)])
    if (slip.insurance > 0) deductionRows.push(['تأمينات اجتماعية', formatMoney(slip.insurance)])
    if (slip.tax > 0) deductionRows.push(['ضريبة كسب عمل', formatMoney(slip.tax)])
    if (slip.advance_recovery > 0) deductionRows.push(['استرداد سلفة', formatMoney(slip.advance_recovery)])
    if (slip.other_deductions > 0)
        deductionRows.push([slip.other_note || 'خصومات أخرى', formatMoney(slip.other_deductions)])

    return (
        <DocumentShell
            title="قسيمة راتب"
            subtitle={slip.month ?? slip.run_code ?? ''}
            footer={<p>هذه القسيمة بيان بالمستحقات والخصومات ولا تُغني عن سند الصرف.</p>}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="الموظف"
                    rows={[
                        ['الاسم', slip.employee],
                        ['الكود', slip.employee_code],
                        ['الوظيفة', slip.job_title],
                    ]}
                />
                <DocumentParty
                    heading="المسير"
                    rows={[
                        ['الشهر', slip.month],
                        ['رقم المسير', slip.run_code],
                        ['حالة الصرف', slip.is_paid ? `صُرف ${slip.paid_on ? formatDate(slip.paid_on) : ''}` : 'غير مصروف'],
                        ['من خزينة', slip.box],
                    ]}
                />
            </div>

            <div className="doc-keep mt-5">
                <p className="mb-1.5 text-[11px] font-bold text-navy-400">المستحقات</p>
                <div className="space-y-1 rounded-lg bg-navy-50 p-3 text-[13px]">
                    <Line label="الراتب الأساسي" value={slip.basic_salary} />
                    {slip.allowances.map((allowance, index) => (
                        <Line key={index} label={allowance.name} value={allowance.amount} />
                    ))}
                    <div className="flex justify-between border-t border-navy-200 pt-1 font-bold text-navy-900">
                        <span>إجمالي المستحقات</span>
                        <span className="tabular">{formatMoney(slip.gross)}</span>
                    </div>
                </div>
            </div>

            {deductionRows.length > 0 && (
                <DocumentTotals
                    rows={deductionRows}
                    total={formatMoney(slip.total_deductions)}
                    totalLabel="إجمالي الخصومات"
                />
            )}

            <div className="doc-keep mt-4 rounded-lg border-2 border-navy-900 p-4">
                <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-bold text-navy-500">صافي المستحق</span>
                    <span className="tabular text-2xl font-extrabold text-navy-900">
                        {formatMoney(slip.net)}
                    </span>
                </div>
            </div>
        </DocumentShell>
    )
}

function Line({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex justify-between text-navy-700">
            <span>{label}</span>
            <span className="tabular">{formatMoney(value)}</span>
        </div>
    )
}

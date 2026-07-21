import { useParams } from 'react-router-dom'
import {
    DocumentParty,
    DocumentShell,
    DocumentSignatures,
    DocumentTotals,
} from '@/components/DocumentShell'
import { ErrorState } from '@/components/ui'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useInvoice, useSettings } from '@/lib/queries'

export function InvoicePrint() {
    const { id } = useParams<{ id: string }>()
    const { data: invoice, isError, refetch } = useInvoice(id)
    const { data: settings } = useSettings()

    if (isError) return <ErrorState message="تعذّر تحميل الفاتورة." onRetry={() => void refetch()} />
    if (!invoice) return null

    return (
        <DocumentShell
            title={invoice.status === 'draft' ? 'فاتورة (مسودة)' : 'فاتورة'}
            subtitle={invoice.code}
            footer={settings?.invoice_footer}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="فاتورة إلى"
                    rows={[
                        ['العميل', invoice.customer?.name],
                        ['الشركة', invoice.customer?.company],
                        ['الهاتف', invoice.customer?.phone],
                        ['العنوان', invoice.customer?.address],
                        ['الرقم الضريبي', invoice.customer_tax_id],
                    ]}
                />

                <DocumentParty
                    heading="بيانات الفاتورة"
                    rows={[
                        ['رقم الفاتورة', invoice.code],
                        ['التاريخ', invoice.issue_date ? formatDate(invoice.issue_date) : null],
                        ['الاستحقاق', invoice.due_date ? formatDate(invoice.due_date) : null],
                        ['أمر الشغل', invoice.task_code],
                        ['الحالة', invoice.payment_state_label],
                    ]}
                />
            </div>

            <table className="doc-table mt-5">
                <thead>
                    <tr>
                        <th className="w-8">#</th>
                        <th>البيان</th>
                        <th className="w-20 text-center">الكمية</th>
                        <th className="w-28 text-center">سعر الوحدة</th>
                        <th className="w-28 text-left">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.lines?.map((line, index) => (
                        <tr key={line.id}>
                            <td className="text-navy-400">{index + 1}</td>
                            <td className="font-semibold text-navy-900">{line.description}</td>
                            <td className="tabular text-center">{formatQty(line.qty)}</td>
                            <td className="tabular text-center">{formatMoney(line.unit_price)}</td>
                            <td className="tabular text-left font-bold">{formatMoney(line.line_total)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <DocumentTotals
                rows={[
                    ['الإجمالي قبل الخصم', formatMoney(invoice.subtotal)],
                    ...(invoice.discount > 0
                        ? ([['الخصم', `− ${formatMoney(invoice.discount)}`]] as Array<[string, string]>)
                        : []),
                    ...(invoice.tax_rate > 0
                        ? ([
                              [`ضريبة القيمة المضافة ${invoice.tax_rate}%`, formatMoney(invoice.tax_amount)],
                          ] as Array<[string, string]>)
                        : []),
                ]}
                total={formatMoney(invoice.total)}
            />

            {/* What is still owed matters more to the reader than what was
                billed, so it is stated rather than left to be worked out. */}
            {invoice.paid_total > 0 && (
                <DocumentTotals
                    rows={[['المدفوع', formatMoney(invoice.paid_total)]]}
                    total={formatMoney(invoice.balance)}
                    totalLabel="المتبقي"
                />
            )}

            {invoice.notes && (
                <p className="doc-keep mt-5 rounded-lg bg-navy-50 p-3 text-[12px] text-navy-600">
                    {invoice.notes}
                </p>
            )}

            <DocumentSignatures labels={['المحاسب', 'استلم العميل']} />
        </DocumentShell>
    )
}

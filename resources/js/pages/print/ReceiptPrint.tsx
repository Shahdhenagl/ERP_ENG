import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { usePayment } from '@/lib/queries'
import { amountInWords } from '@/pages/print/PaymentVoucherPrint'

/**
 * سند قبض — the receipt handed to a customer when money comes in.
 *
 * Mirror of the disbursement voucher: the amount in figures and again in words,
 * because a receipt is a record of what was actually taken and a changed digit
 * is the oldest dispute there is.
 */
export function ReceiptPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: receipt, isLoading, isError, refetch } = usePayment(id)

    if (isLoading) return <PageLoader />
    if (isError) return <ErrorState message="تعذّر تحميل السند." onRetry={() => void refetch()} />
    if (!receipt) return null

    return (
        <DocumentShell
            title="سند قبض"
            subtitle={receipt.code}
            footer={<p>يُعتمد هذا السند بتوقيع الدافع وأمين الخزينة.</p>}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="استُلم من"
                    rows={[['العميل', receipt.customer ?? '—']]}
                />

                <DocumentParty
                    heading="بيانات السند"
                    rows={[
                        ['رقم السند', receipt.code],
                        ['التاريخ', receipt.paid_at ? formatDate(receipt.paid_at) : null],
                        ['إلى خزينة', receipt.cash_box],
                        ['عن فاتورة', receipt.invoice_code],
                    ]}
                />
            </div>

            <div className="doc-keep mt-5 rounded-lg border-2 border-navy-900 p-4">
                <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-bold text-navy-500">المبلغ</span>
                    <span className="tabular text-2xl font-extrabold text-navy-900">
                        {formatMoney(receipt.amount)}
                    </span>
                </div>

                <p className="mt-2 border-t border-navy-200 pt-2 text-[13px] text-navy-700">
                    <span className="font-bold text-navy-500">فقط وقدره: </span>
                    {amountInWords(receipt.amount)}
                </p>
            </div>

            <div className="doc-keep mt-4 space-y-1 text-[12px] text-navy-700">
                <p>
                    <span className="text-navy-400">طريقة الدفع: </span>
                    {receipt.method_label}
                    {receipt.reference && <span dir="ltr"> · {receipt.reference}</span>}
                </p>
                {receipt.note && (
                    <p>
                        <span className="text-navy-400">البيان: </span>
                        {receipt.note}
                    </p>
                )}
                {receipt.actor && (
                    <p>
                        <span className="text-navy-400">حرّره: </span>
                        {receipt.actor}
                    </p>
                )}
            </div>

            <DocumentSignatures labels={['الدافع', 'أمين الخزينة', 'الاعتماد']} />
        </DocumentShell>
    )
}

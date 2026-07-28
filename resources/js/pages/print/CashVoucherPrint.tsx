import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useCashVoucher } from '@/lib/queries'
import { amountInWords } from '@/pages/print/PaymentVoucherPrint'

/**
 * The sheet for a manual cash voucher — money paid out as an expense, or taken
 * in as an external deposit. A receipt is signed by the payer; a payment by the
 * one who received the cash. The amount is stated in figures and in words, the
 * oldest guard against a digit being added after the fact.
 */
export function CashVoucherPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: voucher, isLoading, isError, refetch } = useCashVoucher(id)

    if (isLoading) return <PageLoader />
    if (isError) return <ErrorState message="تعذّر تحميل السند." onRetry={() => void refetch()} />
    if (!voucher) return null

    const isReceipt = voucher.kind === 'receipt'

    return (
        <DocumentShell
            title={voucher.title}
            subtitle={voucher.code}
            footer={<p>يُعتمد هذا السند بتوقيع الطرفين وأمين الخزينة.</p>}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading={isReceipt ? 'قُبض من' : 'صُرف إلى'}
                    rows={[['الجهة', voucher.party]]}
                />

                <DocumentParty
                    heading="بيانات السند"
                    rows={[
                        ['رقم السند', voucher.code],
                        ['التاريخ', voucher.date ? formatDate(voucher.date) : null],
                        [isReceipt ? 'إلى خزينة' : 'من خزينة', voucher.cash_box],
                    ]}
                />
            </div>

            <div className="doc-keep mt-5 rounded-lg border-2 border-navy-900 p-4">
                <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-bold text-navy-500">المبلغ</span>
                    <span className="tabular text-2xl font-extrabold text-navy-900">
                        {formatMoney(voucher.amount)}
                    </span>
                </div>

                <p className="mt-2 border-t border-navy-200 pt-2 text-[13px] text-navy-700">
                    <span className="font-bold text-navy-500">فقط وقدره: </span>
                    {amountInWords(voucher.amount)}
                </p>
            </div>

            {(voucher.note || voucher.actor) && (
                <div className="doc-keep mt-4 space-y-1 text-[12px] text-navy-700">
                    {voucher.note && (
                        <p>
                            <span className="text-navy-400">البيان: </span>
                            {voucher.note}
                        </p>
                    )}
                    {voucher.actor && (
                        <p>
                            <span className="text-navy-400">حرّره: </span>
                            {voucher.actor}
                        </p>
                    )}
                </div>
            )}

            <DocumentSignatures
                labels={[isReceipt ? 'المُودِع' : 'المستلِم', 'أمين الخزينة', 'الاعتماد']}
            />
        </DocumentShell>
    )
}

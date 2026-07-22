import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useSupplierPayment } from '@/lib/queries'

/**
 * سند صرف — the sheet that gets signed when money leaves.
 *
 * The amount appears twice, once in figures and once in words. That is not
 * decoration: a voucher is a payment instruction, and a digit added to a
 * figure is the oldest alteration there is.
 */
export function PaymentVoucherPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: voucher, isLoading, isError, refetch } = useSupplierPayment(id)

    if (isLoading) return <PageLoader />
    if (isError) return <ErrorState message="تعذّر تحميل السند." onRetry={() => void refetch()} />
    if (!voucher) return null

    return (
        <DocumentShell
            title="سند صرف"
            subtitle={voucher.code}
            footer={<p>يُعتمد هذا السند بتوقيع المستلم وأمين الخزينة.</p>}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="صُرف إلى"
                    rows={[
                        ['المورّد', voucher.supplier],
                        ['الرقم الضريبي', voucher.supplier_tax_id],
                    ]}
                />

                <DocumentParty
                    heading="بيانات السند"
                    rows={[
                        ['رقم السند', voucher.code],
                        ['التاريخ', voucher.paid_at ? formatDate(voucher.paid_at) : null],
                        ['من خزينة', voucher.cash_box],
                        ['عن فاتورة', voucher.invoice_code],
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

            <div className="doc-keep mt-4 space-y-1 text-[12px] text-navy-700">
                <p>
                    <span className="text-navy-400">طريقة الدفع: </span>
                    {voucher.method_label}
                    {voucher.reference && (
                        <span dir="ltr"> · {voucher.reference}</span>
                    )}
                </p>
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

            <DocumentSignatures labels={['المستلِم', 'أمين الخزينة', 'الاعتماد']} />
        </DocumentShell>
    )
}

/* ── Amount in words ─────────────────────────────────────── */

const ONES = [
    '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
    'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
]

const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']

const HUNDREDS = [
    '', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
    'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة',
]

/** Under a thousand, which is the only piece the rest is built from. */
function underThousand(value: number): string {
    const parts: string[] = []
    const hundreds = Math.floor(value / 100)
    const rest = value % 100

    if (hundreds) parts.push(HUNDREDS[hundreds])

    if (rest < 20) {
        if (rest) parts.push(ONES[rest])
    } else {
        const ones = rest % 10
        // Arabic says the unit before the ten — «واحد وعشرون», not the reverse.
        parts.push(ones ? `${ONES[ones]} و${TENS[Math.floor(rest / 10)]}` : TENS[Math.floor(rest / 10)])
    }

    return parts.join(' و')
}

/**
 * Egyptian pounds and piastres, written out.
 *
 * Stops at the millions, which is far beyond anything this company pays a
 * supplier in one voucher — and says so rather than printing nonsense.
 */
function amountInWords(amount: number): string {
    const pounds = Math.floor(amount)
    const piastres = Math.round((amount - pounds) * 100)

    if (pounds >= 1_000_000_000) return `${formatMoney(amount)}`

    const say = (value: number): string => {
        if (value === 0) return 'صفر'

        const chunks: string[] = []
        const millions = Math.floor(value / 1_000_000)
        const thousands = Math.floor((value % 1_000_000) / 1000)
        const rest = value % 1000

        if (millions) {
            chunks.push(millions === 1 ? 'مليون' : millions === 2 ? 'مليونان' : `${underThousand(millions)} مليون`)
        }

        if (thousands) {
            chunks.push(thousands === 1 ? 'ألف' : thousands === 2 ? 'ألفان' : `${underThousand(thousands)} ألف`)
        }

        if (rest) chunks.push(underThousand(rest))

        return chunks.join(' و')
    }

    const wholePart = `${say(pounds)} جنيهًا`

    return piastres > 0 ? `${wholePart} و${say(piastres)} قرشًا فقط` : `${wholePart} فقط`
}

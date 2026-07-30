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
import { itemSpecRows } from '@/lib/specs'
import { SpecRowList } from '@/components/SpecSheet'
import { useQuotation, useSettings } from '@/lib/queries'

export function QuotationPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: quotation, isError, refetch } = useQuotation(id)
    const { data: settings } = useSettings()

    if (isError) return <ErrorState message="تعذّر تحميل العرض." onRetry={() => void refetch()} />
    if (!quotation) return null

    // The company-wide terms are the fallback; a quote that states its own
    // wins, because it was written for this customer.
    const terms = quotation.terms || settings?.quotation_terms

    // The standing conditions, unless this offer states its own. Parsed
    // defensively: a settings string somebody hand-edited must not take the
    // whole document down with it.
    const conditions = quotation.conditions?.length
        ? quotation.conditions
        : parseConditions(settings?.quotation_conditions)

    return (
        <DocumentShell title="عرض سعر" subtitle={quotation.code}>
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="مقدَّم إلى"
                    rows={[
                        ['العميل', quotation.customer],
                        ['الفرع', quotation.branch],
                        ['الجهاز', quotation.asset],
                    ]}
                />

                <DocumentParty
                    heading="بيانات العرض"
                    rows={[
                        ['رقم العرض', quotation.code],
                        ['التاريخ', quotation.issue_date ? formatDate(quotation.issue_date) : null],
                        [
                            'صالح حتى',
                            quotation.valid_until ? formatDate(quotation.valid_until) : 'غير محدد',
                        ],
                    ]}
                />
            </div>

            {quotation.title && (
                <p className="doc-keep mt-4 text-center text-[15px] font-bold text-navy-800">
                    {quotation.title}
                </p>
            )}

            <table className="doc-table mt-4">
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
                    {quotation.lines?.map((line, index) => {
                        const specs = itemSpecRows(line.item_category, line.item_specs)

                        return (
                            <tr key={line.id}>
                                <td className="text-navy-400">{index + 1}</td>
                                <td className="text-navy-900">
                                    <span className="font-semibold">{line.description}</span>
                                    {line.item_category_label && (
                                        <span className="mr-1.5 text-[11px] text-navy-400">
                                            ({line.item_category_label})
                                        </span>
                                    )}
                                    {/* The whole nameplate on the document the
                                        customer keeps — a rating agreed in
                                        writing is not a rating on a screen. */}
                                    {specs.length > 0 && <SpecRowList rows={specs} />}
                                </td>
                                <td className="tabular text-center">
                                    {formatQty(line.qty)}
                                </td>
                                <td className="tabular text-center">{formatMoney(line.unit_price)}</td>
                                <td className="tabular text-left font-bold">{formatMoney(line.line_total)}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>

            <DocumentTotals
                rows={[
                    ['الإجمالي قبل الخصم', formatMoney(quotation.subtotal)],
                    ...(quotation.discount > 0
                        ? ([
                              [
                                  quotation.discount_percent != null
                                      ? `الخصم (${quotation.discount_percent}%)`
                                      : 'الخصم',
                                  `− ${formatMoney(quotation.discount)}`,
                              ],
                          ] as Array<[string, string]>)
                        : []),
                    ...(quotation.tax_rate > 0
                        ? ([
                              [
                                  `ضريبة القيمة المضافة ${quotation.tax_rate}%`,
                                  formatMoney(quotation.tax_amount),
                              ],
                          ] as Array<[string, string]>)
                        : []),
                ]}
                total={formatMoney(quotation.total)}
                inWords={quotation.total}
            />

            {/* The conditions the offer closes on, read label-first the way the
                sheet is scanned: down the right column, then across. */}
            {conditions.length > 0 && (
                <div className="doc-keep mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                    <ul className="space-y-1.5">
                        {conditions.map((condition) => (
                            <li
                                key={condition.label}
                                className="text-[13px] font-bold text-navy-800 underline underline-offset-4"
                            >
                                {condition.label} :-
                            </li>
                        ))}
                    </ul>

                    <ul className="space-y-1.5">
                        {conditions.map((condition) => (
                            <li key={condition.label} className="text-[13px] text-navy-700">
                                * {condition.value}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <p className="doc-keep mt-5 text-center text-[13px] font-bold text-navy-800">
                وتفضلوا بقبول فائق الاحترام،،،
            </p>

            {terms && (
                <div className="doc-keep mt-6 rounded-lg border border-navy-200 p-3">
                    <p className="mb-1.5 text-[11px] font-bold text-navy-400">الشروط والأحكام</p>
                    <p className="text-[12px] leading-relaxed whitespace-pre-line text-navy-700">
                        {terms}
                    </p>
                </div>
            )}

            <DocumentSignatures labels={['عن الشركة', 'موافقة العميل']} />
        </DocumentShell>
    )
}

/** Settings hold them as JSON text; a bad edit there yields none, not a crash. */
function parseConditions(raw: string | undefined): Array<{ label: string; value: string }> {
    if (!raw) return []

    try {
        const parsed: unknown = JSON.parse(raw)

        return Array.isArray(parsed)
            ? parsed.filter(
                  (row): row is { label: string; value: string } =>
                      Boolean(row) && typeof row === 'object' && 'label' in row && 'value' in row,
              )
            : []
    } catch {
        return []
    }
}

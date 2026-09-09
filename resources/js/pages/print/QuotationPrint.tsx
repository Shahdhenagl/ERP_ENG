import { useParams, useSearchParams } from 'react-router-dom'
import { parseConditions } from '@/lib/conditions'
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
    const [searchParams] = useSearchParams()
    const english = searchParams.get('lang') === 'en'
    const { data: quotation, isError, refetch } = useQuotation(id)
    const { data: settings } = useSettings()

    if (isError) return <ErrorState message="تعذّر تحميل العرض." onRetry={() => void refetch()} />
    if (!quotation) return null

    // Keep the value visible even when the customer has no English translation.
    // A blank Bill To or Attention field is less useful than showing the saved
    // Arabic name until an English customer name is added to the master data.
    const en = (value: string | null | undefined): string | null => {
        if (!value) return null
        const clean = value.replace(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/g, '').trim()
        return clean || value.trim() || null
    }
    const money = (value: number) => english
        ? `${value.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`
        : formatMoney(value)

    // The company-wide terms are the fallback; a quote that states its own
    // wins, because it was written for this customer.
    const terms = quotation.terms || settings?.quotation_terms

    // The standing conditions, unless this offer states its own. Parsed
    // defensively: a settings string somebody hand-edited must not take the
    // whole document down with it.
    // Null means the offer never stated its own — an older quote, from before
    // they were editable. An empty list is a decision, and stays empty: falling
    // back there would print conditions the person who cleared them removed.
    const conditions =
        quotation.conditions != null
            ? quotation.conditions
            : parseConditions(settings?.quotation_conditions)

    return (
        <DocumentShell
            title={english ? 'Quotation' : 'عرض سعر'}
            number={quotation.code}
            subtitle={english ? undefined : undefined}
            language={english ? 'en' : 'ar'}
            className="doc-sheet--quotation"
            exportFormats
            bilingualFooter={!english}
            hideHeaderContact
            plainFooter
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading={english ? 'Bill To' : 'مقدَّم إلى'}
                    rows={[
                        [english ? 'Customer' : 'العميل', english ? en(quotation.customer) : quotation.customer],
                        [english ? 'Attention To' : 'عناية إلى', english ? en(quotation.attention_to) : quotation.attention_to],
                        [english ? 'Branch' : 'الفرع', english ? en(quotation.branch) : quotation.branch],
                        [english ? 'Asset' : 'الجهاز', english ? en(quotation.asset) : quotation.asset],
                    ]}
                />

                <DocumentParty
                    heading={english ? 'Quotation Details' : 'بيانات العرض'}
                    rows={[
                        [english ? 'Quotation No.' : 'رقم العرض', quotation.code],
                        [english ? 'Date' : 'التاريخ', quotation.issue_date ? formatDate(quotation.issue_date) : null],
                        [
                            english ? 'Valid Until' : 'صالح حتى',
                            quotation.valid_until ? formatDate(quotation.valid_until) : english ? 'Open' : 'غير محدد',
                        ],
                    ]}
                />
            </div>

            {(english ? en(quotation.title) : quotation.title) && (
                <p className="doc-keep mt-4 text-center text-[15px] font-bold text-navy-800">
                    {english ? en(quotation.title) : quotation.title}
                </p>
            )}

            <table className="doc-table quotation-lines-table mt-4">
                <colgroup>
                    <col className="quotation-col-index" />
                    <col className="quotation-col-description" />
                    <col className="quotation-col-quantity" />
                    <col className="quotation-col-unit-price" />
                    <col className="quotation-col-total" />
                </colgroup>
                <thead>
                    <tr>
                        <th className="quotation-cell-index">#</th>
                                <th className="quotation-cell-description">{english ? 'Description' : 'البيان'}</th>
                        <th className="quotation-cell-quantity">{english ? 'Qty' : 'الكمية'}</th>
                        <th className="quotation-cell-unit-price">{english ? 'Unit Price' : 'سعر الوحدة'}</th>
                        <th className="quotation-cell-total">{english ? 'Total' : 'الإجمالي'}</th>
                    </tr>
                </thead>
                <tbody>
                    {quotation.lines?.map((line, index) => {
                        const specs = itemSpecRows(line.item_category, line.item_specs)

                        return (
                            <tr key={line.id}>
                                <td className="quotation-cell-index text-navy-400">{index + 1}</td>
                                <td className="quotation-cell-description text-navy-900">
                                    <span className="font-semibold">{english ? en(line.description) : line.description}</span>
                                    {!english && line.item_category_label && (
                                        <span className="mr-1.5 text-[11px] text-navy-400">
                                            ({line.item_category_label})
                                        </span>
                                    )}
                                    {/* The whole nameplate on the document the
                                        customer keeps — a rating agreed in
                                        writing is not a rating on a screen. */}
                                    {!english && specs.length > 0 && <SpecRowList rows={specs} />}
                                </td>
                                <td className="quotation-cell-quantity tabular">
                                    {formatQty(line.qty)}
                                </td>
                                <td className="quotation-cell-unit-price tabular">{money(line.unit_price)}</td>
                                <td className="quotation-cell-total tabular font-bold">{money(line.line_total)}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>

            <DocumentTotals
                rows={[
                    [english ? 'Subtotal' : 'الإجمالي قبل الخصم', money(quotation.subtotal)],
                    ...(quotation.discount > 0
                        ? ([
                              [
                                      english
                                          ? `Discount (${quotation.discount_percent ?? 0}%)`
                                          : quotation.discount_percent != null
                                              ? `الخصم (${quotation.discount_percent}%)`
                                              : 'الخصم',
                                  `− ${money(quotation.discount)}`,
                              ],
                          ] as Array<[string, string]>)
                        : []),
                    ...(quotation.tax_rate > 0
                        ? ([
                              [
                                  english ? `VAT ${quotation.tax_rate}%` : `ضريبة القيمة المضافة ${quotation.tax_rate}%`,
                                  money(quotation.tax_amount),
                              ],
                          ] as Array<[string, string]>)
                        : []),
                ]}
                total={money(quotation.total)}
                totalLabel={english ? 'Grand Total' : 'الإجمالي'}
                inWords={english ? undefined : quotation.total}
                align="end"
                boxed
            />

            {/* The conditions the offer closes on, in a box beside the
                signature. A condition with a value states it; one without is a
                dotted rule, because a quote is often agreed at a desk and the
                terms written on the sheet by whoever agreed them. */}
            {!english && conditions.length > 0 && (
                <div className="doc-keep mt-6 rounded-xl border border-navy-200 bg-navy-50/50 p-4">
                    <p className="mb-2.5 text-[13px] font-extrabold text-navy-800">{english ? 'Terms and Conditions' : 'الشروط والأحكام'}</p>

                    <dl className="space-y-2">
                        {conditions.map((condition) => (
                            <div key={condition.label} className="flex items-baseline gap-2 text-[12.5px]">
                                <dt className="shrink-0 font-bold text-navy-700">{english ? en(condition.label) : condition.label}:</dt>
                                <dd className="min-w-0 flex-1">
                                    {condition.value ? (
                                        <span className="text-navy-700">{english ? en(condition.value) : condition.value}</span>
                                    ) : (
                                        <span
                                            className="block border-b border-dotted border-navy-300"
                                            aria-hidden
                                        >
                                            &nbsp;
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}

            {(english ? en(terms) : terms) && (
                <div className="doc-keep mt-6 rounded-lg border border-navy-200 p-3">
                    <p className="mb-1.5 text-[11px] font-bold text-navy-400">{english ? 'Terms and Conditions' : 'الشروط والأحكام'}</p>
                    <p className="text-[12px] leading-relaxed whitespace-pre-line text-navy-700">
                        {english ? en(terms) : terms}
                    </p>
                </div>
            )}

            <DocumentSignatures
                labels={english ? ['For the Company', 'Customer Approval'] : ['عن الشركة', 'موافقة العميل']}
                showLines={false}
                stamp={
                    settings?.company_stamp_url ? (
                        <img
                            src={settings.company_stamp_url}
                            alt="ختم الشركة"
                            className="mx-auto mt-2 h-36 w-auto object-contain mix-blend-multiply"
                        />
                    ) : undefined
                }
            />
        </DocumentShell>
    )
}

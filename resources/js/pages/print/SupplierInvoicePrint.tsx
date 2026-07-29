import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentTotals } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useSettings, useSupplierInvoice } from '@/lib/queries'

/**
 * A supplier's bill as a sheet: what they charged, and the deliveries it is
 * charged against.
 *
 * The receipt schedule is the point of printing it. A bill is checked by
 * walking its lines against what the storekeeper actually booked in, and a
 * total on its own cannot be checked at all.
 */
export function SupplierInvoicePrint() {
    const { id } = useParams<{ id: string }>()
    const { data: invoice, isLoading, isError, refetch } = useSupplierInvoice(id)
    const { data: settings } = useSettings()

    if (isError) return <ErrorState message="تعذّر تحميل الفاتورة." onRetry={() => void refetch()} />
    if (isLoading || !invoice) return <PageLoader />

    const lines = invoice.lines ?? []
    const receipts = invoice.receipts ?? []

    const STATUS: Record<string, string> = {
        draft: 'مسودة — لم تُرحَّل بعد',
        posted: 'مُرحَّلة',
        void: 'ملغاة',
    }

    return (
        <DocumentShell
            title="فاتورة مورّد"
            subtitle={`${invoice.code}${invoice.supplier_ref ? ` · ${invoice.supplier_ref}` : ''}`}
            footer={settings?.invoice_footer}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="المورّد"
                    rows={[
                        ['الاسم', invoice.supplier],
                        ['رقم فاتورته', invoice.supplier_ref],
                        ['أمر الشراء', invoice.purchase_order_code],
                    ]}
                />

                <DocumentParty
                    heading="بيانات الفاتورة"
                    rows={[
                        ['كود الفاتورة', invoice.code],
                        ['التاريخ', invoice.invoice_date ? formatDate(invoice.invoice_date) : null],
                        ['الاستحقاق', invoice.due_date ? formatDate(invoice.due_date) : null],
                        ['الحالة', STATUS[invoice.status] ?? invoice.status],
                        ['السداد', invoice.payment_state_label],
                    ]}
                />
            </div>

            {/* ── What was billed ────────────────────────────── */}
            <h3 className="doc-keep mt-6 mb-2 text-[13px] font-bold text-navy-700">بنود الفاتورة</h3>
            <table className="doc-table">
                <thead>
                    <tr>
                        <th className="w-10">#</th>
                        <th className="w-24">الكود</th>
                        <th>الصنف</th>
                        <th className="w-20 text-left">الكمية</th>
                        <th className="w-28 text-left">سعر الوحدة</th>
                        <th className="w-28 text-left">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((line, index) => (
                        <tr key={line.id}>
                            <td className="tabular text-navy-500">{index + 1}</td>
                            <td className="tabular text-navy-500">{line.item_code ?? '—'}</td>
                            <td className="text-navy-700">{line.description}</td>
                            <td className="tabular text-left">{formatQty(line.qty)}</td>
                            <td className="tabular text-left">{formatMoney(line.unit_price)}</td>
                            <td className="tabular text-left">{formatMoney(line.line_total)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ── What actually arrived ──────────────────────── */}
            {receipts.length > 0 && (
                <>
                    <h3 className="doc-keep mt-6 mb-2 text-[13px] font-bold text-navy-700">
                        المشتريات المستلمة على هذه الفاتورة
                    </h3>
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th className="w-24">التاريخ</th>
                                <th className="w-24">إذن الاستلام</th>
                                <th>الصنف</th>
                                <th className="w-20 text-left">الكمية</th>
                                <th className="w-28 text-left">تكلفة الوحدة</th>
                                <th className="w-28 text-left">الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody>
                            {receipts.map((receipt) => (
                                <tr key={receipt.id}>
                                    <td className="tabular text-navy-500">
                                        {receipt.moved_on ? formatDate(receipt.moved_on) : '—'}
                                    </td>
                                    <td className="tabular text-navy-500">{receipt.reference ?? '—'}</td>
                                    <td className="text-navy-700">
                                        {receipt.item ?? '—'}
                                        {receipt.item_code && (
                                            <span className="tabular mr-1.5 text-[11px] text-navy-400">
                                                {receipt.item_code}
                                            </span>
                                        )}
                                    </td>
                                    <td className="tabular text-left">{formatQty(receipt.qty)}</td>
                                    <td className="tabular text-left">{formatMoney(receipt.unit_cost)}</td>
                                    <td className="tabular text-left">{formatMoney(receipt.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* The receipts already charged the account; only the excess
                        is new debt. Saying so stops the total reading twice. */}
                    <p className="mt-2 text-[11px] text-navy-500">
                        حُمِّل على حساب المورّد وقت الاستلام{' '}
                        <strong className="tabular text-navy-700">
                            {formatMoney(invoice.covered_value)}
                        </strong>
                        ، وأضافت هذه الفاتورة{' '}
                        <strong className="tabular text-navy-700">{formatMoney(invoice.accrual)}</strong>.
                    </p>
                </>
            )}

            <DocumentTotals
                rows={[
                    ['الإجمالي قبل الخصم', formatMoney(invoice.subtotal)],
                    ...(invoice.discount > 0
                        ? ([['الخصم', formatMoney(invoice.discount)]] as [string, string][])
                        : []),
                    ...(invoice.tax_amount > 0
                        ? ([
                              [`الضريبة (${invoice.tax_rate}%)`, formatMoney(invoice.tax_amount)],
                          ] as [string, string][])
                        : []),
                    ['المسدَّد', formatMoney(invoice.paid_total)],
                    ...(invoice.returned_total > 0
                        ? ([['المرتجع', formatMoney(invoice.returned_total)]] as [string, string][])
                        : []),
                    ['المتبقي', formatMoney(invoice.balance)],
                ]}
                total={formatMoney(invoice.total)}
                totalLabel="إجمالي الفاتورة"
            />

            {invoice.notes && (
                <p className="mt-4 text-[12px] whitespace-pre-line text-navy-600">{invoice.notes}</p>
            )}
        </DocumentShell>
    )
}

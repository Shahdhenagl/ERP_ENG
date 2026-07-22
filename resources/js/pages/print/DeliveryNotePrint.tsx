import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState } from '@/components/ui'
import { formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useSalesOrder } from '@/lib/queries'

/**
 * The note that goes with the goods.
 *
 * Prices are deliberately absent. A delivery note travels with the driver and
 * gets signed at a reception desk by whoever happens to be there; what it has
 * to prove is that the right things arrived in the right quantities, and the
 * commercial terms are the invoice's business.
 */
export function DeliveryNotePrint() {
    const { id } = useParams<{ id: string }>()
    const { data: order, isError, refetch } = useSalesOrder(id)

    if (isError) return <ErrorState message="تعذّر تحميل أمر البيع." onRetry={() => void refetch()} />
    if (!order) return null

    return (
        <DocumentShell
            title="إذن تسليم"
            subtitle={order.code}
            footer={<p>يُعد استلام البضاعة إقرارًا بمطابقتها للأصناف والكميات المدوّنة أعلاه.</p>}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="تسليم إلى"
                    rows={[
                        ['العميل', order.customer],
                        ['عرض السعر', order.quotation_code],
                    ]}
                />

                <DocumentParty
                    heading="بيانات الإذن"
                    rows={[
                        ['أمر البيع', order.code],
                        ['التاريخ', order.order_date ? formatDate(order.order_date) : null],
                        [
                            'تاريخ التسليم',
                            order.delivery_date ? formatDate(order.delivery_date) : null,
                        ],
                    ]}
                />
            </div>

            <table className="doc-table mt-5">
                <thead>
                    <tr>
                        <th className="w-10">#</th>
                        <th className="w-24">الكود</th>
                        <th>الصنف</th>
                        <th className="w-28 text-center">الكمية</th>
                        {/* Left blank on purpose: the receiver counts and writes
                            what they actually took, and a discrepancy is caught
                            at the door rather than at the month end. */}
                        <th className="w-28 text-center">المستلَم</th>
                    </tr>
                </thead>
                <tbody>
                    {order.lines?.map((line, index) => (
                        <tr key={line.id ?? index}>
                            <td className="tabular text-center text-navy-400">{index + 1}</td>
                            <td className="tabular text-navy-500">{line.item_code ?? '—'}</td>
                            <td>{line.description}</td>
                            <td className="tabular text-center">{formatQty(line.qty)}</td>
                            <td />
                        </tr>
                    ))}
                </tbody>
            </table>

            {order.notes && (
                <p className="doc-keep mt-4 text-[12px] whitespace-pre-line text-navy-700">
                    {order.notes}
                </p>
            )}

            <DocumentSignatures labels={['المُسلِّم', 'المستلِم', 'التاريخ']} />
        </DocumentShell>
    )
}

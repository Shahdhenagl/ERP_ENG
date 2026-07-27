import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentTotals } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useContract } from '@/lib/queries'

/**
 * The maintenance contract as a sheet: its term and coverage, the devices it
 * protects with their nameplates, the visit count, and the instalment plan —
 * what the customer signs and keeps.
 */
export function ContractPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: contract, isLoading, isError, refetch } = useContract(id)

    if (isError) return <ErrorState message="تعذّر تحميل العقد." onRetry={() => void refetch()} />
    if (isLoading || !contract) return <PageLoader />

    const assets = contract.assets ?? []
    const payments = contract.payments ?? []

    return (
        <DocumentShell
            title={`عقد صيانة ${contract.code}`}
            subtitle={`${formatDate(contract.starts_on)} — ${formatDate(contract.ends_on)}`}
        >
            <DocumentParty
                heading="العميل"
                rows={[
                    ['الاسم', contract.customer?.name],
                    ['الكود', contract.customer?.code],
                    ['الهاتف', contract.customer?.phone],
                    ['العنوان', contract.customer?.address],
                ]}
            />

            {/* When the contract carries a written body, that is the agreement —
                printed as-is. Otherwise fall back to the structured summary. */}
            {contract.terms ? (
                <div className="doc-body mt-5 text-[13px] leading-8 whitespace-pre-line text-navy-800">
                    {contract.terms}
                </div>
            ) : (
            <>
            <table className="doc-table mt-5">
                <tbody>
                    <tr>
                        <th className="w-40">اسم العقد</th>
                        <td>{contract.title ?? '—'}</td>
                    </tr>
                    <tr>
                        <th>عدد الزيارات</th>
                        <td>{contract.visits_per_year} زيارة سنويًا</td>
                    </tr>
                    <tr>
                        <th>طريقة التحصيل</th>
                        <td>{contract.billing_frequency_label}</td>
                    </tr>
                    <tr>
                        <th>قيمة العقد</th>
                        <td className="tabular">
                            {contract.value ? formatMoney(Number(contract.value)) : '—'}
                        </td>
                    </tr>
                    {contract.sla_response_hours && (
                        <tr>
                            <th>زمن الاستجابة</th>
                            <td>{contract.sla_response_hours} ساعة</td>
                        </tr>
                    )}
                    {contract.sla_resolution_hours && (
                        <tr>
                            <th>زمن الإنجاز</th>
                            <td>{contract.sla_resolution_hours} ساعة</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* ── Covered devices ─────────────────────────── */}
            <h3 className="doc-keep mt-6 mb-2 text-[13px] font-bold text-navy-700">الأجهزة المغطاة</h3>
            {assets.length === 0 ? (
                <p className="rounded-lg bg-navy-50 p-3 text-[13px] text-navy-500">
                    يغطي العقد كل أجهزة العميل، بما فيها ما يُضاف لاحقًا.
                </p>
            ) : (
                <table className="doc-table">
                    <thead>
                        <tr>
                            <th className="w-24">الكود</th>
                            <th>الجهاز</th>
                            <th className="w-32">الرقم التسلسلي</th>
                            <th className="w-24">القدرة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assets.map((asset) => (
                            <tr key={asset.id}>
                                <td className="tabular text-navy-600">{asset.code}</td>
                                <td className="text-navy-700">
                                    {asset.label}
                                    {(asset.brand || asset.model) && (
                                        <span className="block text-[11px] text-navy-400">
                                            {[asset.brand, asset.model].filter(Boolean).join(' ')}
                                        </span>
                                    )}
                                </td>
                                <td className="tabular text-navy-600">{asset.serial ?? '—'}</td>
                                <td className="text-navy-600">{asset.capacity ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* ── Payment schedule ────────────────────────── */}
            {payments.length > 0 && (
                <>
                    <h3 className="doc-keep mt-6 mb-2 text-[13px] font-bold text-navy-700">
                        جدول الدفعات
                    </h3>
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th className="w-16">#</th>
                                <th>الاستحقاق</th>
                                <th className="w-28 text-left">القيمة</th>
                                <th className="w-24">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payments.map((payment) => (
                                <tr key={payment.id}>
                                    <td className="tabular text-navy-500">{payment.sequence}</td>
                                    <td className="text-navy-700">
                                        {payment.is_upfront
                                            ? 'مع اعتماد العقد'
                                            : `عند الزيارة ${payment.due_visit_sequence}`}
                                    </td>
                                    <td className="tabular text-left">{formatMoney(payment.amount)}</td>
                                    <td className="text-navy-600">{payment.status_label}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            <DocumentTotals
                rows={[['عدد الأجهزة', String(assets.length)]]}
                total={contract.value ? formatMoney(Number(contract.value)) : '—'}
                totalLabel="قيمة العقد"
            />
            </>
            )}
        </DocumentShell>
    )
}

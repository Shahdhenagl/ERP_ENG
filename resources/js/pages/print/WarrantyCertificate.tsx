import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState } from '@/components/ui'
import { WARRANTY_STATUS } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useWarranty } from '@/lib/queries'

/**
 * The certificate handed to the customer.
 *
 * It states the term and what the term covers, because "ضمان سنة" on its own
 * is the sentence every argument starts from — parts, labour, or both is what
 * actually decides who pays.
 */
export function WarrantyCertificate() {
    const { id } = useParams<{ id: string }>()
    const { data: warranty, isError, refetch } = useWarranty(id)

    if (isError) return <ErrorState message="تعذّر تحميل الضمان." onRetry={() => void refetch()} />
    if (!warranty) return null

    const state = WARRANTY_STATUS[warranty.effective_status]

    return (
        <DocumentShell
            title="شهادة ضمان"
            subtitle={warranty.code}
            footer={<p>هذه الشهادة صادرة إلكترونيًا ولا تحتاج إلى ختم لتكون سارية.</p>}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="العميل"
                    rows={[
                        ['الاسم', warranty.customer],
                        ['رقم الشهادة', warranty.code],
                    ]}
                />

                <DocumentParty
                    heading="الجهاز المشمول"
                    rows={[
                        ['الكود', warranty.asset_code],
                        ['الجهاز', warranty.asset],
                        ['الرقم التسلسلي', warranty.serial],
                    ]}
                />
            </div>

            {/* The term, stated once and large — it is what the customer
                reaches for the certificate to check. */}
            <div className="doc-keep mt-5 rounded-lg border-2 border-navy-900 p-4 text-center">
                <p className="text-[11px] font-bold text-navy-400">مدة الضمان</p>
                <p className="tabular mt-1 text-lg font-extrabold text-navy-900">
                    من {formatDate(warranty.starts_on)} إلى {formatDate(warranty.ends_on)}
                </p>
                <p className="mt-1 text-[13px] font-bold text-navy-700">
                    {warranty.kind_label} · يغطي {warranty.covers_label}
                </p>
                {warranty.effective_status !== 'active' && (
                    <p className="mt-1 text-[11px] font-bold text-navy-500">
                        الحالة اليوم: {state.label}
                    </p>
                )}
            </div>

            {warranty.supplier && (
                <p className="mt-3 text-[12px] text-navy-600">
                    ضمان المصنّع عبر {warranty.supplier}
                    {warranty.supplier_reference && (
                        <span dir="ltr"> · {warranty.supplier_reference}</span>
                    )}
                </p>
            )}

            {warranty.parent_code && (
                <p className="mt-3 text-[12px] text-navy-600">
                    هذه الشهادة تمديد للضمان رقم {warranty.parent_code}.
                </p>
            )}

            {warranty.terms && (
                <section className="doc-keep mt-5">
                    <h2 className="mb-1.5 text-[13px] font-extrabold text-navy-900">
                        شروط الضمان
                    </h2>
                    <p className="text-[12px] leading-relaxed whitespace-pre-line text-navy-700">
                        {warranty.terms}
                    </p>
                </section>
            )}

            <DocumentSignatures labels={['عن الشركة', 'استلم العميل']} />
        </DocumentShell>
    )
}

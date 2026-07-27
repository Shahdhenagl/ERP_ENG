import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { useSiteSurvey } from '@/lib/queries'

/**
 * معاينة الموقع — the site-survey sheet a quotation is sized against: who was
 * seen, the load and backup the site needs, what is already installed, and the
 * surveyor's recommendation.
 */
export function SiteSurveyPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: survey, isLoading, isError, refetch } = useSiteSurvey(id)

    if (isError) return <ErrorState message="تعذّر تحميل المعاينة." onRetry={() => void refetch()} />
    if (isLoading || !survey) return <PageLoader />

    return (
        <DocumentShell
            title="معاينة موقع"
            subtitle={survey.code}
            footer={<p>هذه المعاينة أساس عرض السعر ما دامت معتمدة.</p>}
        >
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="الموقع"
                    rows={[
                        ['العميل', survey.customer ?? survey.contact_name],
                        ['جهة الاتصال', survey.contact_name],
                        ['الهاتف', survey.contact_phone],
                        ['المدينة', survey.city],
                        ['العنوان', survey.address],
                    ]}
                />

                <DocumentParty
                    heading="بيانات المعاينة"
                    rows={[
                        ['الكود', survey.code],
                        ['التاريخ', survey.survey_date ? formatDate(survey.survey_date) : null],
                        ['المعاين', survey.surveyor],
                        ['الحالة', survey.status_label],
                    ]}
                />
            </div>

            {/* ── Technical requirement ───────────────────── */}
            <table className="doc-table mt-5">
                <tbody>
                    <tr>
                        <th className="w-40">الحمل المطلوب</th>
                        <td className="tabular">
                            {survey.load_kva !== null ? `${survey.load_kva} kVA` : '—'}
                        </td>
                    </tr>
                    <tr>
                        <th>عدد الأوجه</th>
                        <td>{survey.phase_label ?? '—'}</td>
                    </tr>
                    <tr>
                        <th>زمن التغذية الاحتياطية</th>
                        <td>{survey.backup_minutes ? `${survey.backup_minutes} دقيقة` : '—'}</td>
                    </tr>
                </tbody>
            </table>

            {survey.existing_equipment && (
                <Block title="الأجهزة الحالية" body={survey.existing_equipment} />
            )}
            {survey.recommendation && <Block title="التوصية" body={survey.recommendation} />}
            {survey.notes && <Block title="ملاحظات" body={survey.notes} />}

            <DocumentSignatures labels={['المعاين', 'العميل', 'الاعتماد']} />
        </DocumentShell>
    )
}

function Block({ title, body }: { title: string; body: string }) {
    return (
        <div className="doc-keep mt-4">
            <h3 className="mb-1 text-[13px] font-bold text-navy-700">{title}</h3>
            <p className="rounded-lg bg-navy-50 p-3 text-[13px] whitespace-pre-line text-navy-700">
                {body}
            </p>
        </div>
    )
}

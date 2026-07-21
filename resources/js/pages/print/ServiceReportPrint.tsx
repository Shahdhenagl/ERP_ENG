import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { DEVICE_CONDITION, READING_FIELDS } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { useTask } from '@/lib/queries'
import type { TaskReport } from '@/types'

/**
 * What the technician leaves with the customer: the readings taken, the work
 * done, the parts fitted, and a signature.
 *
 * The completion report is the one that gets signed; a diagnosis report is
 * printed too when that is all there is, since a customer who declined the
 * repair still wants the findings in writing.
 */
export function ServiceReportPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: task, isLoading, isError, refetch } = useTask(id)

    if (isError) return <ErrorState message="تعذّر تحميل المهمة." onRetry={() => void refetch()} />
    if (isLoading || !task) return <PageLoader />

    // `reports` only comes back on the detail endpoint. Guarding on it rather
    // than on `task` alone stops a half-loaded record rendering an empty sheet.

    const report =
        task.reports?.find((r) => r.type === 'completion') ??
        task.reports?.find((r) => r.type === 'diagnosis')

    return (
        <DocumentShell title="تقرير زيارة فنية" subtitle={task.code}>
            <div className="grid grid-cols-2 gap-4">
                <DocumentParty
                    heading="العميل"
                    rows={[
                        ['الاسم', task.customer?.name],
                        ['الشركة', task.customer?.company],
                        ['الهاتف', task.customer?.phone],
                        ['الموقع', task.effective_address],
                    ]}
                />

                <DocumentParty
                    heading="الزيارة"
                    rows={[
                        ['أمر الشغل', task.code],
                        ['النوع', task.type_label],
                        ['الفني', task.technician?.name],
                        ['التاريخ', task.completed_at ? formatDateTime(task.completed_at) : null],
                        ['الحالة', task.status_label],
                    ]}
                />
            </div>

            {task.asset && (
                <div className="doc-keep mt-4">
                    <DocumentParty
                        heading="الجهاز"
                        rows={[
                            ['الماركة والموديل', [task.asset.brand, task.asset.model].filter(Boolean).join(' ')],
                            ['الرقم التسلسلي', task.asset.serial],
                            ['القدرة', task.asset.capacity],
                            ['الضمان', task.asset.warranty_label],
                        ]}
                    />
                </div>
            )}

            <p className="doc-keep mt-4 text-[14px] font-bold text-navy-900">{task.title}</p>
            {task.description && (
                <p className="mt-1 text-[12px] leading-relaxed text-navy-600">{task.description}</p>
            )}

            {report ? (
                <ReportBody report={report} />
            ) : (
                <p className="doc-keep mt-6 rounded-lg bg-navy-50 p-4 text-center text-[13px] text-navy-400">
                    لم يُرفع تقرير فني لهذه الزيارة بعد.
                </p>
            )}

            <DocumentSignatures labels={['الفني', 'استلم العميل']} />
        </DocumentShell>
    )
}

function ReportBody({ report }: { report: TaskReport }) {
    // A blank column of dashes says nothing; only what was actually measured
    // belongs on a document the customer keeps.
    const readings = READING_FIELDS.filter(
        (field) => report.readings[field.key as keyof TaskReport['readings']] !== null,
    )

    return (
        <>
            {readings.length > 0 && (
                <section className="doc-keep mt-5">
                    <h2 className="mb-2 text-[13px] font-bold text-navy-800">القراءات الفنية</h2>
                    <table className="doc-table">
                        <thead>
                            <tr>
                                {readings.map((field) => (
                                    <th key={field.key} className="text-center">
                                        {field.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                {readings.map((field) => (
                                    <td key={field.key} className="tabular text-center font-bold">
                                        {report.readings[field.key as keyof TaskReport['readings']]}
                                        <span className="mr-1 text-[10px] font-normal text-navy-400">
                                            {field.unit}
                                        </span>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </section>
            )}

            <div className="doc-keep mt-4 flex flex-wrap gap-4 text-[12px]">
                {report.device_condition && (
                    <p>
                        <span className="text-navy-400">حالة الجهاز: </span>
                        <span className="font-bold text-navy-900">
                            {DEVICE_CONDITION[report.device_condition].label}
                        </span>
                    </p>
                )}
                {report.batteries_need_replacement && (
                    <p className="font-bold text-red-700">⚠ البطاريات تحتاج إلى استبدال</p>
                )}
            </div>

            {report.findings && <Narrative title="ما تم فحصه" body={report.findings} />}
            {report.actions_taken && <Narrative title="الأعمال المنفذة" body={report.actions_taken} />}
            {report.recommendations && <Narrative title="التوصيات" body={report.recommendations} />}

            {report.parts_used.length > 0 && (
                <section className="doc-keep mt-4">
                    <h2 className="mb-2 text-[13px] font-bold text-navy-800">قطع الغيار المستخدمة</h2>
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th>الصنف</th>
                                <th className="w-24 text-center">الكمية</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.parts_used.map((part, index) => (
                                <tr key={index}>
                                    <td>{part.name}</td>
                                    <td className="tabular text-center">{part.qty ?? 1}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            {report.signature_url && (
                <div className="doc-keep mt-5">
                    <p className="mb-1 text-[11px] text-navy-400">
                        توقيع العميل{report.signed_by_name && ` — ${report.signed_by_name}`}
                    </p>
                    <img
                        src={report.signature_url}
                        alt="توقيع العميل"
                        className="h-20 object-contain"
                    />
                </div>
            )}
        </>
    )
}

function Narrative({ title, body }: { title: string; body: string }) {
    return (
        <section className="doc-keep mt-4">
            <h2 className="mb-1 text-[13px] font-bold text-navy-800">{title}</h2>
            <p className="text-[12px] leading-relaxed whitespace-pre-line text-navy-700">{body}</p>
        </section>
    )
}

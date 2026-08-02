import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentSignatures } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { DEVICE_CONDITION, SITE_CHECKS, SITE_CHECK_OPTIONS } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { useTask } from '@/lib/queries'
import type { TaskReport } from '@/types'

/**
 * What the technician leaves with the customer: the readings taken before and
 * after the work, the site checks, the parts fitted, and a signature.
 *
 * When both a diagnosis and a completion report exist the readings are shown
 * before-and-after, so the sheet itself shows the visit made a difference. A
 * lone diagnosis is printed too — a customer who declined the repair still
 * wants the findings in writing.
 */

const READING_LABELS: Record<string, string> = {
    input_voltage: 'جهد الدخول L1',
    input_voltage_l2: 'جهد الدخول L2',
    input_voltage_l3: 'جهد الدخول L3',
    output_voltage: 'جهد الخروج L1',
    output_voltage_l2: 'جهد الخروج L2',
    output_voltage_l3: 'جهد الخروج L3',
    frequency: 'التردد',
    load_percent: 'التحميل %',
    battery_voltage: 'جهد البطاريات',
    temperature: 'الحرارة',
    backup_minutes: 'Backup (د)',
}

export function ServiceReportPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: task, isLoading, isError, refetch } = useTask(id)

    if (isError) return <ErrorState message="تعذّر تحميل المهمة." onRetry={() => void refetch()} />
    if (isLoading || !task) return <PageLoader />

    const diagnosis = task.reports?.find((r) => r.type === 'diagnosis')
    const completion = task.reports?.find((r) => r.type === 'completion')
    // The completion report is the signed one; fall back to the diagnosis.
    const primary = completion ?? diagnosis
    const duration = task.visit?.duration_minutes

    return (
        <DocumentShell title="تقرير زيارة فنية" number={task.service_report_no ?? task.code}>
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
                        ['رقم التقرير', task.service_report_no],
                        ['أمر الشغل', task.code],
                        ['النوع', task.type_label],
                        ['الفني', task.technician?.name],
                        ['الدخول', task.visit?.time_in ? formatDateTime(task.visit.time_in) : null],
                        ['الخروج', task.visit?.time_out ? formatDateTime(task.visit.time_out) : null],
                        [
                            'مدة الزيارة',
                            typeof duration === 'number'
                                ? `${Math.floor(duration / 60) ? `${Math.floor(duration / 60)}س ` : ''}${duration % 60}د`
                                : null,
                        ],
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

            {!primary ? (
                <p className="doc-keep mt-6 rounded-lg bg-navy-50 p-4 text-center text-[13px] text-navy-400">
                    لم يُرفع تقرير فني لهذه الزيارة بعد.
                </p>
            ) : (
                <>
                    {diagnosis && completion ? (
                        <BeforeAfterReadings before={diagnosis} after={completion} />
                    ) : (
                        <SingleReadings report={primary} />
                    )}

                    <SiteChecks report={primary} />
                    <PpmChecklist report={primary} />

                    <div className="doc-keep mt-4 flex flex-wrap gap-4 text-[12px]">
                        {primary.device_condition && (
                            <p>
                                <span className="text-navy-400">حالة الجهاز: </span>
                                <span className="font-bold text-navy-900">
                                    {DEVICE_CONDITION[primary.device_condition].label}
                                </span>
                            </p>
                        )}
                        {primary.batteries_need_replacement && (
                            <p className="font-bold text-red-700">⚠ البطاريات تحتاج إلى استبدال</p>
                        )}
                    </div>

                    {primary.findings && <Narrative title="ما تم فحصه" body={primary.findings} />}
                    {primary.actions_taken && <Narrative title="الأعمال المنفذة" body={primary.actions_taken} />}
                    {primary.recommendations && <Narrative title="التوصيات" body={primary.recommendations} />}

                    {primary.parts_used.length > 0 && (
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
                                    {primary.parts_used.map((part, index) => (
                                        <tr key={index}>
                                            <td>{part.name}</td>
                                            <td className="tabular text-center">{part.qty ?? 1}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}

                    {primary.signature_url && (
                        <div className="doc-keep mt-5">
                            <p className="mb-1 text-[11px] text-navy-400">
                                توقيع العميل{primary.signed_by_name && ` — ${primary.signed_by_name}`}
                            </p>
                            <img src={primary.signature_url} alt="توقيع العميل" className="h-20 object-contain" />
                        </div>
                    )}
                </>
            )}

            <DocumentSignatures labels={['الفني', 'استلم العميل']} />
        </DocumentShell>
    )
}

/** One reading per column — used when there's only a single report. */
function SingleReadings({ report }: { report: TaskReport }) {
    const rows = Object.keys(READING_LABELS).filter(
        (key) => report.readings[key as keyof TaskReport['readings']] !== null,
    )

    if (rows.length === 0) return null

    return (
        <section className="doc-keep mt-5">
            <h2 className="mb-2 text-[13px] font-bold text-navy-800">القراءات الفنية</h2>
            <table className="doc-table">
                <tbody>
                    {rows.map((key) => (
                        <tr key={key}>
                            <td>{READING_LABELS[key]}</td>
                            <td className="tabular w-32 text-center font-bold">
                                {report.readings[key as keyof TaskReport['readings']]}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    )
}

/** Before against after — proof on the sheet that the visit changed something. */
function BeforeAfterReadings({ before, after }: { before: TaskReport; after: TaskReport }) {
    const rows = Object.keys(READING_LABELS).filter((key) => {
        const b = before.readings[key as keyof TaskReport['readings']]
        const a = after.readings[key as keyof TaskReport['readings']]
        return b !== null || a !== null
    })

    if (rows.length === 0) return null

    return (
        <section className="doc-keep mt-5">
            <h2 className="mb-2 text-[13px] font-bold text-navy-800">القراءات الفنية — قبل وبعد</h2>
            <table className="doc-table">
                <thead>
                    <tr>
                        <th>القراءة</th>
                        <th className="w-28 text-center">قبل</th>
                        <th className="w-28 text-center">بعد</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((key) => (
                        <tr key={key}>
                            <td>{READING_LABELS[key]}</td>
                            <td className="tabular text-center">
                                {before.readings[key as keyof TaskReport['readings']] ?? '—'}
                            </td>
                            <td className="tabular text-center font-bold">
                                {after.readings[key as keyof TaskReport['readings']] ?? '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    )
}

function SiteChecks({ report }: { report: TaskReport }) {
    const marked = SITE_CHECKS.filter((c) => report.site_checks[c.key])
    if (marked.length === 0) return null

    return (
        <div className="doc-keep mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            {marked.map((c) => {
                const verdict = report.site_checks[c.key] as 'ok' | 'issue' | 'na'

                return (
                    <span key={c.key}>
                        <span className="text-navy-400">{c.label}: </span>
                        <span className="font-bold text-navy-900">{SITE_CHECK_OPTIONS[verdict].label}</span>
                    </span>
                )
            })}
        </div>
    )
}

function PpmChecklist({ report }: { report: TaskReport }) {
    const filled = (report.ppm_checklist ?? []).filter((a) => a.status)
    if (filled.length === 0) return null

    const label = { ok: 'سليم', issue: 'يحتاج انتباه', na: 'لا ينطبق' }

    return (
        <section className="doc-keep mt-4">
            <h2 className="mb-2 text-[13px] font-bold text-navy-800">قائمة الفحص الدوري</h2>
            <table className="doc-table">
                <tbody>
                    {filled.map((answer, index) => (
                        <tr key={index}>
                            <td>
                                {answer.label}
                                {answer.note && (
                                    <span className="text-[11px] text-navy-400"> — {answer.note}</span>
                                )}
                            </td>
                            <td className="w-28 text-center font-bold">
                                {label[answer.status as 'ok' | 'issue' | 'na']}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
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

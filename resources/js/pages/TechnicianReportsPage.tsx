import clsx from 'clsx'
import { CheckCircle2, ClipboardCheck, Paperclip, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Attachments } from '@/components/Attachments'
import { CustomerSitePicker } from '@/components/CustomerSitePicker'
import { Modal } from '@/components/Modal'
import { CollectorSelect } from '@/components/MoneyFields'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PageHeader, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import {
    useDeleteTechnicianReport,
    useSaveTechnicianReport,
    useTechnicianReports,
    type TechnicianReportRow,
} from '@/lib/queries'

type ReportDialogRow = {
    technician_id: number
    technician: string
    report: TechnicianReportRow['report']
}

/**
 * The monthly report handover register.
 *
 * A technician may hand in several reports in the same month. Each report is
 * kept as an independent handover so its customer, branch and scanned files
 * remain attached to the right paperwork.
 */
export function TechnicianReportsPage() {
    const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
    const { data, isLoading } = useTechnicianReports(period)
    const [signing, setSigning] = useState<ReportDialogRow | null>(null)

    const received = data?.meta.received ?? 0
    const total = data?.meta.total ?? 0
    const reportsTotal = data?.meta.reports_total ?? 0

    const openNewReport = () => {
        const firstTechnician = data?.meta.technicians[0]
        if (!firstTechnician) return

        setSigning({
            technician_id: firstTechnician.id,
            technician: firstTechnician.name,
            report: null,
        })
    }

    return (
        <>
            <PageHeader
                title="التقارير الشهرية للفنيين"
                subtitle={data ? `${reportsTotal} تقرير مسجّل · ${received} فني سلّم تقريرًا` : undefined}
                actions={
                    <Button icon={Plus} onClick={openNewReport} disabled={!data?.meta.technicians.length}>
                        تسجيل تقرير
                    </Button>
                }
            />

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <Input
                    type="month"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value)}
                    className="w-44"
                    aria-label="الشهر"
                />

                {data && (
                    <span
                        className={clsx(
                            'badge',
                            received === total && total > 0
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
                        )}
                    >
                        {received} من {total} فني — تم الاستلام
                    </span>
                )}
            </div>

            <p className="mb-4 rounded-xl bg-navy-50 px-3 py-2.5 text-xs leading-relaxed text-navy-500">
                هذا سجل استلام ورق فقط — يمكن تسجيل أكثر من تقرير للفني نفسه، وكل تقرير يحتفظ بالعميل والفرع وملفاته الخاصة.
            </p>

            {isLoading || !data ? (
                <SkeletonCard />
            ) : data.data.length === 0 ? (
                <div className="card p-8 text-center">
                    <ClipboardCheck className="mx-auto mb-2 size-8 text-navy-300" />
                    <p className="text-sm font-semibold text-navy-700">لا توجد تقارير مستلمة لهذا الشهر.</p>
                    <p className="mt-1 text-xs text-navy-400">ابدئي بتسجيل تقرير جديد من الزر أعلى الصفحة.</p>
                </div>
            ) : (
                <div className="card overflow-x-auto">
                    <table className="w-full min-w-[64rem] text-start text-sm">
                        <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                            <tr>
                                <th className="px-3 py-2.5 text-start">الفني</th>
                                <th className="px-3 py-2.5 text-start">العميل</th>
                                <th className="px-3 py-2.5 text-start">الفرع</th>
                                <th className="px-3 py-2.5 text-start">المستلم منه</th>
                                <th className="px-3 py-2.5 text-start">تاريخ الاستلام</th>
                                <th className="w-24 px-3 py-2.5 text-start">المرفقات</th>
                                <th className="w-28 px-3 py-2.5" />
                            </tr>
                        </thead>

                        <tbody>
                            {data.data.map((row) => (
                                <tr
                                    key={row.report?.id ?? `${row.technician_id}-${period}`}
                                    className="border-t border-navy-100 hover:bg-navy-50/60"
                                >
                                    <td className="px-3 py-2.5 font-semibold text-navy-800">{row.technician}</td>
                                    <td className="max-w-52 truncate px-3 py-2.5 text-navy-600" title={row.report?.customer ?? ''}>
                                        {row.report?.customer ?? '—'}
                                    </td>
                                    <td className="max-w-44 truncate px-3 py-2.5 text-navy-600" title={row.report?.branch ?? 'المقر الرئيسي'}>
                                        {row.report?.branch ?? 'المقر الرئيسي'}
                                    </td>
                                    <td className="px-3 py-2.5 text-navy-600">{row.report?.received_by ?? '—'}</td>
                                    <td className="tabular px-3 py-2.5 text-navy-600">
                                        {row.report?.received_on ? formatDate(row.report.received_on) : '—'}
                                    </td>
                                    <td className="tabular px-3 py-2.5 text-navy-600">
                                        {row.report?.attachments_count ? (
                                            <span className="inline-flex items-center gap-1">
                                                <Paperclip className="size-3.5" />
                                                {row.report.attachments_count}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <button
                                            onClick={() => setSigning(row)}
                                            className="tap rounded-lg px-2.5 py-1 text-xs font-bold text-brand-600 transition hover:bg-brand-50"
                                        >
                                            فتح التقرير
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {signing && (
                <SignDialog
                    row={signing}
                    period={period}
                    technicians={data?.meta.technicians ?? []}
                    onClose={() => setSigning(null)}
                />
            )}
        </>
    )
}

function SignDialog({
    row,
    period,
    technicians,
    onClose,
}: {
    row: ReportDialogRow
    period: string
    technicians: Array<{ id: number; name: string }>
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveTechnicianReport(period)
    const remove = useDeleteTechnicianReport(period)

    const [reportId, setReportId] = useState<number | null>(row.report?.id ?? null)
    const [technicianId, setTechnicianId] = useState(String(row.report?.technician_id ?? row.technician_id))
    const [receiver, setReceiver] = useState(
        row.report?.received_by_user_id ? String(row.report.received_by_user_id) : '',
    )
    const [receivedOn, setReceivedOn] = useState(
        row.report?.received_on ?? new Date().toISOString().slice(0, 10),
    )
    const [customerId, setCustomerId] = useState(String(row.report?.customer_id ?? ''))
    const [branchId, setBranchId] = useState(String(row.report?.branch_id ?? ''))
    const [notes, setNotes] = useState(row.report?.notes ?? '')

    const technicianName = technicians.find((technician) => String(technician.id) === technicianId)?.name ?? row.technician

    const submit = async () => {
        try {
            const saved = await save.mutateAsync({
                report_id: reportId,
                technician_id: Number(technicianId),
                period,
                customer_id: Number(customerId),
                branch_id: branchId ? Number(branchId) : null,
                received_by_user_id: receiver ? Number(receiver) : null,
                received_on: receivedOn || null,
                notes: notes || null,
            })
            setReportId(saved.id)
            toast.success('تم حفظ استلام التقرير. يمكنك الآن رفع ملف الـ Scan.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تسجيل الاستلام.'))
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={`التقرير الشهري — ${technicianName}`}
            description={`عن شهر ${period}`}
            size="md"
            footer={
                <>
                    {reportId && (
                        <button
                            type="button"
                            onClick={async () => {
                                if (!window.confirm('حذف تسجيل الاستلام لهذا التقرير؟')) return

                                try {
                                    await remove.mutateAsync(reportId)
                                    toast.success('تم حذف تسجيل الاستلام.')
                                    onClose()
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                                }
                            }}
                            className="tap me-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50"
                        >
                            <Trash2 className="size-3.5" />
                            حذف التقرير
                        </button>
                    )}

                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إغلاق
                    </Button>
                    <Button icon={CheckCircle2} loading={save.isPending} onClick={submit}>
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الفني الذي سلّم التقرير" required>
                    <select
                        value={technicianId}
                        onChange={(event) => setTechnicianId(event.target.value)}
                        className="input w-full"
                        disabled={Boolean(reportId)}
                    >
                        <option value="">اختر الفني</option>
                        {technicians.map((technician) => (
                            <option key={technician.id} value={technician.id}>
                                {technician.name}
                            </option>
                        ))}
                    </select>
                </Field>

                <CustomerSitePicker
                    customerId={customerId}
                    branchId={branchId}
                    onChange={({ customerId: nextCustomerId, branchId: nextBranchId }) => {
                        setCustomerId(nextCustomerId)
                        setBranchId(nextBranchId)
                    }}
                />

                <CollectorSelect
                    value={receiver}
                    onChange={setReceiver}
                    label="الموظف المستلم"
                    hint="من استلم التقرير من الفني — للسجل فقط."
                />

                <Field label="تاريخ الاستلام" required>
                    <Input
                        type="date"
                        value={receivedOn}
                        onChange={(event) => setReceivedOn(event.target.value)}
                    />
                </Field>

                <Field label="ملاحظات">
                    <Textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={2}
                        placeholder="ما لوحظ على التقرير…"
                    />
                </Field>

                {reportId ? (
                    <Attachments type="technician-reports" id={reportId} label="Scan / ملفات التقرير" />
                ) : (
                    <p className="rounded-xl bg-navy-50 p-3 text-[11px] leading-relaxed text-navy-400">
                        <ClipboardCheck className="me-1 inline size-3.5" />
                        احفظ بيانات التقرير أولًا، ثم ارفع ملف الـ Scan عليه.
                    </p>
                )}
            </div>
        </Modal>
    )
}

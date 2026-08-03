import clsx from 'clsx'
import { CheckCircle2, ClipboardCheck, Paperclip, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Attachments } from '@/components/Attachments'
import { Modal } from '@/components/Modal'
import { CollectorSelect } from '@/components/MoneyFields'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PageHeader, SkeletonCard, Textarea, Th } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import {
    useDeleteTechnicianReport,
    useSaveTechnicianReport,
    useTechnicianReports,
    type TechnicianReportRow,
} from '@/lib/queries'

/**
 * The start-of-month roll-call: who has handed their report in, and to whom.
 *
 * Every active technician is listed whether or not they have handed anything
 * in, because a list of only those who did answers the wrong question. The one
 * being asked at the start of a month is who has *not*.
 *
 * A record of a handover and nothing else — it moves no money, settles no
 * custody and touches no payslip. The month owes exactly what it owed before.
 */
export function TechnicianReportsPage() {
    const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
    const { data, isLoading } = useTechnicianReports(period)
    const [signing, setSigning] = useState<TechnicianReportRow | null>(null)

    const received = data?.meta.received ?? 0
    const total = data?.meta.total ?? 0

    return (
        <>
            <PageHeader
                title="التقارير الشهرية للفنيين"
                subtitle="سجل استلام التقرير من كل فني — من استلمه ومتى"
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
                        {received} من {total} تم استلامه
                    </span>
                )}
            </div>

            <p className="mb-4 rounded-xl bg-navy-50 px-3 py-2.5 text-xs leading-relaxed text-navy-500">
                هذا سجل استلام ورق فقط — لا يُقيَّد على حساب الفني ولا على عهدته ولا على مرتّبه.
            </p>

            {isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <div className="card overflow-x-auto">
                    <table className="w-full min-w-[48rem] text-start text-sm">
                        <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                            <tr>
                                <Th className="px-3 py-2.5">الفني</Th>
                                <Th className="w-28 px-3 py-2.5">الحالة</Th>
                                <Th className="w-40 px-3 py-2.5">استلمه</Th>
                                <Th className="w-32 px-3 py-2.5">تاريخ الاستلام</Th>
                                <Th className="w-20 px-3 py-2.5">مرفقات</Th>
                                <Th className="w-28 px-3 py-2.5" />
                            </tr>
                        </thead>

                        <tbody>
                            {data.data.map((row) => (
                                <tr
                                    key={row.technician_id}
                                    className="border-t border-navy-100 hover:bg-navy-50/60"
                                >
                                    <td className="px-3 py-2.5 font-semibold text-navy-800">
                                        {row.technician}
                                    </td>

                                    <td className="px-3 py-2.5">
                                        {row.report ? (
                                            <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                                تم الاستلام
                                            </span>
                                        ) : (
                                            <span className="badge bg-navy-100 text-navy-500">
                                                لم يُستلم
                                            </span>
                                        )}
                                    </td>

                                    <td className="px-3 py-2.5 text-navy-600">
                                        {row.report?.received_by ?? '—'}
                                    </td>

                                    <td className="tabular px-3 py-2.5 text-navy-600">
                                        {row.report?.received_on
                                            ? formatDate(row.report.received_on)
                                            : '—'}
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
                                            {row.report ? 'فتح' : 'تسجيل الاستلام'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {signing && (
                <SignDialog row={signing} period={period} onClose={() => setSigning(null)} />
            )}
        </>
    )
}

function SignDialog({
    row,
    period,
    onClose,
}: {
    row: TechnicianReportRow
    period: string
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveTechnicianReport(period)
    const remove = useDeleteTechnicianReport(period)

    const [receiver, setReceiver] = useState(
        row.report?.received_by_user_id ? String(row.report.received_by_user_id) : '',
    )
    const [receivedOn, setReceivedOn] = useState(
        row.report?.received_on ?? new Date().toISOString().slice(0, 10),
    )
    const [notes, setNotes] = useState(row.report?.notes ?? '')

    const submit = async () => {
        try {
            await save.mutateAsync({
                technician_id: row.technician_id,
                period,
                received_by_user_id: receiver ? Number(receiver) : null,
                received_on: receivedOn || null,
                notes: notes || null,
            })
            toast.success('تم تسجيل الاستلام.')
            onClose()
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تسجيل الاستلام.'))
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={`التقرير الشهري — ${row.technician}`}
            description={`عن شهر ${period}`}
            size="md"
            footer={
                <>
                    {row.report && (
                        <button
                            type="button"
                            onClick={async () => {
                                if (!window.confirm('حذف تسجيل الاستلام لهذا الشهر؟')) return

                                try {
                                    await remove.mutateAsync(row.report!.id)
                                    toast.success('تم حذف تسجيل الاستلام.')
                                    onClose()
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                                }
                            }}
                            className="tap me-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50"
                        >
                            <Trash2 className="size-3.5" />
                            حذف التسجيل
                        </button>
                    )}

                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button icon={CheckCircle2} loading={save.isPending} onClick={submit}>
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <CollectorSelect
                    value={receiver}
                    onChange={setReceiver}
                    label="الموظف المستلم"
                    hint="من استلم التقرير من الفني — للسجل فقط."
                />

                <Field label="تاريخ الاستلام">
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
                        placeholder="ما لوحظ على تقرير الشهر…"
                    />
                </Field>

                {/* A file needs a record to hang on, so the month is signed
                    first and the paperwork attached to it after. */}
                {row.report ? (
                    <Attachments type="technician-reports" id={row.report.id} label="ملفات التقرير" />
                ) : (
                    <p className="rounded-xl bg-navy-50 p-3 text-[11px] leading-relaxed text-navy-400">
                        <ClipboardCheck className="me-1 inline size-3.5" />
                        احفظ الاستلام أولًا، ثم ارفع ملفات التقرير عليه.
                    </p>
                )}
            </div>
        </Modal>
    )
}

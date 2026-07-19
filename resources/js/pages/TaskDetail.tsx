import clsx from 'clsx'
import {
    ArrowRight,
    Battery,
    Camera,
    ClipboardCheck,
    Cpu,
    FileText,
    ImageIcon,
    MapPin,
    MessageCircle,
    Navigation,
    Pencil,
    Phone,
    Trash2,
    UserCog,
    X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { ReportForm } from '@/components/ReportForm'
import { StatusRail } from '@/components/StatusRail'
import { useToast } from '@/components/Toast'
import { Badge, Button, ErrorState, Field, PageLoader, Select, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { DEVICE_CONDITION, PRIORITY, STATUS, TASK_TYPE, warrantyChip } from '@/lib/domain'
import { formatBytes, formatDateTime, formatSmart, telLink } from '@/lib/format'
import { useArea } from '@/lib/nav'
import {
    useAssignTask,
    useChangeStatus,
    useDeleteAttachment,
    useDeleteTask,
    useTask,
    useTechnicians,
    useUploadAttachments,
} from '@/lib/queries'
import type { AttachmentKind, ReportType, Task, TaskReport, TaskStatus } from '@/types'

export function TaskDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const toast = useToast()
    const { canDispatch, isTechnician, user } = useAuth()
    const { path } = useArea()

    const { data: task, isLoading, isError, refetch } = useTask(id)
    const changeStatus = useChangeStatus(Number(id))
    const deleteTask = useDeleteTask()

    const [reportForm, setReportForm] = useState<ReportType | null>(null)
    const [cancelOpen, setCancelOpen] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    const [assignOpen, setAssignOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)

    if (isLoading) return <PageLoader />
    if (isError || !task) {
        return <ErrorState message="تعذّر تحميل المهمة." onRetry={() => void refetch()} />
    }

    const status = STATUS[task.status]
    const priority = PRIORITY[task.priority]
    const type = TASK_TYPE[task.type]
    const StatusIcon = status.icon
    const TypeIcon = type.icon

    const isMine = task.technician?.id === user?.id
    const canDrive = canDispatch || (isTechnician && isMine)
    const completionReport = task.reports?.find((report) => report.type === 'completion')
    const diagnosisReport = task.reports?.find((report) => report.type === 'diagnosis')

    /** Completing a job without a report loses the field data — block it. */
    const needsReportBeforeCompleting = (next: TaskStatus) =>
        next === 'completed' && !completionReport

    const handleStatus = async (next: TaskStatus) => {
        if (next === 'cancelled') {
            setCancelOpen(true)

            return
        }

        if (needsReportBeforeCompleting(next)) {
            toast.info('املأ تقرير الإنهاء أولاً قبل إقفال المهمة.')
            setReportForm('completion')

            return
        }

        // Stamp where the technician was — useful evidence on a dispute.
        const position = await currentPosition()

        try {
            await changeStatus.mutateAsync({ status: next, ...position })
            toast.success(`تم تحديث الحالة إلى «${STATUS[next].label}».`)
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تحديث الحالة.'))
        }
    }

    const handleCancel = async () => {
        try {
            await changeStatus.mutateAsync({ status: 'cancelled', cancel_reason: cancelReason })
            toast.success('تم إلغاء المهمة.')
            setCancelOpen(false)
            setCancelReason('')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر إلغاء المهمة.'))
        }
    }

    return (
        <>
            {/* ── Back + actions ─────────────────────────────── */}
            <div className="mb-4 flex items-center justify-between gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="btn-ghost -mr-2 text-sm"
                >
                    <ArrowRight className="size-4" />
                    رجوع
                </button>

                {canDispatch && (
                    <div className="flex gap-1">
                        <Link to={path(`/tasks/${task.id}/edit`)} className="btn-ghost tap px-3" aria-label="تعديل">
                            <Pencil className="size-4" />
                        </Link>
                        <button
                            onClick={() => setDeleteOpen(true)}
                            className="btn-ghost tap px-3 text-red-500 hover:bg-red-50"
                            aria-label="حذف"
                        >
                            <Trash2 className="size-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Hero ───────────────────────────────────────── */}
            <div className="surface-brand relative mb-5 overflow-hidden rounded-3xl p-5 sm:p-6">
                <div className="pointer-events-none absolute -top-16 -left-10 size-56 rounded-full bg-brand-400/20 blur-3xl" />

                <div className="relative">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white ring-1 ring-white/20">
                            {task.code}
                        </span>
                        <span className={clsx('badge', priority.chip)}>
                            <span className={clsx('size-1.5 rounded-full', priority.dot)} />
                            {task.priority_label}
                        </span>
                        <span className={clsx('badge', status.chip)}>
                            <StatusIcon className="size-3.5" />
                            {task.status_label}
                        </span>
                    </div>

                    <h1 className="mt-3 text-xl font-extrabold text-white sm:text-2xl">{task.title}</h1>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-200">
                        <span className="flex items-center gap-1.5">
                            <TypeIcon className="size-3.5" />
                            {task.type_label}
                        </span>
                        {task.scheduled_at && (
                            <span>الموعد: {formatSmart(task.scheduled_at)}</span>
                        )}
                        {task.technician && <span>الفني: {task.technician.name}</span>}
                    </div>

                    {task.description && (
                        <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm leading-relaxed text-white/90 ring-1 ring-white/10">
                            {task.description}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Primary actions ────────────────────────────── */}
            {canDrive && !task.is_terminal && (
                <section className="card mb-5 p-4">
                    <h2 className="mb-3 text-sm font-bold text-navy-800">الإجراء التالي</h2>

                    <div className="flex flex-wrap gap-2">
                        {task.allowed_next.map((next) => {
                            const meta = STATUS[next.value]
                            const Icon = meta.icon
                            const isCancel = next.value === 'cancelled'

                            return (
                                <Button
                                    key={next.value}
                                    variant={isCancel ? 'secondary' : 'primary'}
                                    icon={Icon}
                                    loading={changeStatus.isPending && !isCancel}
                                    onClick={() => handleStatus(next.value)}
                                    className={clsx(isCancel && 'text-red-600')}
                                >
                                    {next.label}
                                </Button>
                            )
                        })}
                    </div>
                </section>
            )}

            <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                    {/* ── Customer ───────────────────────────── */}
                    {task.customer && (
                        <section className="card p-5">
                            <h2 className="mb-4 text-sm font-bold text-navy-800">بيانات العميل</h2>

                            <div className="space-y-3">
                                <div>
                                    <p className="text-base font-bold text-navy-900">{task.customer.name}</p>
                                    {task.customer.company && (
                                        <p className="text-xs text-navy-400">{task.customer.company}</p>
                                    )}
                                </div>

                                {task.effective_address && (
                                    <p className="flex items-start gap-2 text-sm text-navy-600">
                                        <MapPin className="mt-0.5 size-4 shrink-0 text-navy-300" />
                                        {task.effective_address}
                                    </p>
                                )}

                                {/* The three things a technician on site actually needs */}
                                <div className="grid grid-cols-3 gap-2 pt-1">
                                    <a
                                        href={telLink(task.customer.phone)}
                                        className="btn-secondary flex-col gap-1 py-3 text-xs"
                                    >
                                        <Phone className="size-4" />
                                        اتصال
                                    </a>

                                    <a
                                        href={task.customer.whatsapp_link ?? undefined}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={clsx(
                                            'btn-whatsapp flex-col gap-1 py-3 text-xs',
                                            !task.customer.whatsapp_link && 'pointer-events-none opacity-40',
                                        )}
                                    >
                                        <MessageCircle className="size-4" />
                                        واتساب
                                    </a>

                                    <a
                                        href={task.navigation_url ?? undefined}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={clsx(
                                            'btn-primary flex-col gap-1 py-3 text-xs',
                                            !task.navigation_url && 'pointer-events-none opacity-40',
                                        )}
                                    >
                                        <Navigation className="size-4" />
                                        الاتجاهات
                                    </a>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* ── Device ─────────────────────────────── */}
                    {task.asset && (
                        <section className="card p-5">
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                <h2 className="flex items-center gap-2 text-sm font-bold text-navy-800">
                                    <Cpu className="size-4 text-navy-300" />
                                    الجهاز
                                </h2>
                                {/* Whether this visit is billable hangs on the warranty,
                                    so it sits next to the device, not buried a page away. */}
                                <span className={clsx('badge', warrantyChip(task.asset.under_warranty))}>
                                    ضمان: {task.asset.warranty_label}
                                </span>
                                <Link
                                    to={path(`/assets/${task.asset.id}`)}
                                    className="mr-auto text-xs font-bold text-brand-600 hover:underline"
                                >
                                    سجل الجهاز
                                </Link>
                            </div>

                            <dl className="grid grid-cols-2 gap-4 text-sm">
                                <Detail label="الماركة" value={task.asset.brand} />
                                <Detail label="الموديل" value={task.asset.model} />
                                <Detail label="القدرة" value={task.asset.capacity} />
                                <Detail label="الرقم التسلسلي" value={task.asset.serial} mono />
                            </dl>
                        </section>
                    )}

                    {/* ── Reports ────────────────────────────── */}
                    <section className="card p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-800">
                                <ClipboardCheck className="size-4 text-navy-300" />
                                التقارير الفنية
                            </h2>

                            {canDrive && (
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        className="text-xs"
                                        onClick={() => setReportForm('diagnosis')}
                                    >
                                        {diagnosisReport ? 'تعديل التشخيص' : 'تشخيص'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="text-xs"
                                        onClick={() => setReportForm('completion')}
                                    >
                                        {completionReport ? 'تعديل الإنهاء' : 'إنهاء'}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {!diagnosisReport && !completionReport ? (
                            <p className="rounded-xl bg-navy-50 px-4 py-6 text-center text-sm text-navy-400">
                                لم يتم رفع أي تقرير بعد.
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {diagnosisReport && (
                                    <ReportBlock title="تقرير التشخيص" report={diagnosisReport} />
                                )}
                                {completionReport && (
                                    <ReportBlock title="تقرير الإنهاء" report={completionReport} />
                                )}
                            </div>
                        )}
                    </section>

                    {/* ── Photos ─────────────────────────────── */}
                    <AttachmentsSection task={task} canEdit={canDrive} />
                </div>

                {/* ── Sidebar ────────────────────────────────── */}
                <div className="space-y-5">
                    <section className="card p-5">
                        <h2 className="mb-4 text-sm font-bold text-navy-800">مسار المهمة</h2>
                        <StatusRail task={task} />
                    </section>

                    {/* WhatsApp shortcuts */}
                    <section className="card p-5">
                        <h2 className="mb-3 text-sm font-bold text-navy-800">إرسال عبر واتساب</h2>
                        <div className="space-y-2">
                            {canDispatch && task.whatsapp.brief_technician && (
                                <a
                                    href={task.whatsapp.brief_technician}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-whatsapp w-full"
                                >
                                    <MessageCircle className="size-4" />
                                    إرسال التفاصيل للفني
                                </a>
                            )}

                            {task.whatsapp.report_manager && (
                                <a
                                    href={task.whatsapp.report_manager}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-secondary w-full"
                                >
                                    <MessageCircle className="size-4" />
                                    إرسال التقرير للمدير
                                </a>
                            )}

                            {canDispatch && task.whatsapp.brief_customer && (
                                <a
                                    href={task.whatsapp.brief_customer}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-secondary w-full"
                                >
                                    <MessageCircle className="size-4" />
                                    إرسال للعميل
                                </a>
                            )}
                        </div>
                    </section>

                    {canDispatch && (
                        <section className="card p-5">
                            <h2 className="mb-3 text-sm font-bold text-navy-800">الفني المسند</h2>

                            {task.technician ? (
                                <div className="mb-3 flex items-center gap-3">
                                    <div className="grid size-10 place-items-center rounded-xl bg-navy-50 font-bold text-navy-600">
                                        {task.technician.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-navy-900">
                                            {task.technician.name}
                                        </p>
                                        <p className="truncate text-xs text-navy-400">
                                            {task.technician.job_title ?? 'فني'}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                                    لم يتم إسناد فني بعد.
                                </p>
                            )}

                            <Button
                                variant="secondary"
                                icon={UserCog}
                                block
                                onClick={() => setAssignOpen(true)}
                            >
                                {task.technician ? 'تغيير الفني' : 'إسناد فني'}
                            </Button>
                        </section>
                    )}

                    {/* Audit trail */}
                    {task.status_logs && task.status_logs.length > 0 && (
                        <section className="card p-5">
                            <h2 className="mb-3 text-sm font-bold text-navy-800">سجل التحديثات</h2>
                            <ul className="space-y-3">
                                {[...task.status_logs].reverse().map((log) => (
                                    <li key={log.id} className="border-r-2 border-navy-100 pr-3 text-xs">
                                        <p className="font-bold text-navy-800">
                                            {log.from_label ? `${log.from_label} ← ` : ''}
                                            {log.to_label}
                                        </p>
                                        <p className="mt-0.5 text-navy-400">
                                            {log.user?.name} · {formatDateTime(log.created_at)}
                                        </p>
                                        {log.note && (
                                            <p className="mt-1 text-navy-600">{log.note}</p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            </div>

            {/* ── Dialogs ────────────────────────────────────── */}
            {reportForm && (
                <ReportForm
                    open
                    onClose={() => setReportForm(null)}
                    task={task}
                    type={reportForm}
                    existing={reportForm === 'completion' ? completionReport : diagnosisReport}
                />
            )}

            <Modal
                open={cancelOpen}
                onClose={() => setCancelOpen(false)}
                title="إلغاء المهمة"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setCancelOpen(false)}>
                            تراجع
                        </Button>
                        <Button
                            variant="danger"
                            icon={X}
                            loading={changeStatus.isPending}
                            onClick={handleCancel}
                            disabled={!cancelReason.trim()}
                        >
                            تأكيد الإلغاء
                        </Button>
                    </>
                }
            >
                <Field label="سبب الإلغاء" required>
                    <Textarea
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder="اذكر سبب إلغاء المهمة…"
                        autoFocus
                    />
                </Field>
            </Modal>

            <AssignDialog
                open={assignOpen}
                onClose={() => setAssignOpen(false)}
                taskId={task.id}
                current={task.technician?.id ?? null}
            />

            <ConfirmDialog
                open={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                onConfirm={async () => {
                    try {
                        await deleteTask.mutateAsync(task.id)
                        toast.success('تم حذف المهمة.')
                        navigate(path('/tasks'))
                    } catch (caught) {
                        toast.error(errorMessage(caught))
                    }
                }}
                title="حذف المهمة"
                message={`سيتم حذف المهمة ${task.code} نهائيًا. هل أنت متأكد؟`}
                confirmLabel="حذف"
                danger
                loading={deleteTask.isPending}
            />
        </>
    )
}

/* ── Pieces ──────────────────────────────────────────────── */

function Detail({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
    return (
        <div>
            <dt className="text-xs font-semibold text-navy-400">{label}</dt>
            <dd className={clsx('mt-0.5 font-semibold text-navy-900', mono && 'tabular text-sm')}>
                {value || '—'}
            </dd>
        </div>
    )
}

function ReportBlock({ title, report }: { title: string; report: TaskReport }) {
    const readings = Object.entries(report.readings).filter(([, value]) => value !== null)
    const condition = report.device_condition ? DEVICE_CONDITION[report.device_condition] : null

    return (
        <div className="rounded-2xl border border-navy-100 bg-navy-50/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                    <FileText className="size-4 text-navy-300" />
                    {title}
                </h3>
                <div className="flex items-center gap-2">
                    {condition && <Badge className={condition.chip}>{condition.label}</Badge>}
                    {report.batteries_need_replacement && (
                        <Badge className="bg-red-50 text-red-700 ring-1 ring-red-200">
                            <Battery className="size-3.5" />
                            استبدال بطاريات
                        </Badge>
                    )}
                </div>
            </div>

            {readings.length > 0 && (
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {readings.map(([key, value]) => {
                        const labels: Record<string, string> = {
                            input_voltage: 'جهد الدخول',
                            output_voltage: 'جهد الخروج',
                            frequency: 'التردد',
                            load_percent: 'التحميل %',
                            battery_voltage: 'جهد البطاريات',
                            temperature: 'الحرارة',
                            backup_minutes: 'Backup (د)',
                        }

                        return (
                            <div key={key} className="rounded-xl bg-white p-2.5 text-center">
                                <p className="tabular text-base font-extrabold text-navy-900">{value}</p>
                                <p className="mt-0.5 text-[10px] font-semibold text-navy-400">
                                    {labels[key] ?? key}
                                </p>
                            </div>
                        )
                    })}
                </div>
            )}

            <dl className="space-y-2 text-sm">
                {report.findings && <Narrative label="ما تم رصده" value={report.findings} />}
                {report.actions_taken && <Narrative label="ما تم تنفيذه" value={report.actions_taken} />}
                {report.recommendations && <Narrative label="التوصيات" value={report.recommendations} />}
            </dl>

            {report.parts_used.length > 0 && (
                <div className="mt-3">
                    <p className="mb-1.5 text-xs font-semibold text-navy-400">قطع الغيار</p>
                    <ul className="flex flex-wrap gap-1.5">
                        {report.parts_used.map((part, index) => (
                            <li
                                key={index}
                                className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 ring-1 ring-navy-200"
                            >
                                {part.name} × {part.qty ?? 1}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {report.signature_url && (
                <div className="mt-3 border-t border-navy-100 pt-3">
                    <p className="mb-1.5 text-xs font-semibold text-navy-400">
                        توقيع العميل{report.signed_by_name ? ` — ${report.signed_by_name}` : ''}
                    </p>
                    <img
                        src={report.signature_url}
                        alt="توقيع العميل"
                        className="h-20 rounded-lg border border-navy-200 bg-white object-contain p-1"
                    />
                </div>
            )}
        </div>
    )
}

function Narrative({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs font-semibold text-navy-400">{label}</dt>
            <dd className="mt-0.5 leading-relaxed text-navy-700">{value}</dd>
        </div>
    )
}

function AttachmentsSection({ task, canEdit }: { task: Task; canEdit: boolean }) {
    const toast = useToast()
    const upload = useUploadAttachments(task.id)
    const remove = useDeleteAttachment(task.id)
    const inputRef = useRef<HTMLInputElement>(null)
    const [kind, setKind] = useState<AttachmentKind>('before')

    const attachments = task.attachments ?? []
    const groups: Array<{ kind: AttachmentKind; label: string }> = [
        { kind: 'before', label: 'صور قبل العمل' },
        { kind: 'after', label: 'صور بعد العمل' },
        { kind: 'document', label: 'مستندات' },
    ]

    const handleFiles = async (files: FileList | null) => {
        if (!files?.length) return

        try {
            await upload.mutateAsync({ files: Array.from(files), kind })
            toast.success('تم رفع الملفات.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر رفع الملفات.'))
        } finally {
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    return (
        <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-navy-800">
                    <ImageIcon className="size-4 text-navy-300" />
                    الصور والمرفقات
                </h2>

                {canEdit && (
                    <div className="flex items-center gap-2">
                        <Select
                            value={kind}
                            onChange={(event) => setKind(event.target.value as AttachmentKind)}
                            className="w-32 py-1.5 text-xs"
                        >
                            <option value="before">قبل</option>
                            <option value="after">بعد</option>
                            <option value="document">مستند</option>
                        </Select>

                        <Button
                            variant="secondary"
                            icon={Camera}
                            loading={upload.isPending}
                            onClick={() => inputRef.current?.click()}
                            className="text-xs"
                        >
                            رفع
                        </Button>

                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            accept="image/*,application/pdf"
                            capture="environment"
                            className="hidden"
                            onChange={(event) => handleFiles(event.target.files)}
                        />
                    </div>
                )}
            </div>

            {attachments.length === 0 ? (
                <p className="rounded-xl bg-navy-50 px-4 py-6 text-center text-sm text-navy-400">
                    لا توجد مرفقات.
                </p>
            ) : (
                <div className="space-y-4">
                    {groups.map((group) => {
                        const items = attachments.filter((a) => a.kind === group.kind)

                        if (!items.length) return null

                        return (
                            <div key={group.kind}>
                                <p className="mb-2 text-xs font-bold text-navy-500">{group.label}</p>
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {items.map((attachment) => (
                                        <div key={attachment.id} className="group relative">
                                            <a
                                                href={attachment.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block aspect-square overflow-hidden rounded-xl border border-navy-200 bg-navy-50"
                                            >
                                                {attachment.mime?.startsWith('image/') ? (
                                                    <img
                                                        src={attachment.url}
                                                        alt={attachment.original_name}
                                                        loading="lazy"
                                                        className="size-full object-cover transition group-hover:scale-105"
                                                    />
                                                ) : (
                                                    <span className="grid size-full place-items-center text-navy-300">
                                                        <FileText className="size-7" />
                                                    </span>
                                                )}
                                            </a>

                                            {canEdit && (
                                                <button
                                                    onClick={() => remove.mutate(attachment.id)}
                                                    className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-lg bg-navy-950/70 text-white opacity-0 transition group-hover:opacity-100"
                                                    aria-label="حذف"
                                                >
                                                    <X className="size-3.5" />
                                                </button>
                                            )}

                                            <p className="mt-1 truncate text-[10px] text-navy-400">
                                                {formatBytes(attachment.size)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}

function AssignDialog({
    open,
    onClose,
    taskId,
    current,
}: {
    open: boolean
    onClose: () => void
    taskId: number
    current: number | null
}) {
    const toast = useToast()
    const { data: technicians } = useTechnicians()
    const assign = useAssignTask(taskId)
    const [selected, setSelected] = useState<string>(current ? String(current) : '')

    const handleSave = async () => {
        try {
            await assign.mutateAsync(selected ? Number(selected) : null)
            toast.success('تم تحديث الإسناد.')
            onClose()
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر إسناد المهمة.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="إسناد المهمة"
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        إلغاء
                    </Button>
                    <Button loading={assign.isPending} onClick={handleSave}>
                        حفظ
                    </Button>
                </>
            }
        >
            <Field label="الفني" hint="يظهر بجانب كل فني عدد مهامه المفتوحة حاليًا.">
                <Select value={selected} onChange={(event) => setSelected(event.target.value)}>
                    <option value="">— بدون إسناد —</option>
                    {technicians?.map((technician) => (
                        <option key={technician.id} value={technician.id}>
                            {technician.name} ({technician.open_tasks_count ?? 0} مفتوحة)
                        </option>
                    ))}
                </Select>
            </Field>
        </Modal>
    )
}

/** Best-effort GPS stamp; never blocks the status change. */
async function currentPosition(): Promise<{ lat?: number; lng?: number }> {
    if (!navigator.geolocation) return {}

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) =>
                resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => resolve({}),
            { timeout: 4000, maximumAge: 60_000 },
        )
    })
}

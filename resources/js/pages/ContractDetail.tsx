import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import {
    ArrowRight,
    Ban,
    CalendarClock,
    CalendarPlus,
    ChevronDown,
    CircleCheck,
    Coins,
    HardDrive,
    Lock,
    Pencil,
    PlayCircle,
    Printer,
    RefreshCw,
    Timer,
    Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ContractForm } from '@/components/ContractForm'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { CashBoxSelect, CollectorSelect } from '@/components/MoneyFields'
import { useToast } from '@/components/Toast'
import { Button, ErrorState, Field, Input, PageHeader, PageLoader, Select } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import {
    CONTRACT_STATUS,
    formatMoney,
    PAYMENT_METHOD,
    STATUS,
    VISIT_STATUS,
    expiryChip,
} from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { Attachments } from '@/components/Attachments'
import {
    useAssignPaymentWorkflow,
    useCollectContractPayment,
    useCreateWorkflowTemplate,
    useContract,
    useContractAction,
    useRenewContract,
    useUpdateWorkflowStep,
    useUploadFiles,
    useWorkflowTemplates,
} from '@/lib/queries'
import type { Contract, ContractPayment, WorkflowStep } from '@/types'
import type { ContractVisit } from '@/types'

export function ContractDetail() {
    const { id } = useParams<{ id: string }>()
    const { path } = useArea()
    const toast = useToast()

    const { data: contract, isLoading, isError, refetch } = useContract(id)
    const action = useContractAction(Number(id))

    const [editOpen, setEditOpen] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [renewing, setRenewing] = useState(false)

    if (isLoading) return <PageLoader />
    if (isError || !contract) {
        return <ErrorState message="تعذّر تحميل العقد." onRetry={() => void refetch()} />
    }

    const run = async (
        which: 'activate' | 'cancel' | 'materialise',
        success: string,
        failure: string,
    ) => {
        try {
            await action.mutateAsync(which)
            toast.success(success)
            setCancelling(false)
        } catch (caught) {
            toast.error(errorMessage(caught, failure))
        }
    }

    const visits = contract.visits ?? []
    const done = visits.filter((visit) => visit.status === 'done').length
    // Several branches turn each visit into a round of jobs — the plan below
    // reads as rounds, not single calls.
    const fansOut = (contract.branches_count ?? 0) > 1
    const heldVisits = new Set(contract.held_visit_sequences)
    // Arrears contracts go live before collection; legacy/upfront contracts still require the first payment.
    const canActivate = contract.collection_timing === 'arrears' || contract.first_payment_collected

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-2">
                <Link to={path('/contracts')} className="btn btn-ghost tap -mr-2">
                    <ArrowRight className="size-4" />
                    {tr('رجوع')}
                </Link>

                <div className="flex gap-2">
                    <Link
                        to={path(`/print/contracts/${contract.id}`)}
                        target="_blank"
                        className="btn-secondary text-xs"
                    >
                        <Printer className="size-4" />
                        {tr('طباعة')}
                    </Link>
                    <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
                        {tr('تعديل')}
                    </Button>
                </div>
            </div>

            <PageHeader
                title={contract.customer?.name ?? contract.label}
                subtitle={`${contract.code} · ${formatDate(contract.starts_on)} — ${formatDate(contract.ends_on)}`}
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className={clsx('badge', CONTRACT_STATUS[contract.effective_status].chip)}>
                    {contract.effective_status_label}
                </span>
                <span className={clsx(
                    'badge ring-1',
                    contract.includes_spare_parts
                        ? 'bg-amber-50 text-amber-800 ring-amber-200'
                        : 'bg-slate-50 text-slate-700 ring-slate-200',
                )}>
                    {contract.includes_spare_parts ? 'شامل قطع الغيار' : 'بدون قطع غيار'}
                </span>
                {contract.effective_status === 'active' && (
                    <span className={clsx('badge', expiryChip(contract.days_remaining))}>
                        {contract.days_remaining} يوم متبقٍ
                    </span>
                )}
                <span className="badge bg-navy-100 text-navy-600">
                    {contract.visits_per_year} زيارة سنويًا
                </span>
                {/* A round is a visit to every branch, so "12 a year" understates
                    the work by the number of sites. Say the real figure. */}
                {Boolean(contract.branches_count) && (
                    <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                        {contract.branches_count} فرع · {contract.jobs_per_year} زيارة في السنة
                    </span>
                )}
            </div>

            {/* ── Lifecycle ──────────────────────────────────── */}
            {contract.effective_status !== 'cancelled' && (
                <section className="card mb-5 p-4">
                    <h2 className="mb-3 text-sm font-bold text-navy-800">الإجراءات</h2>

                    <div className="flex flex-wrap gap-2">
                        {contract.status === 'draft' && (
                            <Button
                                icon={PlayCircle}
                                loading={action.isPending}
                                disabled={!canActivate}
                                title={!canActivate ? 'حصّل الدفعة الأولى أولًا' : undefined}
                                onClick={() =>
                                    void run('activate', 'تم تفعيل العقد وجدولة زياراته.', 'تعذّر تفعيل العقد.')
                                }
                            >
                                {tr('تفعيل وجدولة الزيارات')}
                            </Button>
                        )}

                        {contract.status === 'active' && (
                            <Button
                                variant="secondary"
                                icon={RefreshCw}
                                loading={action.isPending}
                                onClick={() =>
                                    void run('materialise', 'تم تحديث أوامر الشغل المستحقة.', 'تعذّر التحديث.')
                                }
                            >
                                {tr('توليد أوامر الشغل المستحقة')}
                            </Button>
                        )}

                        {/* Offered while it is running or once it has run out —
                            a renewal is sold before the gap, not after it. */}
                        {['active', 'expired'].includes(contract.effective_status) &&
                            !contract.renewal_code && (
                                <Button
                                    variant="secondary"
                                    icon={CalendarPlus}
                                    onClick={() => setRenewing(true)}
                                >
                                    {tr('تجديد العقد')}
                                </Button>
                            )}

                        <Button
                            variant="secondary"
                            icon={Ban}
                            className="text-red-600"
                            onClick={() => setCancelling(true)}
                        >
                            {tr('إلغاء العقد')}
                        </Button>
                    </div>

                            {contract.status === 'draft' && (
                        <p className="mt-3 text-xs text-navy-400">
                            {canActivate
                                ? contract.collection_timing === 'arrears'
                                    ? 'هذا عقد مؤخر: يُفعّل ويُجدول أولًا، ثم يُفتح التحصيل بعد اكتمال الخدمة والإجراءات.'
                                    : 'الزيارات تُجدول عند التفعيل، ويصدر أمر شغل لكل زيارة قبل موعدها بمدة قصيرة.'
                                : 'لتفعيل العقد لا بد من تحصيل الدفعة الأولى من جدول الدفعات بالأسفل.'}
                        </p>
                    )}
                </section>
            )}

            <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                    {/* ── Payment schedule ───────────────────── */}
                    {Boolean(contract.payments?.length) && <PaymentSchedule contract={contract} />}

                    {/* ── Visit plan ─────────────────────────── */}
                    <section className="card p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-bold text-navy-900">
                                {fansOut ? 'جولات الصيانة' : 'خطة الزيارات'}
                            </h2>
                            {visits.length > 0 && (
                                <span className="text-xs font-semibold text-navy-400">
                                    {done} من {visits.length} {fansOut ? 'جولة تمت' : 'تمت'}
                                </span>
                            )}
                        </div>

                        {visits.length === 0 ? (
                            <p className="py-6 text-center text-sm text-navy-400">
                                {tr('لم تُجدول زيارات بعد — فعّل العقد لتوليد خطة السنة.')}
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {visits.map((visit) => (
                                    <VisitRow
                                        key={visit.id}
                                        visit={visit}
                                        taskHref={path('/tasks')}
                                        held={heldVisits.has(visit.sequence)}
                                    />
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* ── Covered devices ────────────────────── */}
                    <section className="card p-5">
                        <h2 className="mb-4 text-sm font-bold text-navy-900">الأجهزة المغطاة</h2>

                        {!contract.assets?.length ? (
                            <p className="text-sm text-navy-500">
                                {tr('العقد يغطي كل أجهزة العميل، بما فيها ما يُضاف لاحقًا.')}
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {contract.assets.map((asset) => {
                                    const specs = [
                                        asset.serial,
                                        asset.capacity,
                                        [asset.brand, asset.model].filter(Boolean).join(' '),
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')

                                    return (
                                        <li key={asset.id}>
                                            <Link
                                                to={path(`/assets/${asset.id}`)}
                                                className="tap flex items-center gap-3 rounded-xl bg-navy-50 p-3 transition hover:bg-navy-100"
                                            >
                                                <HardDrive className="size-4 shrink-0 text-navy-400" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-semibold text-navy-800">
                                                        {asset.label}
                                                    </span>
                                                    {specs && (
                                                        <span className="tabular block truncate text-[11px] text-navy-400">
                                                            {specs}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="tabular shrink-0 text-[11px] text-navy-400">
                                                    {asset.code}
                                                </span>
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </section>
                </div>

                {/* ── Terms ──────────────────────────────────── */}
                <div className="space-y-5">
                    <section className="card p-5">
                        <h2 className="mb-4 text-sm font-bold text-navy-900">الالتزام الزمني</h2>

                        <dl className="space-y-4">
                            <Term
                                icon={Timer}
                                label="زمن الاستجابة"
                                value={
                                    contract.sla_response_hours
                                        ? `${contract.sla_response_hours} ساعة`
                                        : null
                                }
                            />
                            <Term
                                icon={CircleCheck}
                                label="زمن الإنجاز"
                                value={
                                    contract.sla_resolution_hours
                                        ? `${contract.sla_resolution_hours} ساعة`
                                        : null
                                }
                            />
                            <Term
                                icon={Wallet}
                                label="قيمة العقد"
                                value={contract.value ? `${contract.value} ${contract.currency}` : null}
                            />
                        </dl>

                        <p className="mt-4 border-t border-navy-100 pt-3 text-[11px] leading-relaxed text-navy-400">
                            {tr('المدة تُحسب بالساعات المتواصلة، بلا استثناء للعطلات أو خارج الدوام.')}
                        </p>
                    </section>

                    {contract.notes && (
                        <section className="card p-5">
                            <h2 className="mb-2 text-sm font-bold text-navy-900">ملاحظات</h2>
                            <p className="text-sm leading-relaxed whitespace-pre-line text-navy-600">
                                {contract.notes}
                            </p>
                        </section>
                    )}
                </div>
            </div>

            <div className="mt-5">
                <Attachments type="contracts" id={contract.id} label="ملف العقد والمستندات" />
            </div>

            {editOpen && (
                <ContractForm
                    open={editOpen}
                    onClose={() => setEditOpen(false)}
                    contract={contract}
                />
            )}

            {renewing && (
                <RenewDialog contract={contract} onClose={() => setRenewing(false)} />
            )}

            <ConfirmDialog
                open={cancelling}
                onClose={() => setCancelling(false)}
                onConfirm={() =>
                    void run('cancel', 'تم إلغاء العقد.', 'تعذّر إلغاء العقد.')
                }
                title="إلغاء العقد"
                message="ستُلغى الزيارات التي لم يبدأ العمل فيها بعد. الزيارات المسندة أو المنفَّذة تبقى كما هي في السجل."
                confirmLabel="إلغاء العقد"
                loading={action.isPending}
                danger
            />
        </>
    )
}

function VisitRow({
    visit,
    taskHref,
    held,
}: {
    visit: ContractVisit
    taskHref: string
    held?: boolean
}) {
    const meta = VISIT_STATUS[visit.status]
    const jobs = visit.jobs ?? []
    // One round, one job per covered branch. With several sites the round is a
    // container, not a visit — so it opens rather than jumping to whichever job
    // happened to be cut first.
    const fansOut = jobs.length > 1
    const [open, setOpen] = useState(false)

    const body = (
        <>
            <span className="tabular grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-xs font-bold text-navy-500 ring-1 ring-navy-200">
                {visit.sequence}
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-navy-800">
                    {formatDate(visit.planned_for)}
                </span>
                {fansOut ? (
                    <span className="block truncate text-[11px] text-navy-400">
                        {visit.jobs_done} من {jobs.length} فرع تمت
                    </span>
                ) : (
                    visit.task && (
                        <span className="tabular block truncate text-[11px] text-navy-400">
                            {visit.task.code}
                            {visit.task.technicians?.length ? ` · ${visit.task.technicians.map(t => t.name).join('، ')}` : ''}
                        </span>
                    )
                )}
            </span>

            {/* Held: this visit carries an instalment that has not been collected,
                so no work order is cut for it until the money is in. */}
            {held && !visit.task_id && (
                <span className="badge shrink-0 bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                    {tr('محجوزة — بانتظار التحصيل')}
                </span>
            )}

            {/* A locked visit survives any change to the contract — worth saying
                so before a manager tries to reschedule the term. */}
            {visit.is_locked && <Lock className="size-3.5 shrink-0 text-navy-300" />}

            <span className={clsx('badge shrink-0', meta.chip)}>{meta.label}</span>
        </>
    )

    if (fansOut) {
        return (
            <li className="overflow-hidden rounded-xl bg-navy-50">
                <button
                    type="button"
                    onClick={() => setOpen((was) => !was)}
                    aria-expanded={open}
                    className="tap flex w-full items-center gap-3 p-3 text-start transition hover:bg-navy-100"
                >
                    {body}
                    <ChevronDown
                        className={clsx(
                            'size-4 shrink-0 text-navy-400 transition',
                            open && 'rotate-180',
                        )}
                    />
                </button>

                {open && (
                    <ul className="space-y-1.5 border-t border-navy-100 p-2">
                        {jobs.map((job) => (
                            <li key={job.id}>
                                <Link
                                    to={`${taskHref}/${job.id}`}
                                    className="tap flex items-center gap-2 rounded-lg bg-surface p-2.5 transition hover:bg-brand-50"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-bold text-navy-800">
                                            {job.branch ?? 'الموقع الرئيسي'}
                                        </span>
                                        <span className="tabular block truncate text-[11px] text-navy-400">
                                            {job.code}
                                            {job.technician && ` · ${job.technician}`}
                                        </span>
                                    </span>
                                    <span
                                        className={clsx(
                                            'badge shrink-0',
                                            STATUS[job.status].chip,
                                        )}
                                    >
                                        {job.status_label}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </li>
        )
    }

    if (visit.task_id) {
        return (
            <li>
                <Link
                    to={`${taskHref}/${visit.task_id}`}
                    className="tap flex items-center gap-3 rounded-xl bg-navy-50 p-3 transition hover:bg-navy-100"
                >
                    {body}
                </Link>
            </li>
        )
    }

    return (
        <li className="flex items-center gap-3 rounded-xl bg-navy-50 p-3">
            <CalendarClock className="hidden size-4 text-navy-300" />
            {body}
        </li>
    )
}

function Term({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Timer
    label: string
    value: string | null
}) {
    return (
        <div className="flex items-start gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-navy-300" />
            <div className="min-w-0">
                <dt className="text-[11px] font-semibold text-navy-400">{label}</dt>
                <dd className="text-sm font-bold text-navy-800">{value ?? '—'}</dd>
            </div>
        </div>
    )
}

/* ── Payment schedule ────────────────────────────────────── */

/** The instalment plan: what is due when, and the button to collect each. */
function PaymentSchedule({ contract }: { contract: Contract }) {
    const payments = contract.payments ?? []
    const years = Array.from(new Set(payments.map((payment) => payment.service_year ?? 1))).sort(
        (a, b) => a - b,
    )
    const [selectedYear, setSelectedYear] = useState(years[0] ?? 1)
    const activeYear = years.includes(selectedYear) ? selectedYear : (years[0] ?? 1)
    const visiblePayments = payments.filter((payment) => (payment.service_year ?? 1) === activeYear)
    const [collecting, setCollecting] = useState<ContractPayment | null>(null)
    const [workflowPaymentId, setWorkflowPaymentId] = useState<number | null>(null)

    const canCollect = (payment: ContractPayment) => {
        if (payment.status === 'collected') return false
        if (contract.collection_timing !== 'arrears') return true
        const end = payment.service_to_visit_sequence
        if (!end || !contract.visits) return false
        const covered = contract.visits.filter(
            (visit) => visit.sequence >= (payment.service_from_visit_sequence ?? 1) && visit.sequence <= end,
        )
        return covered.length > 0 && covered.every((visit) => visit.status === 'done')
    }

    return (
        <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-bold text-navy-900">جدول الدفعات</h2>
                    <p className="mt-1 text-[11px] text-navy-400">
                        {contract.collection_timing_label} · {contract.billing_frequency_label} — 4 دفعات سنويًا عند الربع سنوي
                    </p>
                </div>
                <span className="text-xs font-semibold text-navy-400">
                    حُصّل{' '}
                    <span className="tabular text-navy-700">{formatMoney(contract.collected_total ?? 0)}</span>{' '}
                    من {formatMoney(contract.payments_total ?? 0)}
                </span>
            </div>

            {years.length > 1 && (
                <div className="mb-4 flex flex-wrap gap-2 border-b border-navy-100 pb-3">
                    {years.map((year) => (
                        <button
                            key={year}
                            type="button"
                            onClick={() => setSelectedYear(year)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                year === activeYear
                                    ? 'bg-brand-600 text-white shadow-sm'
                                    : 'bg-navy-50 text-navy-500 hover:bg-navy-100'
                            }`}
                        >
                            السنة {year}
                        </button>
                    ))}
                </div>
            )}

            <div className="mb-3 flex items-center justify-between text-[11px] text-navy-400">
                <span>دفعات السنة {activeYear}</span>
                <span className="tabular">{visiblePayments.length} دفعات</span>
            </div>

            <ul className="space-y-2">
                {visiblePayments.map((payment) => {
                    const ready = canCollect(payment)
                    const when = payment.service_label || (payment.is_upfront ? 'مع اعتماد العقد' : `بعد الزيارة ${payment.due_visit_sequence}`)

                    return (
                        <li key={payment.id} className="flex items-center gap-3 rounded-xl bg-navy-50 p-3">
                            <span className="tabular grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-xs font-bold text-navy-500 ring-1 ring-navy-200">
                                {payment.period_number ?? payment.sequence}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="tabular text-sm font-bold text-navy-800">{formatMoney(payment.amount)}</p>
                                <p className="text-[11px] text-navy-400">
                                    {when}
                                    {payment.invoice_code && ` · ${payment.invoice_code}`}
                                </p>
                                {payment.service_stats && (
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-navy-500">
                                        <span>{payment.service_stats.visits_completed}/{payment.service_stats.visits_total} زيارة مكتملة</span>
                                        <span>{payment.service_stats.branch_tasks_completed}/{payment.service_stats.branch_tasks_total} مهمة فروع</span>
                                        <span>{payment.service_stats.branches.length} فروع</span>
                                        {Object.entries(payment.service_stats.visits_statuses).map(([status, count]) => (
                                            <span key={status}>{visitStatusLabel(status)}: {count}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {payment.status === 'collected' ? (
                                <span className="badge shrink-0 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                    <CircleCheck className="size-3" />
                                    {tr('محصّلة')}
                                </span>
                            ) : (
                                <div className="flex shrink-0 items-center gap-2">
                                    {!ready && contract.collection_timing === 'arrears' && (
                                        <span className="text-[10px] font-semibold text-amber-700">بعد اكتمال الزيارات</span>
                                    )}
                                    <Button icon={Coins} className="text-xs" disabled={!ready} onClick={() => setCollecting(payment)}>
                                        {tr('تحصيل')}
                                    </Button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost px-2 text-[11px]"
                                        onClick={() => setWorkflowPaymentId((current) => current === payment.id ? null : payment.id)}
                                    >
                                        {payment.workflow ? `إجراءات: ${payment.workflow.status === 'completed' ? 'مكتملة' : 'قيد التنفيذ'}` : 'اختيار الإجراءات'}
                                    </button>
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>

            {workflowPaymentId && (
                <PaymentWorkflowPanel
                    contract={contract}
                    contractId={contract.id}
                    payment={payments.find((payment) => payment.id === workflowPaymentId) ?? null}
                    onClose={() => setWorkflowPaymentId(null)}
                />
            )}

            {collecting && (
                <CollectDialog contractId={contract.id} payment={collecting} onClose={() => setCollecting(null)} />
            )}
        </section>
    )
}

function PaymentWorkflowPanel({
    contract,
    contractId,
    payment,
    onClose,
}: {
    contract: Contract
    contractId: number
    payment: ContractPayment | null
    onClose: () => void
}) {
    const toast = useToast()
    const { data: templates = [], isLoading } = useWorkflowTemplates()
    const assign = useAssignPaymentWorkflow(contractId)
    const createTemplate = useCreateWorkflowTemplate()
    const [templateId, setTemplateId] = useState<number | ''>('')
    const [creatingTemplate, setCreatingTemplate] = useState(false)
    const [newTemplateName, setNewTemplateName] = useState('')
    const [newSteps, setNewSteps] = useState(['مراجعة المستندات'])

    useEffect(() => {
        setTemplateId(payment?.workflow?.template?.id ?? '')
    }, [payment?.id, payment?.workflow?.template?.id])

    if (!payment) return null

    const chooseTemplate = async (value: string) => {
        const id = Number(value)
        setTemplateId(id || '')
        if (!id) return

        try {
            await assign.mutateAsync({ paymentId: payment.id, workflowTemplateId: id })
            toast.success('تم ربط Workflow بالدفعة.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر ربط Workflow بالدفعة.'))
        }
    }

    return (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-bold text-navy-900">إجراءات الدفعة</h3>
                    <p className="text-[11px] text-navy-500">
                        لا يفتح التحصيل المؤخر إلا بعد اكتمال كل الخطوات المطلوبة.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" className="btn btn-ghost text-xs" onClick={() => printPaymentReport(contract, payment)}>
                        تقرير الدفعة
                    </button>
                    <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>إغلاق</button>
                </div>
            </div>

            <label className="mb-4 block">
                <span className="mb-1 block text-xs font-bold text-navy-700">قالب الإجراءات</span>
                <select
                    className="input w-full"
                    value={templateId}
                    disabled={isLoading || assign.isPending || payment.status === 'collected'}
                    onChange={(event) => void chooseTemplate(event.target.value)}
                >
                    <option value="">اختر Workflow لهذه الدفعة</option>
                    {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                </select>
            </label>
            <button type="button" className="btn btn-secondary mb-4 text-xs" onClick={() => setCreatingTemplate((value) => !value)}>
                {creatingTemplate ? 'إلغاء إضافة قالب' : 'إضافة Workflow جديد'}
            </button>
            {creatingTemplate && (
                <form
                    className="mb-4 space-y-2 rounded-lg bg-white p-3 ring-1 ring-brand-100"
                    onSubmit={async (event) => {
                        event.preventDefault()
                        if (!newTemplateName.trim() || newSteps.some((step) => !step.trim())) return
                        try {
                            const created = await createTemplate.mutateAsync({
                                name: newTemplateName.trim(),
                                steps: newSteps.map((name, index) => ({ name: name.trim(), sort_order: index, is_required: true })),
                            })
                            setNewTemplateName('')
                            setNewSteps(['مراجعة المستندات'])
                            setCreatingTemplate(false)
                            await chooseTemplate(String(created.id))
                            toast.success('تم إنشاء Workflow وربطه بالدفعة.')
                        } catch (caught) {
                            toast.error(errorMessage(caught, 'تعذّر إنشاء Workflow.'))
                        }
                    }}
                >
                    <input className="input w-full text-xs" placeholder="اسم Workflow، مثل إجراءات كود 1" value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} />
                    {newSteps.map((step, index) => (
                        <div key={`${index}-${step}`} className="flex gap-2">
                            <input className="input min-w-0 flex-1 text-xs" placeholder={`الخطوة ${index + 1}`} value={step} onChange={(event) => setNewSteps((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
                            {newSteps.length > 1 && <button type="button" className="btn btn-ghost text-xs" onClick={() => setNewSteps((items) => items.filter((_, itemIndex) => itemIndex !== index))}>حذف</button>}
                        </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-ghost text-xs" onClick={() => setNewSteps((items) => [...items, ''])}>إضافة خطوة</button>
                        <button type="submit" className="btn-primary text-xs" disabled={createTemplate.isPending}>حفظ وربط القالب</button>
                    </div>
                </form>
            )}

            {!payment.workflow ? (
                <p className="rounded-lg bg-white p-3 text-xs text-amber-700 ring-1 ring-amber-200">
                    لم يتم اختيار Workflow بعد، لذلك سيظل التحصيل محجوبًا.
                </p>
            ) : (
                <div className="space-y-2">
                    {payment.workflow.steps.map((step) => (
                        <WorkflowStepRow key={step.id} contractId={contractId} step={step} disabled={payment.status === 'collected'} />
                    ))}
                </div>
            )}
        </div>
    )
}

function visitStatusLabel(status: string) {
    return ({
        planned: 'مخططة',
        scheduled: 'مجدولة',
        done: 'مكتملة',
        skipped: 'متجاوزة',
        cancelled: 'ملغاة',
    } as Record<string, string>)[status] ?? status
}

function printPaymentReport(contract: Contract, payment: ContractPayment) {
    const visits = contract?.visits?.filter((visit) => payment.service_from_visit_sequence !== null
        && payment.service_to_visit_sequence !== null
        && visit.sequence >= payment.service_from_visit_sequence
        && visit.sequence <= payment.service_to_visit_sequence) ?? []
    const escapeHtml = (value: unknown) => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
    const rows = visits.flatMap((visit) => (visit.jobs?.length ? visit.jobs : [{
        id: visit.id,
        code: '—',
        status: visit.status,
        status_label: visit.status_label,
        branch: '—',
        technician: '—',
    }]).map((job) => `
        <tr>
            <td>${escapeHtml(visit.sequence)}</td>
            <td>${escapeHtml(visit.planned_for || '—')}</td>
            <td>${escapeHtml(job.branch || '—')}</td>
            <td>${escapeHtml(job.code)}</td>
            <td>${escapeHtml(job.status_label)}</td>
            <td>${escapeHtml(job.technician || '—')}</td>
        </tr>`)).join('')
    const target = window.open('', '_blank', 'noopener,noreferrer')
    if (!target) return
    target.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير الدفعة ${escapeHtml(payment.sequence)}</title><style>
        @page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#172033;margin:0}h1{font-size:20px;margin:0 0 8px}p{font-size:12px;margin:4px 0}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.box{border:1px solid #d8dee9;border-radius:6px;padding:8px;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:11px}th{background:#173b65;color:#fff}th,td{border:1px solid #cbd5e1;padding:7px;text-align:right}tfoot{font-weight:bold}@media print{.print-hidden{display:none}}
    </style></head><body><h1>تقرير الدفعة رقم ${escapeHtml(payment.sequence)}</h1><p>العقد: ${escapeHtml(contract.code)} — ${escapeHtml(contract.label)} | نطاق الخدمة: ${escapeHtml(payment.service_label)}</p><div class="meta"><div class="box">حالة الدفعة: ${escapeHtml(payment.status_label)}</div><div class="box">المبلغ: ${escapeHtml(payment.amount)}</div><div class="box">الزيارات: ${visits.length}</div><div class="box">Workflow: ${escapeHtml(payment.workflow?.template?.name || 'غير محدد')}</div></div><table><thead><tr><th>الزيارة</th><th>التاريخ</th><th>الفرع</th><th>أمر الشغل</th><th>الحالة</th><th>الفني</th></tr></thead><tbody>${rows || '<tr><td colspan="6">لا توجد زيارات ضمن نطاق هذه الدفعة.</td></tr>'}</tbody></table></body></html>`)
    target.document.close()
    target.focus()
    window.setTimeout(() => {
        target.print()
        target.close()
    }, 250)
}

function WorkflowStepRow({
    contractId,
    step,
    disabled,
}: {
    contractId: number
    step: WorkflowStep
    disabled: boolean
}) {
    const toast = useToast()
    const update = useUpdateWorkflowStep(contractId)
    const upload = useUploadFiles('workflow-steps', step.id)
    const [notes, setNotes] = useState(step.notes ?? '')

    useEffect(() => setNotes(step.notes ?? ''), [step.id, step.notes])

    const save = async (completed: boolean) => {
        try {
            await update.mutateAsync({ stepId: step.id, completed, notes })
            toast.success(completed ? 'تم إكمال الخطوة.' : 'تم إعادة فتح الخطوة.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تحديث الخطوة.'))
        }
    }

    const attach = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? [])
        if (!files.length) return
        try {
            await upload.mutateAsync({ files })
            toast.success('تم رفع المرفق.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر رفع المرفق.'))
        } finally {
            event.target.value = ''
        }
    }

    return (
        <div className="rounded-lg bg-white p-3 ring-1 ring-navy-100">
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    className="mt-1 size-4 accent-brand-600"
                    checked={step.completed}
                    disabled={disabled || update.isPending}
                    onChange={(event) => void save(event.target.checked)}
                />
                <div className="min-w-0 flex-1">
                    <p className={clsx('text-xs font-bold', step.completed ? 'text-emerald-700 line-through' : 'text-navy-800')}>
                        {step.name}{step.is_required ? ' *' : ''}
                    </p>
                    {step.description && <p className="mt-1 text-[11px] text-navy-400">{step.description}</p>}
                    <textarea
                        className="input mt-2 min-h-16 w-full text-xs"
                        value={notes}
                        disabled={disabled || update.isPending}
                        placeholder="ملاحظات الخطوة"
                        onChange={(event) => setNotes(event.target.value)}
                        onBlur={() => {
                            if (notes !== (step.notes ?? '')) void save(step.completed)
                        }}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="btn btn-ghost cursor-pointer text-[11px]">
                            رفع ملف
                            <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,.heic,.pdf" disabled={disabled || upload.isPending} onChange={(event) => void attach(event)} />
                        </label>
                        {upload.isPending && <span className="text-[11px] text-navy-400">جارٍ الرفع...</span>}
                        {step.attachments.map((attachment) => (
                            <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-brand-700 hover:underline">
                                {attachment.original_name}
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

function CollectDialog({
    contractId,
    payment,
    onClose,
}: {
    contractId: number
    payment: ContractPayment
    onClose: () => void
}) {
    const toast = useToast()
    const collect = useCollectContractPayment(contractId)
    const [boxId, setBoxId] = useState('')
    const [method, setMethod] = useState('cash')
    const [collector, setCollector] = useState('')
    const [reference, setReference] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title={`تحصيل الدفعة ${payment.sequence}`}
            description={`${formatMoney(payment.amount)} — ${payment.service_label || (payment.is_upfront ? 'دفعة الاعتماد' : `بعد الزيارة ${payment.due_visit_sequence}`)}.`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={collect.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        icon={Coins}
                        loading={collect.isPending}
                        onClick={async () => {
                            try {
                                await collect.mutateAsync({
                                    paymentId: payment.id,
                                    cash_box_id: boxId ? Number(boxId) : null,
                                    method,
                                    collected_by_user_id: collector ? Number(collector) : null,
                                    reference: reference || null,
                                })
                                toast.success('تم تحصيل الدفعة.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر التحصيل.'))
                            }
                        }}
                    >
                        {tr('تأكيد التحصيل')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <CashBoxSelect
                    value={boxId}
                    onChange={setBoxId}
                    placeholder="الخزينة الرئيسية"
                    hint="نقدًا تذهب لخزينة، وتحويلًا تذهب للحساب البنكي الذي وصلت إليه."
                />

                <Field label="طريقة الدفع">
                    <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                        {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </Select>
                </Field>

                <CollectorSelect value={collector} onChange={setCollector} />

                <Field label="مرجع (اختياري)">
                    <Input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        dir="ltr"
                        className="text-left"
                        placeholder="رقم الشيك أو التحويل"
                    />
                </Field>

                <p className="rounded-xl bg-navy-50 p-3 text-[11px] text-navy-500">
                    {tr('يصدر سند قبض وفاتورة بقيمة الدفعة. في التحصيل المؤخر لا يظهر الزر إلا بعد اكتمال نطاق الخدمة والإجراءات المطلوبة.')}
                </p>
            </div>
        </Modal>
    )
}

/* ── Renewing ────────────────────────────────────────────── */

/**
 * Sell another term.
 *
 * The new contract starts the day after this one ends, so a renewal signed
 * early leaves no gap in cover — and it arrives as a draft, because someone
 * still has to agree the term before its visits are planned.
 */
function RenewDialog({ contract, onClose }: { contract: Contract; onClose: () => void }) {
    const toast = useToast()
    const navigate = useNavigate()
    const { path } = useArea()
    const renew = useRenewContract(contract.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [months, setMonths] = useState('12')
    const [value, setValue] = useState(contract.value ?? '')
    const [visits, setVisits] = useState(String(contract.visits_per_year))

    return (
        <Modal
            open
            onClose={onClose}
            title={`تجديد العقد ${contract.code}`}
            description={`العقد الحالي ينتهي في ${formatDate(contract.ends_on)} — التجديد يبدأ في اليوم التالي.`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={renew.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={renew.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                const created = await renew.mutateAsync({
                                    months: Number(months),
                                    value: value === '' ? null : Number(value),
                                    visits_per_year: Number(visits),
                                })
                                toast.success(`تم إنشاء العقد ${created.code} كمسودة.`)
                                onClose()
                                navigate(path(`/contracts/${created.id}`))
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تجديد العقد.'))
                            }
                        }}
                    >
                        {tr('تجديد')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="المدة (شهور)" required error={errors.months}>
                    <Input
                        type="number"
                        min={1}
                        max={120}
                        value={months}
                        onChange={(e) => setMonths(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="القيمة" error={errors.value}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="زيارات في السنة" error={errors.visits_per_year}>
                        <Input
                            type="number"
                            min={1}
                            max={52}
                            value={visits}
                            onChange={(e) => setVisits(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <p className="rounded-xl bg-navy-50 p-3 text-[11px] text-navy-500">
                    {tr('نفس الأجهزة تنتقل للعقد الجديد، والعقد الحالي يبقى كما هو سجلًا لما تم تنفيذه.')}
                </p>
            </div>
        </Modal>
    )
}

import clsx from 'clsx'
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
import { useState } from 'react'
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
    useCollectContractPayment,
    useContract,
    useContractAction,
    useRenewContract,
} from '@/lib/queries'
import type { Contract, ContractPayment } from '@/types'
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
    // A contract with a value cannot go live until its first instalment is in.
    const canActivate = contract.first_payment_collected

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-2">
                <Link to={path('/contracts')} className="btn btn-ghost tap -mr-2">
                    <ArrowRight className="size-4" />
                    رجوع
                </Link>

                <div className="flex gap-2">
                    <Link
                        to={path(`/print/contracts/${contract.id}`)}
                        target="_blank"
                        className="btn-secondary text-xs"
                    >
                        <Printer className="size-4" />
                        طباعة
                    </Link>
                    <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
                        تعديل
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
                                تفعيل وجدولة الزيارات
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
                                توليد أوامر الشغل المستحقة
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
                                    تجديد العقد
                                </Button>
                            )}

                        <Button
                            variant="secondary"
                            icon={Ban}
                            className="text-red-600"
                            onClick={() => setCancelling(true)}
                        >
                            إلغاء العقد
                        </Button>
                    </div>

                    {contract.status === 'draft' && (
                        <p className="mt-3 text-xs text-navy-400">
                            {canActivate
                                ? 'الزيارات تُجدول عند التفعيل، ويصدر أمر شغل لكل زيارة قبل موعدها بمدة قصيرة.'
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
                                لم تُجدول زيارات بعد — فعّل العقد لتوليد خطة السنة.
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
                                العقد يغطي كل أجهزة العميل، بما فيها ما يُضاف لاحقًا.
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
                            المدة تُحسب بالساعات المتواصلة، بلا استثناء للعطلات أو خارج الدوام.
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
                            {visit.task.technician && ` · ${visit.task.technician.name}`}
                        </span>
                    )
                )}
            </span>

            {/* Held: this visit carries an instalment that has not been collected,
                so no work order is cut for it until the money is in. */}
            {held && !visit.task_id && (
                <span className="badge shrink-0 bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                    محجوزة — بانتظار التحصيل
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
    const [collecting, setCollecting] = useState<ContractPayment | null>(null)

    return (
        <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-navy-900">جدول الدفعات</h2>
                <span className="text-xs font-semibold text-navy-400">
                    {contract.billing_frequency_label} · حُصّل{' '}
                    <span className="tabular text-navy-700">
                        {formatMoney(contract.collected_total ?? 0)}
                    </span>{' '}
                    من {formatMoney(contract.payments_total ?? 0)}
                </span>
            </div>

            <ul className="space-y-2">
                {payments.map((payment) => {
                    const when = payment.is_upfront
                        ? 'مع اعتماد العقد'
                        : `عند الزيارة ${payment.due_visit_sequence}`

                    return (
                        <li
                            key={payment.id}
                            className="flex items-center gap-3 rounded-xl bg-navy-50 p-3"
                        >
                            <span className="tabular grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-xs font-bold text-navy-500 ring-1 ring-navy-200">
                                {payment.sequence}
                            </span>

                            <div className="min-w-0 flex-1">
                                <p className="tabular text-sm font-bold text-navy-800">
                                    {formatMoney(payment.amount)}
                                </p>
                                <p className="text-[11px] text-navy-400">
                                    {when}
                                    {payment.invoice_code && ` · ${payment.invoice_code}`}
                                </p>
                            </div>

                            {payment.status === 'collected' ? (
                                <span className="badge shrink-0 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                    <CircleCheck className="size-3" />
                                    محصّلة
                                </span>
                            ) : (
                                <Button
                                    icon={Coins}
                                    className="shrink-0 text-xs"
                                    onClick={() => setCollecting(payment)}
                                >
                                    تحصيل
                                </Button>
                            )}
                        </li>
                    )
                })}
            </ul>

            {collecting && (
                <CollectDialog
                    contractId={contract.id}
                    payment={collecting}
                    onClose={() => setCollecting(null)}
                />
            )}
        </section>
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
            description={`${formatMoney(payment.amount)} — ${
                payment.is_upfront ? 'دفعة الاعتماد' : `عند الزيارة ${payment.due_visit_sequence}`
            }.`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={collect.isPending}>
                        إلغاء
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
                        تأكيد التحصيل
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
                    يصدر سند قبض وفاتورة بقيمة الدفعة، وإذا كانت مرتبطة بزيارة يُرفع أمر شغلها للفنيين.
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
                        إلغاء
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
                        تجديد
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
                    نفس الأجهزة تنتقل للعقد الجديد، والعقد الحالي يبقى كما هو سجلًا لما تم تنفيذه.
                </p>
            </div>
        </Modal>
    )
}

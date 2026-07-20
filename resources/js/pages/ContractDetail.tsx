import clsx from 'clsx'
import {
    ArrowRight,
    Ban,
    CalendarClock,
    CircleCheck,
    HardDrive,
    Lock,
    Pencil,
    PlayCircle,
    RefreshCw,
    Timer,
    Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContractForm } from '@/components/ContractForm'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, ErrorState, PageHeader, PageLoader } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { CONTRACT_STATUS, VISIT_STATUS, expiryChip } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useContract, useContractAction } from '@/lib/queries'
import type { ContractVisit } from '@/types'

export function ContractDetail() {
    const { id } = useParams<{ id: string }>()
    const { path } = useArea()
    const toast = useToast()

    const { data: contract, isLoading, isError, refetch } = useContract(id)
    const action = useContractAction(Number(id))

    const [editOpen, setEditOpen] = useState(false)
    const [cancelling, setCancelling] = useState(false)

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

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-2">
                <Link to={path('/contracts')} className="btn btn-ghost tap -mr-2">
                    <ArrowRight className="size-4" />
                    رجوع
                </Link>

                <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
                    تعديل
                </Button>
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
                            الزيارات تُجدول عند التفعيل، ويصدر أمر شغل لكل زيارة قبل موعدها بمدة قصيرة.
                        </p>
                    )}
                </section>
            )}

            <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                    {/* ── Visit plan ─────────────────────────── */}
                    <section className="card p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-bold text-navy-900">خطة الزيارات</h2>
                            {visits.length > 0 && (
                                <span className="text-xs font-semibold text-navy-400">
                                    {done} من {visits.length} تمت
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
                                    <VisitRow key={visit.id} visit={visit} taskHref={path('/tasks')} />
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
                                {contract.assets.map((asset) => (
                                    <li key={asset.id}>
                                        <Link
                                            to={path(`/assets/${asset.id}`)}
                                            className="tap flex items-center gap-3 rounded-xl bg-navy-50 p-3 transition hover:bg-navy-100"
                                        >
                                            <HardDrive className="size-4 shrink-0 text-navy-400" />
                                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy-800">
                                                {asset.label}
                                            </span>
                                            <span className="tabular shrink-0 text-[11px] text-navy-400">
                                                {asset.code}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
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

            {editOpen && (
                <ContractForm
                    open={editOpen}
                    onClose={() => setEditOpen(false)}
                    contract={contract}
                />
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

function VisitRow({ visit, taskHref }: { visit: ContractVisit; taskHref: string }) {
    const meta = VISIT_STATUS[visit.status]

    const body = (
        <>
            <span className="tabular grid size-8 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-navy-500 ring-1 ring-navy-200">
                {visit.sequence}
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-navy-800">
                    {formatDate(visit.planned_for)}
                </span>
                {visit.task && (
                    <span className="tabular block truncate text-[11px] text-navy-400">
                        {visit.task.code}
                        {visit.task.technician && ` · ${visit.task.technician.name}`}
                    </span>
                )}
            </span>

            {/* A locked visit survives any change to the contract — worth saying
                so before a manager tries to reschedule the term. */}
            {visit.is_locked && <Lock className="size-3.5 shrink-0 text-navy-300" />}

            <span className={clsx('badge shrink-0', meta.chip)}>{meta.label}</span>
        </>
    )

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

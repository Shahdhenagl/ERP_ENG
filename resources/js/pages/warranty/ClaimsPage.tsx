import clsx from 'clsx'
import { Check, FileWarning, Replace, Wrench, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { CLAIM_STATUS } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import {
    useAssets,
    useDecideClaim,
    useFileClaim,
    useRaiseRepairOrder,
    useTechnicians,
    useWarrantyClaims,
} from '@/lib/queries'
import type { WarrantyClaim } from '@/types'

type Filter = 'open' | 'all'

export function ClaimsPage() {
    const { path } = useArea()
    const [filter, setFilter] = useState<Filter>('open')
    const [filing, setFiling] = useState(false)
    const [deciding, setDeciding] = useState<{ claim: WarrantyClaim; action: Action } | null>(null)
    const [dispatching, setDispatching] = useState<WarrantyClaim | null>(null)

    const { data, isLoading } = useWarrantyClaims({
        open: filter === 'open' ? 1 : undefined,
        per_page: 40,
    })

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="flex flex-1 gap-1 rounded-xl bg-navy-100 p-1">
                    {(
                        [
                            ['open', 'المفتوحة'],
                            ['all', 'الكل'],
                        ] as Array<[Filter, string]>
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={clsx(
                                'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                                filter === value
                                    ? 'bg-white text-navy-900 shadow-sm'
                                    : 'text-navy-500',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <Button variant="secondary" icon={FileWarning} onClick={() => setFiling(true)}>
                    بلاغ جديد
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={FileWarning}
                    title="لا توجد مطالبات"
                    description="افتح بلاغًا عندما يعطل جهاز داخل فترة الضمان."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((claim) => {
                        const state = CLAIM_STATUS[claim.status]

                        return (
                            <div key={claim.id} className="card p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular font-bold text-navy-900">
                                                {claim.code}
                                            </span>
                                            <span className={clsx('badge', state.chip)}>
                                                {state.label}
                                            </span>
                                            {!claim.is_final && claim.age_days > 3 && (
                                                <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                                                    مفتوح منذ {claim.age_days} يوم
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 text-sm font-semibold text-navy-800">
                                            {claim.asset_code} · {claim.asset}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-navy-400">
                                            {claim.customer} · بلاغ بتاريخ{' '}
                                            {formatDate(claim.reported_on)}
                                            {claim.warranty && ` · ${claim.warranty.code}`}
                                        </p>

                                        <p className="mt-2 text-sm text-navy-600">{claim.fault}</p>

                                        {claim.decision_note && (
                                            <p className="mt-2 rounded-lg bg-navy-50 p-2 text-[11px] text-navy-600">
                                                {claim.decision_note}
                                            </p>
                                        )}

                                        {claim.replacement_code && (
                                            <p className="mt-2 text-[11px] font-bold text-emerald-700">
                                                تم الاستبدال بالجهاز {claim.replacement_code} ·{' '}
                                                {claim.replacement}
                                            </p>
                                        )}
                                    </div>

                                    {claim.task_code && (
                                        <Link
                                            to={path(`/tasks/${claim.task_id}`)}
                                            className="tap shrink-0 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700"
                                        >
                                            أمر الإصلاح {claim.task_code}
                                            {claim.task_status && ` · ${claim.task_status}`}
                                        </Link>
                                    )}
                                </div>

                                {!claim.is_final && (
                                    <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                        {claim.status === 'open' && (
                                            <>
                                                <Action
                                                    icon={Check}
                                                    tone="emerald"
                                                    label="اعتماد"
                                                    onClick={() =>
                                                        setDeciding({ claim, action: 'approve' })
                                                    }
                                                />
                                                <Action
                                                    icon={X}
                                                    tone="red"
                                                    label="رفض"
                                                    onClick={() =>
                                                        setDeciding({ claim, action: 'reject' })
                                                    }
                                                />
                                            </>
                                        )}

                                        {claim.status === 'approved' && (
                                            <>
                                                {!claim.task_id && (
                                                    <Action
                                                        icon={Wrench}
                                                        tone="indigo"
                                                        label="أمر إصلاح"
                                                        onClick={() => setDispatching(claim)}
                                                    />
                                                )}
                                                <Action
                                                    icon={Check}
                                                    tone="emerald"
                                                    label="تم الإصلاح"
                                                    onClick={() =>
                                                        setDeciding({ claim, action: 'repaired' })
                                                    }
                                                />
                                                <Action
                                                    icon={Replace}
                                                    tone="violet"
                                                    label="استبدال الجهاز"
                                                    onClick={() =>
                                                        setDeciding({ claim, action: 'replace' })
                                                    }
                                                />
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {filing && <ClaimForm onClose={() => setFiling(false)} />}
            {deciding && (
                <DecideDialog
                    claim={deciding.claim}
                    action={deciding.action}
                    onClose={() => setDeciding(null)}
                />
            )}
            {dispatching && (
                <RepairOrderDialog claim={dispatching} onClose={() => setDispatching(null)} />
            )}
        </>
    )
}

type Action = 'approve' | 'reject' | 'repaired' | 'replace'

function Action({
    icon: Icon,
    label,
    tone,
    onClick,
}: {
    icon: typeof Check
    label: string
    tone: 'emerald' | 'red' | 'indigo' | 'violet'
    onClick: () => void
}) {
    const chip = {
        emerald: 'bg-emerald-50 text-emerald-700',
        red: 'bg-red-50 text-red-700',
        indigo: 'bg-indigo-50 text-indigo-700',
        violet: 'bg-violet-50 text-violet-700',
    }[tone]

    return (
        <button
            onClick={onClick}
            className={clsx(
                'tap inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold',
                chip,
            )}
        >
            <Icon className="size-3.5" />
            {label}
        </button>
    )
}

/* ── Filing ──────────────────────────────────────────────── */

function ClaimForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const file = useFileClaim()
    const { data: assets } = useAssets({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        asset_id: '',
        reported_on: new Date().toISOString().slice(0, 10),
        fault: '',
    })

    return (
        <Modal
            open
            onClose={onClose}
            title="بلاغ ضمان"
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={file.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={file.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await file.mutateAsync({
                                    asset_id: Number(form.asset_id),
                                    reported_on: form.reported_on,
                                    fault: form.fault,
                                })
                                toast.success('تم فتح البلاغ.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر فتح البلاغ.'))
                            }
                        }}
                    >
                        فتح البلاغ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الجهاز" required error={errors.asset_id}>
                    <Select
                        value={form.asset_id}
                        onChange={(e) => setForm((f) => ({ ...f, asset_id: e.target.value }))}
                    >
                        <option value="">— اختر الجهاز —</option>
                        {assets?.data.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                                {asset.code} · {asset.label}
                                {asset.serial ? ` · ${asset.serial}` : ''}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field
                    label="تاريخ العطل"
                    required
                    error={errors.reported_on}
                    hint="التغطية تُحسب بتاريخ العطل، لا بتاريخ فتح البلاغ"
                >
                    <Input
                        type="date"
                        value={form.reported_on}
                        onChange={(e) => setForm((f) => ({ ...f, reported_on: e.target.value }))}
                    />
                </Field>

                <Field label="وصف العطل" required error={errors.fault}>
                    <Textarea
                        value={form.fault}
                        onChange={(e) => setForm((f) => ({ ...f, fault: e.target.value }))}
                        rows={4}
                        placeholder="الجهاز لا يشحن البطاريات ويصدر صافرة مستمرة"
                    />
                </Field>
            </div>
        </Modal>
    )
}

/* ── Judging and settling ────────────────────────────────── */

const ACTION_META: Record<Action, { title: string; verb: string; done: string }> = {
    approve: { title: 'اعتماد البلاغ', verb: 'اعتماد', done: 'تم اعتماد البلاغ.' },
    reject: { title: 'رفض البلاغ', verb: 'رفض', done: 'تم رفض البلاغ.' },
    repaired: { title: 'إقفال البلاغ بالإصلاح', verb: 'إقفال', done: 'تم إقفال البلاغ.' },
    replace: { title: 'استبدال الجهاز', verb: 'استبدال', done: 'تم تسجيل الاستبدال.' },
}

function DecideDialog({
    claim,
    action,
    onClose,
}: {
    claim: WarrantyClaim
    action: Action
    onClose: () => void
}) {
    const toast = useToast()
    const decide = useDecideClaim()
    const { data: assets } = useAssets({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [note, setNote] = useState('')
    const [replacementId, setReplacementId] = useState('')

    const meta = ACTION_META[action]

    return (
        <Modal
            open
            onClose={onClose}
            title={`${meta.title} — ${claim.code}`}
            description={
                action === 'replace'
                    ? 'ما تبقّى من الضمان ينتقل للجهاز الجديد، والجهاز القديم يخرج من الخدمة.'
                    : undefined
            }
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={decide.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={decide.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await decide.mutateAsync({
                                    id: claim.id,
                                    action,
                                    note: note || null,
                                    reason: action === 'reject' ? note : undefined,
                                    replacement_asset_id:
                                        action === 'replace' ? Number(replacementId) : undefined,
                                })
                                toast.success(meta.done)
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
                            }
                        }}
                    >
                        {meta.verb}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {action === 'replace' && (
                    <Field
                        label="الجهاز البديل"
                        required
                        error={errors.replacement_asset_id || errors.status}
                    >
                        <Select
                            value={replacementId}
                            onChange={(e) => setReplacementId(e.target.value)}
                        >
                            <option value="">— اختر الجهاز —</option>
                            {assets?.data
                                .filter((asset) => asset.id !== claim.asset_id)
                                .map((asset) => (
                                    <option key={asset.id} value={asset.id}>
                                        {asset.code} · {asset.label}
                                        {asset.serial ? ` · ${asset.serial}` : ''}
                                    </option>
                                ))}
                        </Select>
                    </Field>
                )}

                {action !== 'replace' && (
                    <Field
                        label={action === 'reject' ? 'سبب الرفض' : 'ملاحظات'}
                        required={action === 'reject'}
                        error={errors.reason || errors.note || errors.status}
                    >
                        <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            placeholder={
                                action === 'reject'
                                    ? 'العطل ناتج عن غمر مياه، وهو خارج التغطية'
                                    : undefined
                            }
                        />
                    </Field>
                )}
            </div>
        </Modal>
    )
}

/* ── Dispatching the repair ──────────────────────────────── */

function RepairOrderDialog({ claim, onClose }: { claim: WarrantyClaim; onClose: () => void }) {
    const toast = useToast()
    const raise = useRaiseRepairOrder()
    const { data: technicians } = useTechnicians()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        assigned_to: '',
        priority: 'high',
        scheduled_at: '',
    })

    return (
        <Modal
            open
            onClose={onClose}
            title={`أمر إصلاح — ${claim.code}`}
            description="أمر الإصلاح أمر عمل عادي: نفس لوحة التوزيع ونفس تقرير الإنجاز."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={raise.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={raise.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await raise.mutateAsync({
                                    id: claim.id,
                                    assigned_to: form.assigned_to
                                        ? Number(form.assigned_to)
                                        : null,
                                    priority: form.priority,
                                    scheduled_at: form.scheduled_at || null,
                                })
                                toast.success('تم فتح أمر الإصلاح.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر فتح أمر الإصلاح.'))
                            }
                        }}
                    >
                        فتح أمر الإصلاح
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الفني" error={errors.assigned_to}>
                    <Select
                        value={form.assigned_to}
                        onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                    >
                        <option value="">— بدون إسناد —</option>
                        {technicians?.map((technician) => (
                            <option key={technician.id} value={technician.id}>
                                {technician.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الأولوية" error={errors.priority}>
                        <Select
                            value={form.priority}
                            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                        >
                            <option value="low">منخفضة</option>
                            <option value="normal">عادية</option>
                            <option value="high">عالية</option>
                            <option value="urgent">عاجلة</option>
                        </Select>
                    </Field>

                    <Field label="موعد الزيارة" error={errors.scheduled_at}>
                        <Input
                            type="datetime-local"
                            value={form.scheduled_at}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, scheduled_at: e.target.value }))
                            }
                        />
                    </Field>
                </div>
            </div>
        </Modal>
    )
}

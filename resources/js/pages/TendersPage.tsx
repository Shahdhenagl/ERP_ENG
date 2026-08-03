import clsx from 'clsx'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { tr } from '@/lib/i18n'
import { FileSignature, Plus, Search, Send, ThumbsDown, Trophy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Attachments } from '@/components/Attachments'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
    Button,
    EmptyState,
    Field,
    Input,
    PageHeader,
    Select,
    SkeletonCard,
    Textarea,
} from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useCustomers, useSaveTender, useTenderAction, useTenders } from '@/lib/queries'
import type { Tender, TenderStatus } from '@/types'

const STATUS: Record<TenderStatus, string> = {
    registered: 'bg-navy-100 text-navy-600',
    submitted: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    won: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    lost: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

type Filter = '' | TenderStatus

export function TendersPage() {
    const [filter, setFilter] = useState<Filter>('')
    const [search, setSearch] = useState('')
    const [view, setView] = useViewMode('tenders')
    const { data, isLoading } = useTenders({
        status: filter || undefined,
        search: search.trim() || undefined,
    })
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState<Tender | null>(null)
    const [deciding, setDeciding] = useState<Tender | null>(null)

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }
    useEffect(() => () => window.clearTimeout(timer.current), [])

    const meta = data?.meta

    return (
        <>
            <PageHeader
                title="المناقصات والعطاءات"
                subtitle="العطاءات بمواعيدها ونسبة الفوز"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        {tr('مناقصة جديدة')}
                    </Button>
                }
            />

            {meta && (
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="نسبة الفوز" value={meta.win_rate !== null ? `${meta.win_rate}%` : '—'} accent />
                    <Stat label="قيد التنفيذ" value={String(meta.open)} />
                    <Stat label="فائزة" value={String(meta.won)} tone="up" />
                    <Stat label="خاسرة" value={String(meta.lost)} tone="down" />
                </div>
            )}

            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={search}
                        onChange={(e) => debounced(e.target.value)}
                        placeholder="ابحث بالعنوان أو الجهة أو الرقم…"
                        className="pr-10"
                    />
                </div>
                <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-navy-100 p-1">
                    {(
                        [
                            ['', 'الكل'],
                            ['registered', 'مسجّلة'],
                            ['submitted', 'مقدَّمة'],
                            ['won', 'فائزة'],
                            ['lost', 'خاسرة'],
                        ] as const
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={clsx(
                                'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold whitespace-nowrap transition',
                                filter === value ? 'bg-surface text-navy-900 shadow-sm' : 'text-navy-500',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-3 flex justify-end">
                <ViewToggle view={view} onChange={setView} />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={FileSignature}
                    title="لا توجد مناقصات"
                    description="سجّل العطاءات لمتابعة مواعيد التقديم ونتائجها ونسبة الفوز."
                />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="56rem"
                    headers={[
                        { label: 'رقم المناقصة', className: 'w-32' },
                        'العنوان',
                        'الجهة',
                        { label: 'آخر موعد للتقديم', className: 'w-36' },
                        { label: 'القيمة التقديرية', className: 'w-32 text-end' },
                        { label: 'الحالة', className: 'w-28' },
                    ]}
                >
                    {data.data.map((tender) => (
                        <tr
                            key={tender.id}
                            onClick={() => setEditing(tender)}
                            className="cursor-pointer border-t border-navy-100 hover:bg-navy-50/60"
                        >
                            <td className="tabular px-3 py-2.5 font-bold text-brand-600">
                                {tender.reference_no ?? tender.code}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-navy-800">
                                {tender.title}
                            </td>
                            <td className="px-3 py-2.5 text-navy-600">{tender.entity}</td>
                            <td className="tabular px-3 py-2.5 text-navy-600">
                                {tender.submission_deadline ? formatDate(tender.submission_deadline) : '—'}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end text-navy-700">
                                {tender.estimated_value ? formatMoney(tender.estimated_value) : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                                <span className={clsx('badge', STATUS[tender.status])}>
                                    {tender.status_label}
                                </span>
                            </td>
                        </tr>
                    ))}
                </DataTable>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {data.data.map((tender) => (
                        <TenderRow
                            key={tender.id}
                            tender={tender}
                            onEdit={() => setEditing(tender)}
                            onDecide={() => setDeciding(tender)}
                        />
                    ))}
                </div>
            )}

            {(creating || editing) && (
                <TenderForm
                    tender={editing ?? undefined}
                    onClose={() => {
                        setCreating(false)
                        setEditing(null)
                    }}
                />
            )}
            {deciding && <DecideDialog tender={deciding} onClose={() => setDeciding(null)} />}
        </>
    )
}

function TenderRow({
    tender,
    onEdit,
    onDecide,
}: {
    tender: Tender
    onEdit: () => void
    onDecide: () => void
}) {
    const toast = useToast()
    const { can } = useAuth()
    const action = useTenderAction()
    const days = tender.days_to_deadline
    const open = tender.status === 'registered' || tender.status === 'submitted'
    const canDecide = can('sales.approve')

    return (
        <div className="card p-3.5">
            <div className="flex items-start justify-between gap-3">
                <button onClick={onEdit} className="min-w-0 flex-1 text-start">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-[11px] font-bold text-brand-600">{tender.code}</span>
                        <span className={clsx('badge', STATUS[tender.status])}>{tender.status_label}</span>
                        {open && days !== null && (
                            <span
                                className={clsx(
                                    'tabular text-[11px] font-bold',
                                    days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-navy-400',
                                )}
                            >
                                {days < 0 ? `فات الموعد ${Math.abs(days)} يوم` : `متبقٍ ${days} يوم`}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 truncate font-bold text-navy-900">{tender.title}</p>
                    <p className="truncate text-[11px] text-navy-400">
                        {tender.entity}
                        {tender.submission_deadline && ` · تقديم ${formatDate(tender.submission_deadline)}`}
                    </p>
                </button>

                <div className="shrink-0 text-left">
                    <p className="tabular text-sm font-extrabold text-navy-900">
                        {formatMoney(tender.awarded_value ?? tender.estimated_value ?? 0)}
                    </p>
                    {tender.awarded_value != null && (
                        <p className="text-[10px] text-emerald-600">قيمة الترسية</p>
                    )}
                </div>
            </div>

            {open && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                    {tender.status === 'registered' && (
                        <button
                            onClick={async () => {
                                try {
                                    await action.mutateAsync({ id: tender.id, action: 'submit' })
                                    toast.success('تم تسجيل التقديم.')
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر التنفيذ.'))
                                }
                            }}
                            className="tap inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700"
                        >
                            <Send className="size-3.5" />
                            {tr('تسجيل التقديم')}
                        </button>
                    )}
                    {canDecide && (
                        <button
                            onClick={onDecide}
                            className="tap inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                        >
                            <Trophy className="size-3.5" />
                            {tr('تسجيل النتيجة')}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

function Stat({
    label,
    value,
    accent,
    tone,
}: {
    label: string
    value: string
    accent?: boolean
    tone?: 'up' | 'down'
}) {
    return (
        <div className="card p-3 text-center">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular mt-0.5 text-lg font-extrabold',
                    accent
                        ? 'text-brand-600'
                        : tone === 'up'
                          ? 'text-emerald-600'
                          : tone === 'down'
                            ? 'text-red-600'
                            : 'text-navy-900',
                )}
            >
                {value}
            </p>
        </div>
    )
}

/* ── Decide ──────────────────────────────────────────────── */

function DecideDialog({ tender, onClose }: { tender: Tender; onClose: () => void }) {
    const toast = useToast()
    const action = useTenderAction()
    const [result, setResult] = useState<'won' | 'lost'>('won')
    const [awarded, setAwarded] = useState('')
    const [note, setNote] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title={`نتيجة المناقصة ${tender.code}`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={action.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={action.isPending}
                        onClick={async () => {
                            try {
                                await action.mutateAsync({
                                    id: tender.id,
                                    action: 'decide',
                                    payload: {
                                        result,
                                        awarded_value: result === 'won' && awarded ? Number(awarded) : null,
                                        result_note: note || null,
                                    },
                                })
                                toast.success('تم تسجيل النتيجة.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                            }
                        }}
                    >
                        {tr('حفظ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setResult('won')}
                        className={clsx(
                            'tap flex items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-bold ring-1 transition',
                            result === 'won'
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
                                : 'bg-surface text-navy-500 ring-navy-200',
                        )}
                    >
                        <Trophy className="size-4" />
                        {tr('فوز')}
                    </button>
                    <button
                        onClick={() => setResult('lost')}
                        className={clsx(
                            'tap flex items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-bold ring-1 transition',
                            result === 'lost'
                                ? 'bg-red-50 text-red-700 ring-red-300'
                                : 'bg-surface text-navy-500 ring-navy-200',
                        )}
                    >
                        <ThumbsDown className="size-4" />
                        {tr('خسارة')}
                    </button>
                </div>

                {result === 'won' && (
                    <Field label="قيمة الترسية">
                        <Input type="number" value={awarded} onChange={(e) => setAwarded(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                )}

                <Field label={result === 'won' ? 'ملاحظة' : 'سبب الخسارة'}>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

/* ── Create / edit ───────────────────────────────────────── */

function TenderForm({ tender, onClose }: { tender?: Tender; onClose: () => void }) {
    const toast = useToast()
    const save = useSaveTender()
    const { data: customerPage } = useCustomers({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        entity: tender?.entity ?? '',
        title: tender?.title ?? '',
        reference_no: tender?.reference_no ?? '',
        customer_id: tender?.customer_id ? String(tender.customer_id) : '',
        announced_on: tender?.announced_on ?? '',
        submission_deadline: tender?.submission_deadline ?? '',
        opening_date: tender?.opening_date ?? '',
        estimated_value: tender?.estimated_value != null ? String(tender.estimated_value) : '',
        bid_bond: tender?.bid_bond != null ? String(tender.bid_bond) : '',
        description: tender?.description ?? '',
        notes: tender?.notes ?? '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title={tender ? `مناقصة ${tender.code}` : 'مناقصة جديدة'}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await save.mutateAsync({
                                    id: tender?.id,
                                    entity: form.entity,
                                    title: form.title,
                                    reference_no: form.reference_no || null,
                                    customer_id: form.customer_id ? Number(form.customer_id) : null,
                                    announced_on: form.announced_on || null,
                                    submission_deadline: form.submission_deadline || null,
                                    opening_date: form.opening_date || null,
                                    estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
                                    bid_bond: form.bid_bond ? Number(form.bid_bond) : null,
                                    description: form.description || null,
                                    notes: form.notes || null,
                                })
                                toast.success('تم الحفظ.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر الحفظ.'))
                            }
                        }}
                    >
                        {tr('حفظ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الجهة صاحبة المناقصة" required error={errors.entity}>
                    <Input value={form.entity} onChange={(e) => set('entity')(e.target.value)} />
                </Field>
                <Field label="عنوان المناقصة" required error={errors.title}>
                    <Input value={form.title} onChange={(e) => set('title')(e.target.value)} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="رقم المناقصة" error={errors.reference_no}>
                        <Input value={form.reference_no} onChange={(e) => set('reference_no')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="العميل (إن وُجد)" error={errors.customer_id}>
                        <Select value={form.customer_id} onChange={(e) => set('customer_id')(e.target.value)}>
                            <option value="">بدون</option>
                            {customerPage?.data.map((customer) => (
                                <option key={customer.id} value={customer.id}>
                                    {customer.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="تاريخ الطرح" error={errors.announced_on}>
                        <Input type="date" value={form.announced_on} onChange={(e) => set('announced_on')(e.target.value)} />
                    </Field>
                    <Field label="آخر موعد للتقديم" error={errors.submission_deadline}>
                        <Input type="date" value={form.submission_deadline} onChange={(e) => set('submission_deadline')(e.target.value)} />
                    </Field>
                    <Field label="موعد الفتح" error={errors.opening_date}>
                        <Input type="date" value={form.opening_date} onChange={(e) => set('opening_date')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="القيمة التقديرية" error={errors.estimated_value}>
                        <Input type="number" value={form.estimated_value} onChange={(e) => set('estimated_value')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="التأمين الابتدائي" error={errors.bid_bond}>
                        <Input type="number" value={form.bid_bond} onChange={(e) => set('bid_bond')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                </div>

                <Field label="وصف / بنود" error={errors.description}>
                    <Textarea value={form.description} onChange={(e) => set('description')(e.target.value)} rows={2} />
                </Field>
                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} rows={2} />
                </Field>

                {tender && (
                    <div className="border-t border-navy-100 pt-4">
                        <Attachments type="tenders" id={tender.id} label="وثائق المناقصة" />
                    </div>
                )}
            </div>
        </Modal>
    )
}

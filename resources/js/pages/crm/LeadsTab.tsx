import clsx from 'clsx'
import {
    ArrowRight,
    Check,
    MessageCircle,
    Phone,
    Plus,
    Target,
    UserPlus,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExportButton } from '@/components/ExportButton'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useViewMode, ViewToggle } from '@/components/ViewToggle'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea, Th } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { api } from '@/lib/api'
import { formatMoney, LEAD_PRIORITY, LEAD_SOURCE } from '@/lib/domain'
import { useArea } from '@/lib/nav'
import { useLead, useLeads, useLeadStatus, useSaveLead } from '@/lib/queries'
import type { Lead, LeadPriority, LeadStatus } from '@/types'
import { LeadFollowUps } from '@/pages/crm/LeadFollowUps'

const STATUS: Record<LeadStatus, string> = {
    new: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    contacted: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    qualified: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    won: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    lost: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

// The open stages, in the order a deal moves through them.
const STAGES: Array<[LeadStatus, string]> = [
    ['new', 'جديد'],
    ['contacted', 'تم التواصل'],
    ['qualified', 'مؤهَّل'],
]

export function LeadsTab() {
    const [creating, setCreating] = useState(false)
    const [openId, setOpenId] = useState<number | null>(null)
    const [status, setStatus] = useState<LeadStatus | ''>('')
    const [priority, setPriority] = useState<LeadPriority | ''>('')
    const [source, setSource] = useState('')
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [search, setSearch] = useState('')
    const [view, setView] = useViewMode('leads')

    // The stage buttons narrow to one stage; everything else is a separate
    // question about the same set, so it stacks rather than replaces.
    const filters = {
        search: search || undefined,
        status: status || undefined,
        priority: priority || undefined,
        source: source || undefined,
        from: from || undefined,
        to: to || undefined,
        // "All" means the open pipeline, not the archive: a board that opens on
        // three years of won and lost deals is not a board.
        open: status ? undefined : 1,
    }

    const { data, isLoading } = useLeads({ ...filters, per_page: 50 })

    if (openId !== null) {
        return <LeadDetail id={openId} onBack={() => setOpenId(null)} />
    }

    const pipeline = data?.meta.pipeline ?? {}

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="flex flex-1 gap-1">
                    <button
                        onClick={() => setStatus('')}
                        className={clsx(
                            'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                            status === '' ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-surface text-navy-500 ring-navy-200',
                        )}
                    >
                        الكل
                    </button>
                    {STAGES.map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setStatus((s) => (s === value ? '' : value))}
                            className={clsx(
                                'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                                status === value ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-surface text-navy-500 ring-navy-200',
                            )}
                        >
                            {label}
                            {pipeline[value] ? ` (${pipeline[value]})` : ''}
                        </button>
                    ))}
                </div>
                <ViewToggle view={view} onChange={setView} />

                <ExportButton
                    filename="leads"
                    headers={[
                        'الكود',
                        'الاسم',
                        'الشركة',
                        'الهاتف',
                        'الحالة',
                        'الأولوية',
                        'المصدر',
                        'القيمة المتوقعة',
                        'المسؤول',
                    ]}
                    rows={async () => {
                        const { data: page } = await api.get<{ data: Lead[] }>('/leads', {
                            params: { ...filters, per_page: 1000 },
                        })

                        return page.data.map((lead) => [
                            lead.code,
                            lead.name,
                            lead.company,
                            lead.phone,
                            lead.status_label,
                            lead.priority_label,
                            lead.source_label,
                            lead.est_value,
                            lead.owner,
                        ])
                    }}
                />

                <Button icon={Plus} onClick={() => setCreating(true)}>
                    عميل محتمل
                </Button>
            </div>

            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Input
                    placeholder="بحث بالاسم أو الشركة أو الهاتف…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="sm:col-span-2 lg:col-span-1"
                />

                <Select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as LeadPriority | '')}
                >
                    <option value="">كل الأولويات</option>
                    {Object.entries(LEAD_PRIORITY).map(([value, meta]) => (
                        <option key={value} value={value}>
                            {meta.label}
                        </option>
                    ))}
                </Select>

                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                    <option value="">كل المصادر</option>
                    {Object.entries(LEAD_SOURCE).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </Select>

                <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    aria-label="من تاريخ"
                />
                <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    aria-label="إلى تاريخ"
                />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Target}
                    title="لا يوجد عملاء محتملون"
                    description="سجّل كل فرصة بيع هنا وتابعها حتى تُكسب أو تُغلق."
                />
            ) : view === 'table' ? (
                <LeadTable leads={data.data} onOpen={setOpenId} />
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {data.data.map((lead) => (
                        <button
                            key={lead.id}
                            onClick={() => setOpenId(lead.id)}
                            className="card flex w-full items-center justify-between gap-3 p-4 text-start transition hover:bg-navy-50"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold text-navy-900">{lead.name}</span>
                                    <span className={clsx('badge', STATUS[lead.status])}>
                                        {lead.status_label}
                                    </span>
                                    {lead.priority !== 'normal' && (
                                        <span
                                            className={clsx('badge', LEAD_PRIORITY[lead.priority]?.chip)}
                                        >
                                            {lead.priority_label}
                                        </span>
                                    )}
                                    {(lead.open_follow_ups ?? 0) > 0 && (
                                        <span className="badge bg-navy-100 text-navy-500">
                                            {lead.open_follow_ups} متابعة
                                        </span>
                                    )}
                                </div>
                                <p className="tabular text-[11px] text-navy-400">
                                    {lead.code}
                                    {lead.company && ` · ${lead.company}`}
                                    {lead.phone && ` · ${lead.phone}`}
                                </p>
                            </div>
                            {lead.est_value ? (
                                <span className="tabular shrink-0 text-sm font-bold text-navy-700">
                                    {formatMoney(lead.est_value)}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
            )}

            {creating && <LeadForm onClose={() => setCreating(false)} onSaved={setOpenId} />}
        </>
    )
}

/**
 * The pipeline as rows.
 *
 * A card carries enough of one lead to judge it alone; this is for reading
 * thirty at once — down the priority column, down the value column — which is
 * the only way to decide who to ring this morning.
 */
function LeadTable({ leads, onOpen }: { leads: Lead[]; onOpen: (id: number) => void }) {
    return (
        <div className="card overflow-x-auto">
            <table className="w-full min-w-[52rem] text-start text-sm">
                <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                    <tr>
                        <Th className="w-28 px-3 py-2.5">الكود</Th>
                        <Th className="px-3 py-2.5">الاسم</Th>
                        <Th className="px-3 py-2.5">الشركة</Th>
                        <Th className="w-32 px-3 py-2.5">الهاتف</Th>
                        <Th className="w-28 px-3 py-2.5">الحالة</Th>
                        <Th className="w-24 px-3 py-2.5">الأولوية</Th>
                        <Th className="w-24 px-3 py-2.5">المصدر</Th>
                        <Th className="w-28 px-3 py-2.5 text-left">القيمة المتوقعة</Th>
                    </tr>
                </thead>

                <tbody>
                    {leads.map((lead) => (
                        <tr
                            key={lead.id}
                            onClick={() => onOpen(lead.id)}
                            className="cursor-pointer border-t border-navy-100 transition hover:bg-navy-50/60"
                        >
                            <td className="tabular px-3 py-2.5 font-bold text-brand-600">
                                {lead.code}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-navy-800">
                                {lead.name}
                                {(lead.open_follow_ups ?? 0) > 0 && (
                                    <span className="badge mr-1.5 bg-navy-100 text-navy-500">
                                        {lead.open_follow_ups} متابعة
                                    </span>
                                )}
                            </td>
                            <td className="px-3 py-2.5 text-navy-600">{lead.company ?? '—'}</td>
                            <td className="tabular px-3 py-2.5 text-navy-600" dir="ltr">
                                {lead.phone ?? '—'}
                            </td>
                            <td className="px-3 py-2.5">
                                <span className={clsx('badge', STATUS[lead.status])}>
                                    {lead.status_label}
                                </span>
                            </td>
                            <td className="px-3 py-2.5">
                                <span className={clsx('badge', LEAD_PRIORITY[lead.priority]?.chip)}>
                                    {lead.priority_label}
                                </span>
                            </td>
                            <td className="px-3 py-2.5 text-navy-600">{lead.source_label ?? '—'}</td>
                            <td className="tabular px-3 py-2.5 text-left font-bold text-navy-800">
                                {lead.est_value ? formatMoney(lead.est_value) : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

/* ── Detail ──────────────────────────────────────────────── */

function LeadDetail({ id, onBack }: { id: number; onBack: () => void }) {
    const toast = useToast()
    const { path } = useArea()
    const { data: lead, isLoading } = useLead(id)
    const changeStatus = useLeadStatus(id)
    const [editing, setEditing] = useState(false)

    const move = async (status: LeadStatus) => {
        let lostReason: string | undefined
        if (status === 'won' && !window.confirm('كسب العميل يحوّله إلى عميل مسجّل. متابعة؟')) return
        if (status === 'lost') {
            const reason = window.prompt('سبب الخسارة؟')
            if (!reason) return
            lostReason = reason
        }
        try {
            const res = await changeStatus.mutateAsync({ status, lost_reason: lostReason })
            toast.success(status === 'won' ? 'تم كسب العميل وتحويله.' : 'تم تحديث الحالة.')
            if (res.customer_id) {
                toast.success('أُنشئ عميل جديد من هذا المحتمل.')
            }
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تحديث الحالة.'))
        }
    }

    return (
        <>
            <button
                onClick={onBack}
                className="tap mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy-500"
            >
                <ArrowRight className="size-4" />
                كل العملاء المحتملين
            </button>

            {isLoading || !lead ? (
                <SkeletonCard />
            ) : (
                <>
                    <div className="card mb-4 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-extrabold text-navy-900">{lead.name}</h2>
                                    <span className={clsx('badge', STATUS[lead.status])}>
                                        {lead.status_label}
                                    </span>
                                </div>
                                <p className="tabular text-[11px] text-navy-400">
                                    {lead.code}
                                    {lead.company && ` · ${lead.company}`}
                                    {lead.source_label && ` · ${lead.source_label}`}
                                </p>
                            </div>
                            <button
                                onClick={() => setEditing(true)}
                                className="tap rounded-lg bg-navy-100 px-3 py-1.5 text-xs font-bold text-navy-600"
                            >
                                تعديل
                            </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
                            {lead.phone && (
                                <a
                                    href={`tel:${lead.phone}`}
                                    className="tap inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 font-semibold text-navy-700"
                                >
                                    <Phone className="size-3.5" />
                                    {lead.phone}
                                </a>
                            )}
                            {lead.whatsapp_number && (
                                <a
                                    href={`https://wa.me/2${lead.whatsapp_number}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="tap inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700"
                                >
                                    <MessageCircle className="size-3.5" />
                                    واتساب
                                </a>
                            )}
                            {lead.est_value ? (
                                <span className="tabular inline-flex items-center rounded-lg bg-navy-50 px-3 py-1.5 font-bold text-navy-700">
                                    {formatMoney(lead.est_value)}
                                </span>
                            ) : null}
                        </div>

                        {lead.notes && (
                            <p className="mt-3 rounded-lg bg-navy-50 p-2 text-sm text-navy-600">
                                {lead.notes}
                            </p>
                        )}
                        {lead.status === 'lost' && lead.lost_reason && (
                            <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
                                سبب الخسارة: {lead.lost_reason}
                            </p>
                        )}

                        {/* Where a won lead landed. */}
                        {lead.customer_id && (
                            <Link
                                to={path(`/customers?id=${lead.customer_id}`)}
                                className="tap mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"
                            >
                                <UserPlus className="size-4" />
                                فتح العميل المسجّل
                            </Link>
                        )}

                        {/* The moves available from here. A won or lost lead is settled. */}
                        {lead.status !== 'won' && lead.status !== 'lost' && (
                            <div className="mt-4 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                {lead.status === 'new' && (
                                    <StageButton onClick={() => move('contacted')} disabled={changeStatus.isPending}>
                                        تم التواصل
                                    </StageButton>
                                )}
                                {lead.status !== 'qualified' && (
                                    <StageButton onClick={() => move('qualified')} disabled={changeStatus.isPending}>
                                        مؤهَّل
                                    </StageButton>
                                )}
                                <button
                                    onClick={() => move('won')}
                                    disabled={changeStatus.isPending}
                                    className="tap inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                                >
                                    <Check className="size-3.5" />
                                    كسب وتحويل
                                </button>
                                <button
                                    onClick={() => move('lost')}
                                    disabled={changeStatus.isPending}
                                    className="tap rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50"
                                >
                                    خسارة
                                </button>
                            </div>
                        )}
                    </div>

                    <LeadFollowUps lead={lead} />

                    {editing && (
                        <LeadForm lead={lead} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
                    )}
                </>
            )}
        </>
    )
}

function StageButton({
    children,
    onClick,
    disabled,
}: {
    children: React.ReactNode
    onClick: () => void
    disabled?: boolean
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="tap rounded-lg bg-navy-100 px-3 py-1.5 text-xs font-bold text-navy-700 disabled:opacity-50"
        >
            {children}
        </button>
    )
}

/* ── Form ────────────────────────────────────────────────── */

function LeadForm({
    lead,
    onClose,
    onSaved,
}: {
    lead?: Lead
    onClose: () => void
    onSaved: (id: number) => void
}) {
    const toast = useToast()
    const save = useSaveLead(lead?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: lead?.name ?? '',
        company: lead?.company ?? '',
        phone: lead?.phone ?? '',
        whatsapp: lead?.whatsapp ?? '',
        email: lead?.email ?? '',
        source: lead?.source ?? '',
        priority: lead?.priority ?? 'normal',
        est_value: lead?.est_value != null ? String(lead.est_value) : '',
        notes: lead?.notes ?? '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title={lead ? 'تعديل عميل محتمل' : 'عميل محتمل جديد'}
            size="md"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                const saved = await save.mutateAsync({
                                    name: form.name,
                                    company: form.company || null,
                                    phone: form.phone || null,
                                    whatsapp: form.whatsapp || null,
                                    email: form.email || null,
                                    source: form.source || null,
                                    priority: form.priority,
                                    est_value: form.est_value ? Number(form.est_value) : null,
                                    notes: form.notes || null,
                                })
                                toast.success('تم الحفظ.')
                                onClose()
                                onSaved(saved.id)
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر الحفظ.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الاسم" required error={errors.name}>
                        <Input value={form.name} onChange={(e) => set('name')(e.target.value)} />
                    </Field>
                    <Field label="الشركة" error={errors.company}>
                        <Input value={form.company} onChange={(e) => set('company')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الهاتف" error={errors.phone}>
                        <Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="واتساب" error={errors.whatsapp} hint="اتركه فارغًا لاستخدام الهاتف">
                        <Input value={form.whatsapp} onChange={(e) => set('whatsapp')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="المصدر" error={errors.source}>
                        <Select value={form.source} onChange={(e) => set('source')(e.target.value)}>
                            <option value="">— اختر —</option>
                            <option value="referral">ترشيح</option>
                            <option value="call">اتصال</option>
                            <option value="walk_in">زيارة</option>
                            <option value="social">سوشيال ميديا</option>
                            <option value="website">الموقع</option>
                            <option value="other">أخرى</option>
                        </Select>
                    </Field>
                    <Field
                        label="الأولوية"
                        error={errors.priority}
                        hint="ترتّب القائمة — الأعجل أولاً"
                    >
                        <Select
                            value={form.priority}
                            onChange={(e) => set('priority')(e.target.value)}
                        >
                            {Object.entries(LEAD_PRIORITY).map(([value, meta]) => (
                                <option key={value} value={value}>
                                    {meta.label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="القيمة المتوقعة" error={errors.est_value}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.est_value}
                            onChange={(e) => set('est_value')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <Field label="البريد" error={errors.email}>
                    <Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} dir="ltr" className="text-left" />
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

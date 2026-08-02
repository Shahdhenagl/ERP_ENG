import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { BadgeCheck, MapPin, Plus, Printer, Trash2, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Attachments } from '@/components/Attachments'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useArea } from '@/lib/nav'
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
import { formatDate } from '@/lib/format'
import {
    useApproveSiteSurvey,
    useCustomers,
    useDeleteSiteSurvey,
    useLeads,
    useSaveSiteSurvey,
    useSiteSurveys,
} from '@/lib/queries'
import type { SiteSurvey, SurveyStatus } from '@/types'

const STATUS: Record<SurveyStatus, string> = {
    draft: 'bg-navy-100 text-navy-600',
    completed: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

type Filter = '' | SurveyStatus

export function SiteSurveyPage() {
    const [filter, setFilter] = useState<Filter>('')
    const { data, isLoading } = useSiteSurveys(filter ? { status: filter } : {})
    const [editing, setEditing] = useState<SiteSurvey | null>(null)
    const [creating, setCreating] = useState(false)

    return (
        <>
            <PageHeader
                title="معاينة الموقع"
                subtitle="زيارة الموقع التي يُبنى عليها عرض السعر"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        {tr('معاينة جديدة')}
                    </Button>
                }
            />

            <div className="mb-4 flex gap-1 rounded-xl bg-navy-100 p-1">
                {(
                    [
                        ['', 'الكل'],
                        ['draft', 'مسودة'],
                        ['completed', 'مكتملة'],
                        ['approved', 'معتمدة'],
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                            filter === value ? 'bg-surface text-navy-900 shadow-sm' : 'text-navy-500',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.length ? (
                <EmptyState
                    icon={MapPin}
                    title="لا توجد معاينات"
                    description="سجّل زيارة الموقع بالحمل والأطوار ومدة الاستقلالية لتبني عليها عرض السعر."
                />
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {data.map((survey) => (
                        <button
                            key={survey.id}
                            onClick={() => setEditing(survey)}
                            className="card-interactive block w-full p-3.5 text-start"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {survey.code}
                                        </span>
                                        <span className={clsx('badge', STATUS[survey.status])}>
                                            {survey.status_label}
                                        </span>
                                        {survey.lead_code && (
                                            <span className="tabular text-[11px] font-bold text-navy-400">
                                                {survey.lead_code}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 truncate font-bold text-navy-900">
                                        {survey.customer ?? survey.contact_name ?? '—'}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {[
                                            survey.survey_date ? formatDate(survey.survey_date) : null,
                                            survey.surveyor,
                                            survey.city,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </p>
                                </div>

                                {(survey.load_kva || survey.phase_label) && (
                                    <div className="shrink-0 text-left">
                                        <p className="tabular flex items-center justify-end gap-1 text-sm font-extrabold text-navy-900">
                                            <Zap className="size-3.5 text-amber-500" />
                                            {survey.load_kva ? `${survey.load_kva} kVA` : '—'}
                                        </p>
                                        <p className="text-[10px] text-navy-400">
                                            {[survey.phase_label, survey.backup_minutes ? `${survey.backup_minutes}د` : null]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {(creating || editing) && (
                <SurveyDialog
                    survey={editing ?? undefined}
                    onClose={() => {
                        setCreating(false)
                        setEditing(null)
                    }}
                />
            )}
        </>
    )
}

function SurveyDialog({ survey, onClose }: { survey?: SiteSurvey; onClose: () => void }) {
    const toast = useToast()
    const { path } = useArea()
    const save = useSaveSiteSurvey()
    const approve = useApproveSiteSurvey()
    const remove = useDeleteSiteSurvey()
    const { data: leads } = useLeads({ per_page: 200 })
    const { data: customerPage } = useCustomers({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const locked = survey?.status === 'approved'

    const [form, setForm] = useState({
        lead_id: survey?.lead_id ? String(survey.lead_id) : '',
        customer_id: survey?.customer_id ? String(survey.customer_id) : '',
        survey_date: survey?.survey_date ?? new Date().toISOString().slice(0, 10),
        status: (survey?.status === 'approved' ? 'completed' : survey?.status ?? 'draft') as
            | 'draft'
            | 'completed',
        contact_name: survey?.contact_name ?? '',
        contact_phone: survey?.contact_phone ?? '',
        address: survey?.address ?? '',
        city: survey?.city ?? '',
        load_kva: survey?.load_kva != null ? String(survey.load_kva) : '',
        phase: survey?.phase ?? '',
        backup_minutes: survey?.backup_minutes != null ? String(survey.backup_minutes) : '',
        existing_equipment: survey?.existing_equipment ?? '',
        recommendation: survey?.recommendation ?? '',
        notes: survey?.notes ?? '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const submit = async () => {
        setErrors({})
        try {
            await save.mutateAsync({
                id: survey?.id,
                lead_id: form.lead_id ? Number(form.lead_id) : null,
                customer_id: form.customer_id ? Number(form.customer_id) : null,
                survey_date: form.survey_date,
                status: form.status,
                contact_name: form.contact_name || null,
                contact_phone: form.contact_phone || null,
                address: form.address || null,
                city: form.city || null,
                load_kva: form.load_kva ? Number(form.load_kva) : null,
                phase: form.phase || null,
                backup_minutes: form.backup_minutes ? Number(form.backup_minutes) : null,
                existing_equipment: form.existing_equipment || null,
                recommendation: form.recommendation || null,
                notes: form.notes || null,
            })
            toast.success('تم الحفظ.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر الحفظ.'))
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={survey ? `معاينة ${survey.code}` : 'معاينة جديدة'}
            description={locked ? 'معاينة معتمدة — للعرض فقط.' : undefined}
            size="lg"
            footer={
                <div className="flex w-full items-center justify-between gap-2">
                    {survey ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <Link
                                to={path(`/print/site-surveys/${survey.id}`)}
                                target="_blank"
                                className="btn-secondary text-xs"
                            >
                                <Printer className="size-4" />
                                {tr('طباعة')}
                            </Link>

                            {!locked && (
                                <>
                                    <Button
                                        variant="secondary"
                                        icon={BadgeCheck}
                                        className="text-xs text-emerald-600"
                                        disabled={approve.isPending}
                                        onClick={async () => {
                                            try {
                                                await approve.mutateAsync(survey.id)
                                                toast.success('تم اعتماد المعاينة.')
                                                onClose()
                                            } catch (caught) {
                                                toast.error(errorMessage(caught, 'تعذّر الاعتماد.'))
                                            }
                                        }}
                                    >
                                        {tr('اعتماد')}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        icon={Trash2}
                                        className="text-xs text-red-600"
                                        loading={remove.isPending}
                                        onClick={async () => {
                                            if (!confirm('حذف هذه المعاينة؟')) return
                                            try {
                                                await remove.mutateAsync(survey.id)
                                                toast.success('تم حذف المعاينة.')
                                                onClose()
                                            } catch (caught) {
                                                toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                                            }
                                        }}
                                    >
                                        {tr('حذف')}
                                    </Button>
                                </>
                            )}
                        </div>
                    ) : (
                        <span />
                    )}

                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                            {locked ? 'إغلاق' : 'إلغاء'}
                        </Button>
                        {!locked && (
                            <Button loading={save.isPending} onClick={submit}>
                                {tr('حفظ')}
                            </Button>
                        )}
                    </div>
                </div>
            }
        >
            <fieldset disabled={locked} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="فرصة البيع (Lead)" error={errors.lead_id}>
                        <Select value={form.lead_id} onChange={(e) => set('lead_id')(e.target.value)}>
                            <option value="">بدون</option>
                            {leads?.data.map((lead) => (
                                <option key={lead.id} value={lead.id}>
                                    {lead.code} — {lead.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="العميل" error={errors.customer_id}>
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

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="تاريخ المعاينة" error={errors.survey_date}>
                        <Input type="date" value={form.survey_date} onChange={(e) => set('survey_date')(e.target.value)} />
                    </Field>
                    <Field label="الحالة" error={errors.status}>
                        <Select value={form.status} onChange={(e) => set('status')(e.target.value)}>
                            <option value="draft">مسودة</option>
                            <option value="completed">مكتملة</option>
                        </Select>
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="الحمل (kVA)" error={errors.load_kva}>
                        <Input type="number" value={form.load_kva} onChange={(e) => set('load_kva')(e.target.value)} />
                    </Field>
                    <Field label="الأطوار" error={errors.phase}>
                        <Select value={form.phase} onChange={(e) => set('phase')(e.target.value)}>
                            <option value="">—</option>
                            <option value="single">أحادي</option>
                            <option value="three">ثلاثي</option>
                        </Select>
                    </Field>
                    <Field label="الاستقلالية (دقيقة)" error={errors.backup_minutes}>
                        <Input type="number" value={form.backup_minutes} onChange={(e) => set('backup_minutes')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم المسؤول بالموقع" error={errors.contact_name}>
                        <Input value={form.contact_name} onChange={(e) => set('contact_name')(e.target.value)} />
                    </Field>
                    <Field label="هاتف المسؤول" error={errors.contact_phone}>
                        <Input value={form.contact_phone} onChange={(e) => set('contact_phone')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                    <Field label="العنوان" error={errors.address}>
                        <Input value={form.address} onChange={(e) => set('address')(e.target.value)} />
                    </Field>
                    <Field label="المدينة" error={errors.city}>
                        <Input value={form.city} onChange={(e) => set('city')(e.target.value)} />
                    </Field>
                </div>

                <Field label="المعدات الحالية بالموقع" error={errors.existing_equipment}>
                    <Textarea value={form.existing_equipment} onChange={(e) => set('existing_equipment')(e.target.value)} rows={2} />
                </Field>
                <Field label="التوصية / الحل المقترح" error={errors.recommendation}>
                    <Textarea value={form.recommendation} onChange={(e) => set('recommendation')(e.target.value)} rows={2} />
                </Field>
                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} rows={2} />
                </Field>
            </fieldset>

            {survey && (
                <div className="mt-4 border-t border-navy-100 pt-4">
                    <Attachments
                        type="site-surveys"
                        id={survey.id}
                        label="صور الموقع والمستندات"
                        readOnly={locked}
                    />
                </div>
            )}
        </Modal>
    )
}

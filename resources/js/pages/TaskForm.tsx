import clsx from 'clsx'
import { ArrowRight, MessageCircle, Plus, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AssetForm } from '@/components/AssetForm'
import { CustomerForm } from '@/components/CustomerForm'
import { useToast } from '@/components/Toast'
import { Button, ErrorState, Field, Input, PageHeader, PageLoader, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { PRIORITY, TASK_TYPE, warrantyChip } from '@/lib/domain'
import { toDateTimeLocal } from '@/lib/format'
import { useArea } from '@/lib/nav'
import {
    useAssets,
    useCreateTask,
    useCustomerBranches,
    useCustomers,
    useTask,
    useTechnicians,
    useUpdateTask,
} from '@/lib/queries'
import type { Asset, Customer, Task, TaskPriority, TaskType } from '@/types'

export function TaskForm() {
    const { id } = useParams<{ id: string }>()
    const isEdit = Boolean(id)
    const navigate = useNavigate()
    const toast = useToast()
    const { path } = useArea()

    const { data: existing, isLoading: loadingTask, isError } = useTask(isEdit ? id : undefined)
    const { data: customers } = useCustomers({ per_page: 200, active_only: 1 })
    const { data: technicians } = useTechnicians()

    const create = useCreateTask()
    const update = useUpdateTask(Number(id))

    const [customerFormOpen, setCustomerFormOpen] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [saved, setSaved] = useState<Task | null>(null)
    const [assetFormOpen, setAssetFormOpen] = useState(false)

    const [form, setForm] = useState({
        customer_id: '',
        assigned_to: '',
        title: '',
        description: '',
        type: 'maintenance' as TaskType,
        priority: 'normal' as TaskPriority,
        scheduled_at: '',
        site_address: '',
        branch_id: '',
        asset_id: '',
    })

    // Hydrate the form once the record arrives in edit mode.
    useEffect(() => {
        if (!existing) return

        setForm({
            customer_id: String(existing.customer?.id ?? ''),
            assigned_to: String(existing.technician?.id ?? ''),
            title: existing.title,
            description: existing.description ?? '',
            type: existing.type,
            priority: existing.priority,
            scheduled_at: toDateTimeLocal(existing.scheduled_at),
            site_address: existing.site_address ?? '',
            branch_id: String(existing.branch_id ?? ''),
            asset_id: String(existing.asset_id ?? ''),
        })
    }, [existing])

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    // Only the chosen customer's devices may be attached — the API rejects
    // anything else, so the picker should never offer it.
    const { data: assetPage } = useAssets(
        form.customer_id ? { customer_id: Number(form.customer_id), per_page: 200 } : {},
    )
    const { data: branchList } = useCustomerBranches(
        form.customer_id ? Number(form.customer_id) : undefined,
    )
    const branches = branchList ?? []

    const customerAssets = form.customer_id ? (assetPage?.data ?? []) : []
    const selectedAsset = customerAssets.find((asset) => String(asset.id) === form.asset_id)

    if (isEdit && loadingTask) return <PageLoader />
    if (isEdit && isError) return <ErrorState message="تعذّر تحميل المهمة." />

    const handleSubmit = async () => {
        setErrors({})

        const payload = {
            ...form,
            customer_id: Number(form.customer_id),
            assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
            description: form.description || null,
            scheduled_at: form.scheduled_at || null,
            site_address: form.site_address || null,
            branch_id: form.branch_id ? Number(form.branch_id) : null,
            asset_id: form.asset_id ? Number(form.asset_id) : null,
        }

        try {
            if (isEdit) {
                await update.mutateAsync(payload)
                toast.success('تم حفظ التعديلات.')
                navigate(path(`/tasks/${id}`))
            } else {
                const task = await create.mutateAsync(payload)
                toast.success(`تم إنشاء المهمة ${task.code}.`)
                // Offer the WhatsApp hand-off right away instead of making the
                // manager dig for it on the detail screen.
                setSaved(task)
            }
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ المهمة.'))
        }
    }

    const pending = create.isPending || update.isPending

    /* ── Post-create hand-off ───────────────────────────── */
    if (saved) {
        return (
            <div className="mx-auto max-w-lg py-8 text-center">
                <div className="card p-8">
                    <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <Save className="size-7" />
                    </div>

                    <h2 className="text-lg font-extrabold text-navy-900">
                        تم إنشاء المهمة {saved.code}
                    </h2>
                    <p className="mt-1 text-sm text-navy-400">
                        {saved.technician
                            ? `تم إرسال إشعار إلى ${saved.technician.name}.`
                            : 'لم يتم إسناد فني بعد.'}
                    </p>

                    <div className="mt-6 space-y-2">
                        {saved.whatsapp?.brief_technician && (
                            <a
                                href={saved.whatsapp.brief_technician}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-whatsapp w-full"
                            >
                                <MessageCircle className="size-4" />
                                إرسال التفاصيل للفني على واتساب
                            </a>
                        )}

                        <Button variant="secondary" block onClick={() => navigate(path(`/tasks/${saved.id}`))}>
                            فتح المهمة
                        </Button>

                        <Button
                            variant="ghost"
                            block
                            onClick={() => {
                                setSaved(null)
                                setForm((current) => ({
                                    ...current,
                                    title: '',
                                    description: '',
                                    branch_id: '',
        asset_id: '',
                                }))
                            }}
                        >
                            <Plus className="size-4" />
                            إنشاء مهمة أخرى
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <button onClick={() => navigate(-1)} className="btn-ghost -mr-2 mb-3 text-sm">
                <ArrowRight className="size-4" />
                رجوع
            </button>

            <PageHeader
                title={isEdit ? 'تعديل المهمة' : 'مهمة جديدة'}
                subtitle={isEdit ? existing?.code : 'أنشئ أمر عمل وأسنده إلى فني'}
            />

            <div className="space-y-5">
                {/* ── Customer ───────────────────────────────── */}
                <section className="card p-5">
                    <h2 className="mb-4 text-sm font-bold text-navy-800">العميل والموقع</h2>

                    <div className="space-y-4">
                        <Field label="العميل" required error={errors.customer_id}>
                            <div className="flex gap-2">
                                <Select
                                    value={form.customer_id}
                                    onChange={(event) =>
                                        // Drop the device too: it belongs to the
                                        // previous customer and the API would reject it.
                                        setForm((current) => ({
                                            ...current,
                                            customer_id: event.target.value,
                                            branch_id: '',
        asset_id: '',
                                        }))
                                    }
                                    className="flex-1"
                                >
                                    <option value="">— اختر العميل —</option>
                                    {customers?.data.map((customer) => (
                                        <option key={customer.id} value={customer.id}>
                                            {customer.name}
                                            {customer.company ? ` — ${customer.company}` : ''}
                                        </option>
                                    ))}
                                </Select>

                                <Button
                                    variant="secondary"
                                    icon={Plus}
                                    className="shrink-0"
                                    onClick={() => setCustomerFormOpen(true)}
                                >
                                    جديد
                                </Button>
                            </div>
                        </Field>

                        {/* Only worth asking when there is a choice to make.
                            An account with one site has nothing to pick. */}
                        {branches.length > 1 && (
                            <Field
                                label="الفرع"
                                error={errors.branch_id}
                                hint="يحدد وجهة الفني ومسئول الموقع"
                            >
                                <Select
                                    value={form.branch_id}
                                    onChange={(event) => set('branch_id')(event.target.value)}
                                >
                                    <option value="">— بدون فرع محدد —</option>
                                    {branches.map((branch) => (
                                        <option key={branch.id} value={branch.id}>
                                            {branch.name}
                                            {branch.address ? ` — ${branch.address}` : ''}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        )}

                        <Field
                            label="عنوان الموقع"
                            hint="اتركه فارغًا لاستخدام عنوان الفرع أو العميل."
                            error={errors.site_address}
                        >
                            <Textarea
                                value={form.site_address}
                                onChange={(event) => set('site_address')(event.target.value)}
                                rows={2}
                                placeholder="عنوان مختلف عن عنوان العميل (اختياري)"
                            />
                        </Field>
                    </div>
                </section>

                {/* ── Job ────────────────────────────────────── */}
                <section className="card p-5">
                    <h2 className="mb-4 text-sm font-bold text-navy-800">تفاصيل المهمة</h2>

                    <div className="space-y-4">
                        <Field label="عنوان المهمة" required error={errors.title}>
                            <Input
                                value={form.title}
                                onChange={(event) => set('title')(event.target.value)}
                                placeholder="مثال: صيانة دورية لجهاز UPS 20kVA"
                            />
                        </Field>

                        <Field label="الوصف" error={errors.description}>
                            <Textarea
                                value={form.description}
                                onChange={(event) => set('description')(event.target.value)}
                                placeholder="تفاصيل البلاغ أو المطلوب من الفني…"
                            />
                        </Field>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="النوع" required error={errors.type}>
                                <Select
                                    value={form.type}
                                    onChange={(event) => set('type')(event.target.value)}
                                >
                                    {Object.entries(TASK_TYPE).map(([value, meta]) => (
                                        <option key={value} value={value}>
                                            {meta.label}
                                        </option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="الأولوية" required error={errors.priority}>
                                <Select
                                    value={form.priority}
                                    onChange={(event) => set('priority')(event.target.value)}
                                >
                                    {Object.entries(PRIORITY).map(([value, meta]) => (
                                        <option key={value} value={value}>
                                            {meta.label}
                                        </option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="الموعد المحدد" error={errors.scheduled_at}>
                                <Input
                                    type="datetime-local"
                                    value={form.scheduled_at}
                                    onChange={(event) => set('scheduled_at')(event.target.value)}
                                    dir="ltr"
                                />
                            </Field>
                        </div>
                    </div>
                </section>

                {/* ── Device ─────────────────────────────────── */}
                <section className="card p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-bold text-navy-800">الجهاز (اختياري)</h2>
                        {form.customer_id && (
                            <button
                                type="button"
                                onClick={() => setAssetFormOpen(true)}
                                className="text-xs font-bold text-brand-600 hover:underline"
                            >
                                + تسجيل جهاز جديد
                            </button>
                        )}
                    </div>

                    {!form.customer_id ? (
                        <p className="text-sm text-navy-400">اختر العميل أولًا لعرض أجهزته.</p>
                    ) : (
                        <>
                            <Field label="اختر الجهاز" error={errors.asset_id}>
                                <Select
                                    value={form.asset_id}
                                    onChange={(event) => set('asset_id')(event.target.value)}
                                >
                                    <option value="">— بدون جهاز محدد —</option>
                                    {customerAssets.map((asset) => (
                                        <option key={asset.id} value={asset.id}>
                                            {asset.label}
                                            {asset.serial ? ` — ${asset.serial}` : ''}
                                        </option>
                                    ))}
                                </Select>
                            </Field>

                            {customerAssets.length === 0 && (
                                <p className="mt-2 text-xs text-navy-400">
                                    لا توجد أجهزة مسجّلة لهذا العميل بعد.
                                </p>
                            )}

                            {selectedAsset && (
                                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-navy-50 p-3">
                                    <span className="tabular text-[11px] font-bold text-brand-600">
                                        {selectedAsset.code}
                                    </span>
                                    {/* Warranty decides whether the visit is billable, so
                                        surface it before the job is even created. */}
                                    <span className={clsx('badge', warrantyChip(selectedAsset.under_warranty))}>
                                        ضمان: {selectedAsset.warranty_label}
                                    </span>
                                    {selectedAsset.capacity && (
                                        <span className="text-xs text-navy-500">{selectedAsset.capacity}</span>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </section>

                {/* ── Assignment ─────────────────────────────── */}
                <section className="card p-5">
                    <h2 className="mb-4 text-sm font-bold text-navy-800">الإسناد</h2>

                    <Field
                        label="الفني"
                        hint="سيصله إشعار على التطبيق وبريد إلكتروني فور الإسناد."
                        error={errors.assigned_to}
                    >
                        <Select
                            value={form.assigned_to}
                            onChange={(event) => set('assigned_to')(event.target.value)}
                        >
                            <option value="">— بدون إسناد —</option>
                            {technicians?.map((technician) => (
                                <option key={technician.id} value={technician.id}>
                                    {technician.name} ({technician.open_tasks_count ?? 0} مهمة مفتوحة)
                                </option>
                            ))}
                        </Select>
                    </Field>
                </section>

                <div className="flex justify-end gap-2 pb-4">
                    <Button variant="secondary" onClick={() => navigate(-1)} disabled={pending}>
                        إلغاء
                    </Button>
                    <Button icon={Save} loading={pending} onClick={handleSubmit}>
                        {isEdit ? 'حفظ التعديلات' : 'إنشاء المهمة'}
                    </Button>
                </div>
            </div>

            <CustomerForm
                open={customerFormOpen}
                onClose={() => setCustomerFormOpen(false)}
                onSaved={(customer: Customer) => set('customer_id')(String(customer.id))}
            />

            {assetFormOpen && (
                <AssetForm
                    open={assetFormOpen}
                    onClose={() => setAssetFormOpen(false)}
                    customerId={Number(form.customer_id)}
                    // Select it straight away — the manager opened this dialog
                    // because it is the device the job is about.
                    onSaved={(asset: Asset) => set('asset_id')(String(asset.id))}
                />
            )}
        </>
    )
}

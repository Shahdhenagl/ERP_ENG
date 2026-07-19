import { ArrowRight, MessageCircle, Plus, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CustomerForm } from '@/components/CustomerForm'
import { useToast } from '@/components/Toast'
import { Button, ErrorState, Field, Input, PageHeader, PageLoader, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { PRIORITY, TASK_TYPE } from '@/lib/domain'
import { toDateTimeLocal } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useCreateTask, useCustomers, useTask, useTechnicians, useUpdateTask } from '@/lib/queries'
import type { Customer, Task, TaskPriority, TaskType } from '@/types'

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

    const [form, setForm] = useState({
        customer_id: '',
        assigned_to: '',
        title: '',
        description: '',
        type: 'maintenance' as TaskType,
        priority: 'normal' as TaskPriority,
        scheduled_at: '',
        site_address: '',
        device_brand: '',
        device_model: '',
        device_serial: '',
        device_capacity: '',
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
            device_brand: existing.device.brand ?? '',
            device_model: existing.device.model ?? '',
            device_serial: existing.device.serial ?? '',
            device_capacity: existing.device.capacity ?? '',
        })
    }, [existing])

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

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
            device_brand: form.device_brand || null,
            device_model: form.device_model || null,
            device_serial: form.device_serial || null,
            device_capacity: form.device_capacity || null,
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
                                    device_serial: '',
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
                                    onChange={(event) => set('customer_id')(event.target.value)}
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

                        <Field
                            label="عنوان الموقع"
                            hint="اتركه فارغًا لاستخدام عنوان العميل المسجل."
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
                    <h2 className="mb-4 text-sm font-bold text-navy-800">بيانات الجهاز (اختياري)</h2>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="الماركة" error={errors.device_brand}>
                            <Input
                                value={form.device_brand}
                                onChange={(event) => set('device_brand')(event.target.value)}
                                placeholder="APC / Eaton / Vertiv…"
                            />
                        </Field>

                        <Field label="الموديل" error={errors.device_model}>
                            <Input
                                value={form.device_model}
                                onChange={(event) => set('device_model')(event.target.value)}
                            />
                        </Field>

                        <Field label="القدرة" error={errors.device_capacity}>
                            <Input
                                value={form.device_capacity}
                                onChange={(event) => set('device_capacity')(event.target.value)}
                                placeholder="20 kVA"
                            />
                        </Field>

                        <Field label="الرقم التسلسلي" error={errors.device_serial}>
                            <Input
                                value={form.device_serial}
                                onChange={(event) => set('device_serial')(event.target.value)}
                                dir="ltr"
                                className="text-left"
                            />
                        </Field>
                    </div>
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
        </>
    )
}

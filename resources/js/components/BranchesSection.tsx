import { MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
    Button,
    EmptyState,
    Field,
    Input,
    Select,
    SkeletonCard,
    Textarea,
} from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { EGYPT_GOVERNORATES, formatMoney } from '@/lib/domain'
import { useCustomerBranches, useDeleteBranch, useSaveBranch } from '@/lib/queries'
import type { Branch } from '@/types'

/**
 * A customer's sites across the country. Devices sit at one, jobs are sent to
 * one — so a bank is one account with a branch in Maadi and another in Aswan,
 * each with its own address, contact and working hours.
 */
export function BranchesSection({ customerId }: { customerId: number }) {
    const { data: branches, isLoading } = useCustomerBranches(customerId)
    const [editing, setEditing] = useState<Branch | null>(null)
    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState<Branch | null>(null)

    const remove = useDeleteBranch()
    const toast = useToast()

    return (
        <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-navy-400" />
                    <h2 className="text-sm font-bold text-navy-800">المواقع والفروع</h2>
                    <span className="tabular text-[11px] font-semibold text-navy-400">
                        {branches?.length ?? 0}
                    </span>
                </div>
                <Button icon={Plus} className="text-xs" onClick={() => setCreating(true)}>
                    أضف فرعًا
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !branches?.length ? (
                <EmptyState
                    icon={MapPin}
                    title="لا توجد فروع"
                    description="أضف مواقع العميل في أنحاء مصر ليُسند إليها العمل ويظهر خط سيرها للفني."
                />
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {branches.map((branch) => (
                        <div key={branch.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {branch.code}
                                        </span>
                                        {!branch.is_active && (
                                            <span className="badge bg-navy-100 text-navy-500">موقوف</span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 truncate text-sm font-bold text-navy-900">
                                        {branch.name}
                                        {branch.customer_ref && (
                                            <span className="tabular mr-1.5 text-[11px] font-normal text-navy-400">
                                                {branch.customer_ref}
                                            </span>
                                        )}
                                    </p>
                                    {branch.address && (
                                        <p className="mt-0.5 flex items-start gap-1 text-[11px] text-navy-500">
                                            <MapPin className="mt-0.5 size-3 shrink-0 text-navy-300" />
                                            <span className="truncate">{branch.address}</span>
                                        </p>
                                    )}
                                    {branch.contact_phone && (
                                        <p className="tabular mt-0.5 flex items-center gap-1 text-[11px] text-navy-400">
                                            <Phone className="size-3 text-navy-300" />
                                            {branch.contact_phone}
                                            {branch.contact_name && ` · ${branch.contact_name}`}
                                        </p>
                                    )}
                                </div>

                                <div className="flex shrink-0 gap-0.5">
                                    <button
                                        onClick={() => setEditing(branch)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="تعديل"
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(branch)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {(creating || editing) && (
                <BranchForm
                    customerId={customerId}
                    branch={editing ?? undefined}
                    onClose={() => {
                        setCreating(false)
                        setEditing(null)
                    }}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                onConfirm={async () => {
                    if (!deleting) return
                    try {
                        await remove.mutateAsync(deleting.id)
                        toast.success('تم حذف الفرع.')
                        setDeleting(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر حذف الفرع.'))
                    }
                }}
                title="حذف الفرع"
                message={`سيتم حذف «${deleting?.name}». الأجهزة والمهام المرتبطة به تبقى دون فرع.`}
                confirmLabel="حذف"
                danger
                loading={remove.isPending}
            />
        </section>
    )
}

function BranchForm({
    customerId,
    branch,
    onClose,
}: {
    customerId: number
    branch?: Branch
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveBranch(customerId, branch?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: branch?.name ?? '',
        customer_ref: branch?.customer_ref ?? '',
        city: branch?.city ?? '',
        address: branch?.address ?? '',
        map_url: branch?.map_url ?? '',
        contact_name: branch?.contact_name ?? '',
        contact_phone: branch?.contact_phone ?? '',
        contact_whatsapp: branch?.contact_whatsapp ?? '',
        working_hours: branch?.working_hours ?? '',
        notes: branch?.notes ?? '',
        is_active: branch?.is_active ?? true,
    })

    // خط السير — legs and their fares, plus allowance and lodging.
    const [legs, setLegs] = useState<Array<{ label: string; cost: string }>>(
        branch?.route?.legs?.map((leg) => ({ label: leg.label, cost: String(leg.cost ?? '') })) ?? [],
    )
    const [allowance, setAllowance] = useState(String(branch?.route?.allowance ?? ''))
    const [lodging, setLodging] = useState(String(branch?.route?.lodging ?? ''))

    const set = (key: keyof typeof form) => (value: string | boolean) =>
        setForm((current) => ({ ...current, [key]: value }))

    const routeTotal =
        legs.reduce((sum, leg) => sum + (Number(leg.cost) || 0), 0) +
        (Number(allowance) || 0) +
        (Number(lodging) || 0)

    const handleSave = async () => {
        setErrors({})

        const cleanLegs = legs
            .filter((leg) => leg.label.trim())
            .map((leg) => ({ label: leg.label.trim(), cost: leg.cost === '' ? null : Number(leg.cost) }))

        const hasRoute = cleanLegs.length > 0 || allowance !== '' || lodging !== ''

        try {
            await save.mutateAsync({
                ...form,
                customer_ref: form.customer_ref || null,
                city: form.city || null,
                address: form.address || null,
                map_url: form.map_url || null,
                contact_name: form.contact_name || null,
                contact_phone: form.contact_phone || null,
                contact_whatsapp: form.contact_whatsapp || null,
                working_hours: form.working_hours || null,
                route: hasRoute
                    ? {
                          legs: cleanLegs,
                          allowance: allowance === '' ? null : Number(allowance),
                          lodging: lodging === '' ? null : Number(lodging),
                      }
                    : null,
                notes: form.notes || null,
            })
            toast.success(branch ? 'تم تحديث الفرع.' : 'تمت إضافة الفرع.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ الفرع.'))
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={branch ? `تعديل ${branch.name}` : 'فرع جديد'}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button loading={save.isPending} onClick={handleSave}>
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم الفرع" required error={errors.name}>
                        <Input value={form.name} onChange={(e) => set('name')(e.target.value)} autoFocus placeholder="فرع المعادي" />
                    </Field>
                    <Field label="مرجع العميل" error={errors.customer_ref} hint="رقم الفرع لدى العميل">
                        <Input value={form.customer_ref} onChange={(e) => set('customer_ref')(e.target.value)} />
                    </Field>
                    <Field label="المحافظة" error={errors.city}>
                        <Select value={form.city} onChange={(e) => set('city')(e.target.value)}>
                            <option value="">— اختر المحافظة —</option>
                            {/* Keep an old free-text value selectable so editing
                                never silently drops it. */}
                            {form.city && !EGYPT_GOVERNORATES.includes(form.city as never) && (
                                <option value={form.city}>{form.city}</option>
                            )}
                            {EGYPT_GOVERNORATES.map((gov) => (
                                <option key={gov} value={gov}>
                                    {gov}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="ساعات العمل" error={errors.working_hours} hint="٩ص - ٥م، الجمعة مغلق">
                        <Input value={form.working_hours} onChange={(e) => set('working_hours')(e.target.value)} />
                    </Field>
                </div>

                <Field label="العنوان" error={errors.address}>
                    <Textarea value={form.address} onChange={(e) => set('address')(e.target.value)} />
                </Field>

                <Field label="رابط الخريطة" error={errors.map_url} hint="الصق رابط الموقع من خرائط Google">
                    <Input value={form.map_url} onChange={(e) => set('map_url')(e.target.value)} dir="ltr" className="text-left" />
                </Field>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="مسؤول الموقع" error={errors.contact_name}>
                        <Input value={form.contact_name} onChange={(e) => set('contact_name')(e.target.value)} />
                    </Field>
                    <Field label="هاتف الموقع" error={errors.contact_phone}>
                        <Input value={form.contact_phone} onChange={(e) => set('contact_phone')(e.target.value)} dir="ltr" className="text-left" inputMode="tel" />
                    </Field>
                    <Field label="واتساب الموقع" error={errors.contact_whatsapp}>
                        <Input value={form.contact_whatsapp} onChange={(e) => set('contact_whatsapp')(e.target.value)} dir="ltr" className="text-left" inputMode="tel" />
                    </Field>
                </div>

                {/* ── خط السير ───────────────────────────── */}
                <section className="rounded-xl border border-navy-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-navy-800">خط السير وتكاليفه</h3>
                        <Button
                            variant="ghost"
                            icon={Plus}
                            className="text-xs"
                            onClick={() => setLegs((current) => [...current, { label: '', cost: '' }])}
                        >
                            محطة
                        </Button>
                    </div>

                    {legs.length === 0 ? (
                        <p className="rounded-lg bg-navy-50 px-3 py-2 text-[11px] text-navy-400">
                            أضف محطات الرحلة (إلى رمسيس، إلى الفرع…) وتكلفة كل محطة.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {legs.map((leg, index) => (
                                <div key={index} className="flex gap-2">
                                    <Input
                                        value={leg.label}
                                        onChange={(e) =>
                                            setLegs((current) =>
                                                current.map((row, i) =>
                                                    i === index ? { ...row, label: e.target.value } : row,
                                                ),
                                            )
                                        }
                                        placeholder="إلى رمسيس"
                                        className="flex-1"
                                    />
                                    <Input
                                        type="number"
                                        min={0}
                                        value={leg.cost}
                                        onChange={(e) =>
                                            setLegs((current) =>
                                                current.map((row, i) =>
                                                    i === index ? { ...row, cost: e.target.value } : row,
                                                ),
                                            )
                                        }
                                        placeholder="0"
                                        dir="ltr"
                                        className="w-24 text-center"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setLegs((current) => current.filter((_, i) => i !== index))}
                                        className="tap grid shrink-0 place-items-center rounded-xl px-3 text-red-500 transition hover:bg-red-50"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <Field label="بدل">
                            <Input type="number" min={0} value={allowance} onChange={(e) => setAllowance(e.target.value)} dir="ltr" className="text-left" placeholder="0" />
                        </Field>
                        <Field label="مبيت (فندق/شقة)">
                            <Input type="number" min={0} value={lodging} onChange={(e) => setLodging(e.target.value)} dir="ltr" className="text-left" placeholder="0" />
                        </Field>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
                        <span className="text-xs font-bold text-brand-700">قيمة العهدة المتوقعة</span>
                        <span className="tabular text-sm font-extrabold text-brand-800">
                            {formatMoney(routeTotal)}
                        </span>
                    </div>
                </section>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-200 px-4 py-3 transition hover:bg-navy-50">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => set('is_active')(e.target.checked)}
                        className="size-4.5 accent-brand-500"
                    />
                    <span className="text-sm font-semibold text-navy-700">الفرع نشط ويمكن إسناد العمل إليه</span>
                </label>
            </div>
        </Modal>
    )
}

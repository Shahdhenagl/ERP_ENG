import { MapPin, Save, Trash2 } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Textarea } from '@/components/ui'
import { LocationSelect } from '@/components/LocationSelect'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useSaveBranch } from '@/lib/queries'
import type { Branch } from '@/types'

export function BranchForm({
    open,
    onClose,
    customerId,
    branch,
    onSaved,
}: {
    open: boolean
    onClose: () => void
    customerId: number
    branch?: Branch
    onSaved?: (branch: Branch) => void
}) {
    const toast = useToast()
    const save = useSaveBranch(customerId, branch?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: branch?.name ?? '',
        customer_ref: branch?.customer_ref ?? '',
        address: branch?.address ?? '',
        governorate: branch?.governorate ?? '',
        city: branch?.city ?? '',
        lat: branch?.lat?.toString() ?? '',
        lng: branch?.lng?.toString() ?? '',
        map_url: branch?.map_url ?? '',
        contact_name: branch?.contact_name ?? '',
        contact_phone: branch?.contact_phone ?? '',
        contact_whatsapp: branch?.contact_whatsapp ?? '',
        working_hours: branch?.working_hours ?? '',
        notes: branch?.notes ?? '',
        is_active: branch?.is_active ?? true,
    })

    // The expected route: the stations on the way with their fares, plus the
    // daily allowance and any lodging. The technician confirms the actual cost
    // against this on the job.
    const [legs, setLegs] = useState<Array<{ label: string; cost: string }>>(
        (branch?.route?.legs ?? []).map((leg) => ({
            label: leg.label,
            cost: leg.cost != null ? String(leg.cost) : '',
        })),
    )
    const [allowance, setAllowance] = useState(
        branch?.route?.allowance ? String(branch.route.allowance) : '',
    )
    const [lodging, setLodging] = useState(branch?.route?.lodging ? String(branch.route.lodging) : '')

    const set = (key: keyof typeof form) => (value: string | boolean) =>
        setForm((current) => ({ ...current, [key]: value }))

    /** Pull coordinates out of a pasted Google Maps link when possible. */
    const parseMapUrl = (url: string) => {
        set('map_url')(url)

        const match =
            url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ??
            url.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
            url.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)

        if (match) {
            setForm((current) => ({ ...current, lat: match[1], lng: match[2] }))
            toast.info('تم استخراج الإحداثيات من الرابط.')
        }
    }

    const useMyLocation = () => {
        if (!navigator.geolocation) {
            toast.error('المتصفح لا يدعم تحديد الموقع.')

            return
        }

        navigator.geolocation.getCurrentPosition(
            (position) =>
                setForm((current) => ({
                    ...current,
                    lat: position.coords.latitude.toFixed(7),
                    lng: position.coords.longitude.toFixed(7),
                })),
            () => toast.error('تعذّر تحديد الموقع.'),
            { enableHighAccuracy: true, timeout: 8000 },
        )
    }

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                name: form.name,
                customer_ref: form.customer_ref || null,
                address: form.address || null,
                governorate: form.governorate || null,
                city: form.city || null,
                lat: form.lat ? Number(form.lat) : null,
                lng: form.lng ? Number(form.lng) : null,
                map_url: form.map_url || null,
                contact_name: form.contact_name || null,
                contact_phone: form.contact_phone || null,
                contact_whatsapp: form.contact_whatsapp || null,
                working_hours: form.working_hours || null,
                route:
                    legs.some((leg) => leg.label.trim()) || allowance || lodging
                        ? {
                              legs: legs
                                  .filter((leg) => leg.label.trim())
                                  .map((leg) => ({
                                      label: leg.label.trim(),
                                      cost: Number(leg.cost) || 0,
                                  })),
                              allowance: Number(allowance) || 0,
                              lodging: Number(lodging) || 0,
                          }
                        : null,
                notes: form.notes || null,
                is_active: form.is_active,
            })

            toast.success(branch ? 'تم تعديل الفرع.' : 'تم إضافة الفرع.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ الفرع.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={branch ? `تعديل ${branch.name}` : 'فرع جديد'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button icon={Save} onClick={handleSave} loading={save.isPending}>
                        {tr('حفظ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم الفرع" required error={errors.name}>
                        <Input
                            value={form.name}
                            onChange={(e) => set('name')(e.target.value)}
                            placeholder="فرع المعادي"
                        />
                    </Field>

                    <Field
                        label="كود الفرع عند العميل"
                        error={errors.customer_ref}
                        hint="رقمه في نظامهم — سيطلبونه على الفاتورة"
                    >
                        <Input
                            value={form.customer_ref}
                            onChange={(e) => set('customer_ref')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <Field label="العنوان" error={errors.address}>
                    <Textarea
                        value={form.address}
                        onChange={(e) => set('address')(e.target.value)}
                        rows={2}
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <LocationSelect
                        governorate={form.governorate}
                        district={form.city}
                        onGovernorate={set('governorate')}
                        onDistrict={set('city')}
                        errors={{ governorate: errors.governorate, city: errors.city }}
                    />
                </div>

                <Field
                    label="رابط الموقع على الخريطة"
                    error={errors.map_url}
                    hint="الصق رابط جوجل مابس وسنستخرج الإحداثيات"
                >
                    <Input
                        value={form.map_url}
                        onChange={(e) => parseMapUrl(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="خط العرض" error={errors.lat}>
                        <Input
                            value={form.lat}
                            onChange={(e) => set('lat')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="خط الطول" error={errors.lng}>
                        <Input
                            value={form.lng}
                            onChange={(e) => set('lng')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <div className="flex items-end">
                        <Button
                            variant="secondary"
                            icon={MapPin}
                            onClick={useMyLocation}
                            className="w-full text-xs"
                        >
                            {tr('موقعي الحالي')}
                        </Button>
                    </div>
                </div>

                {/* The person the technician meets, not head office. */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="مسئول الفرع" error={errors.contact_name}>
                        <Input
                            value={form.contact_name}
                            onChange={(e) => set('contact_name')(e.target.value)}
                        />
                    </Field>

                    <Field label="هاتف المسئول" error={errors.contact_phone}>
                        <Input
                            value={form.contact_phone}
                            onChange={(e) => set('contact_phone')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>

                    <Field label="واتساب المسئول" error={errors.contact_whatsapp}>
                        <Input
                            value={form.contact_whatsapp}
                            onChange={(e) => set('contact_whatsapp')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>

                    <Field
                        label="مواعيد العمل"
                        error={errors.working_hours}
                        hint="نص حر — يقرأه المرسِل قبل الجدولة"
                    >
                        <Input
                            value={form.working_hours}
                            onChange={(e) => set('working_hours')(e.target.value)}
                            placeholder="٩ ص - ٥ م، الجمعة مغلق"
                        />
                    </Field>
                </div>

                {/* ── Route: the expected fare per station ─────── */}
                <div className="rounded-2xl border border-navy-100 bg-navy-50/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-navy-800">خط السير</h3>
                            <p className="text-[11px] text-navy-400">
                                {tr('التكلفة المتوقعة لكل محطة — يؤكّدها الفني أو يعدّلها عند التنفيذ.')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setLegs((current) => [...current, { label: '', cost: '' }])}
                            className="tap rounded-lg bg-navy-100 px-3 py-1.5 text-xs font-bold text-navy-700"
                        >
                            {tr('إضافة محطة')}
                        </button>
                    </div>

                    <div className="space-y-2">
                        {legs.map((leg, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    value={leg.label}
                                    placeholder="إلى الفرع / محطة"
                                    onChange={(e) =>
                                        setLegs((current) =>
                                            current.map((l, i) =>
                                                i === index ? { ...l, label: e.target.value } : l,
                                            ),
                                        )
                                    }
                                    className="flex-1"
                                />
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={leg.cost}
                                    placeholder="التكلفة"
                                    onChange={(e) =>
                                        setLegs((current) =>
                                            current.map((l, i) =>
                                                i === index ? { ...l, cost: e.target.value } : l,
                                            ),
                                        )
                                    }
                                    dir="ltr"
                                    className="w-28 text-left"
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setLegs((current) => current.filter((_, i) => i !== index))
                                    }
                                    className="tap grid size-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"
                                    aria-label="حذف"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <Field label="بدل">
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={allowance}
                                onChange={(e) => setAllowance(e.target.value)}
                                dir="ltr"
                                className="text-left"
                            />
                        </Field>
                        <Field label="مبيت">
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={lodging}
                                onChange={(e) => setLodging(e.target.value)}
                                dir="ltr"
                                className="text-left"
                            />
                        </Field>
                    </div>
                </div>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        value={form.notes}
                        onChange={(e) => set('notes')(e.target.value)}
                        rows={2}
                    />
                </Field>

                <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => set('is_active')(e.target.checked)}
                        className="size-4 rounded border-navy-300"
                    />
                    {tr('فرع نشط')}
                </label>
            </div>
        </Modal>
    )
}

import { MapPin, Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Textarea } from '@/components/ui'
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
                city: form.city || null,
                lat: form.lat ? Number(form.lat) : null,
                lng: form.lng ? Number(form.lng) : null,
                map_url: form.map_url || null,
                contact_name: form.contact_name || null,
                contact_phone: form.contact_phone || null,
                contact_whatsapp: form.contact_whatsapp || null,
                working_hours: form.working_hours || null,
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
                        إلغاء
                    </Button>
                    <Button icon={Save} onClick={handleSave} loading={save.isPending}>
                        حفظ
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
                            موقعي الحالي
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
                    فرع نشط
                </label>
            </div>
        </Modal>
    )
}

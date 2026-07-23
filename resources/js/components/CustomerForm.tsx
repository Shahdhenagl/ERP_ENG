import { MapPin, Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useSaveCustomer } from '@/lib/queries'
import { CUSTOMER_TYPES, type Customer } from '@/types'

interface CustomerFormProps {
    open: boolean
    onClose: () => void
    customer?: Customer
    /** Called with the saved record — lets the task form auto-select it. */
    onSaved?: (customer: Customer) => void
}

export function CustomerForm({ open, onClose, customer, onSaved }: CustomerFormProps) {
    const toast = useToast()
    const save = useSaveCustomer(customer?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: customer?.name ?? '',
        company: customer?.company ?? '',
        type: customer?.type ?? '',
        phone: customer?.phone ?? '',
        whatsapp: customer?.whatsapp ?? '',
        email: customer?.email ?? '',
        address: customer?.address ?? '',
        city: customer?.city ?? '',
        lat: customer?.lat?.toString() ?? '',
        lng: customer?.lng?.toString() ?? '',
        map_url: customer?.map_url ?? '',
        notes: customer?.notes ?? '',
        is_active: customer ? customer.is_active : true,
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    /** Pull coordinates out of a pasted Google Maps link when possible. */
    const parseMapUrl = (url: string) => {
        set('map_url')(url)

        const match =
            url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ??
            url.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
            url.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)

        if (match) {
            set('lat')(match[1])
            set('lng')(match[2])
            toast.info('تم استخراج الإحداثيات من الرابط.')
        }
    }

    const useMyLocation = () => {
        if (!navigator.geolocation) {
            toast.error('المتصفح لا يدعم تحديد الموقع.')

            return
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                set('lat')(position.coords.latitude.toFixed(7))
                set('lng')(position.coords.longitude.toFixed(7))
                toast.success('تم تسجيل الموقع الحالي.')
            },
            () => toast.error('تعذّر تحديد الموقع.'),
            { enableHighAccuracy: true, timeout: 8000 },
        )
    }

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                ...form,
                lat: form.lat === '' ? null : Number(form.lat),
                lng: form.lng === '' ? null : Number(form.lng),
                company: form.company || null,
                type: form.type || null,
                whatsapp: form.whatsapp || null,
                email: form.email || null,
                address: form.address || null,
                city: form.city || null,
                map_url: form.map_url || null,
                notes: form.notes || null,
            })

            toast.success(customer ? 'تم تحديث بيانات العميل.' : 'تم إضافة العميل.')
            onSaved?.(saved as Customer)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ العميل.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={customer ? 'تعديل بيانات العميل' : 'عميل جديد'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button icon={Save} loading={save.isPending} onClick={handleSave}>
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم العميل" required error={errors.name}>
                        <Input
                            value={form.name}
                            onChange={(event) => set('name')(event.target.value)}
                            placeholder="اسم الشخص أو الجهة"
                            autoFocus
                        />
                    </Field>

                    <Field label="الشركة" error={errors.company}>
                        <Input
                            value={form.company}
                            onChange={(event) => set('company')(event.target.value)}
                            placeholder="اسم الشركة (اختياري)"
                        />
                    </Field>

                    <Field label="نوع المؤسسة" error={errors.type}>
                        <Select
                            value={form.type}
                            onChange={(event) => set('type')(event.target.value)}
                        >
                            <option value="">— غير محدد —</option>
                            {Object.entries(CUSTOMER_TYPES).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="الحالة" error={errors.is_active}>
                        <Select
                            value={form.is_active ? '1' : '0'}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, is_active: event.target.value === '1' }))
                            }
                        >
                            <option value="1">نشط</option>
                            <option value="0">غير نشط</option>
                        </Select>
                    </Field>

                    <Field label="رقم الهاتف" required error={errors.phone}>
                        <Input
                            value={form.phone}
                            onChange={(event) => set('phone')(event.target.value)}
                            placeholder="01xxxxxxxxx"
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>

                    <Field
                        label="رقم واتساب"
                        hint="اتركه فارغًا لاستخدام رقم الهاتف."
                        error={errors.whatsapp}
                    >
                        <Input
                            value={form.whatsapp}
                            onChange={(event) => set('whatsapp')(event.target.value)}
                            placeholder="01xxxxxxxxx"
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>

                    <Field label="البريد الإلكتروني" error={errors.email}>
                        <Input
                            type="email"
                            value={form.email}
                            onChange={(event) => set('email')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="المدينة / المحافظة" error={errors.city}>
                        <Input
                            value={form.city}
                            onChange={(event) => set('city')(event.target.value)}
                        />
                    </Field>
                </div>

                <Field label="العنوان التفصيلي" error={errors.address}>
                    <Textarea
                        value={form.address}
                        onChange={(event) => set('address')(event.target.value)}
                        placeholder="الشارع، المنطقة، علامة مميزة…"
                        rows={2}
                    />
                </Field>

                {/* ── Location ───────────────────────────────── */}
                <div className="rounded-2xl border border-navy-100 bg-navy-50/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-navy-800">الموقع على الخريطة</h3>
                        <Button variant="ghost" icon={MapPin} className="text-xs" onClick={useMyLocation}>
                            موقعي الحالي
                        </Button>
                    </div>

                    <Field
                        label="رابط جوجل ماب"
                        hint="الصق الرابط وسيتم استخراج الإحداثيات تلقائيًا إن وُجدت."
                        error={errors.map_url}
                        className="mb-3"
                    >
                        <Input
                            value={form.map_url}
                            onChange={(event) => parseMapUrl(event.target.value)}
                            placeholder="https://maps.google.com/…"
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="خط العرض (Lat)" error={errors.lat}>
                            <Input
                                value={form.lat}
                                onChange={(event) => set('lat')(event.target.value)}
                                placeholder="30.0444"
                                dir="ltr"
                                className="text-left"
                                inputMode="decimal"
                            />
                        </Field>

                        <Field label="خط الطول (Lng)" error={errors.lng}>
                            <Input
                                value={form.lng}
                                onChange={(event) => set('lng')(event.target.value)}
                                placeholder="31.2357"
                                dir="ltr"
                                className="text-left"
                                inputMode="decimal"
                            />
                        </Field>
                    </div>
                </div>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        value={form.notes}
                        onChange={(event) => set('notes')(event.target.value)}
                        rows={2}
                    />
                </Field>
            </div>
        </Modal>
    )
}

import { MapPin, Plus, Save, Trash2 } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { LocationSelect } from '@/components/LocationSelect'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useCustomerContacts, useDeleteContact, useSaveContact, useSaveCustomer } from '@/lib/queries'
import { CUSTOMER_TYPES, type Contact, type Customer } from '@/types'

interface CustomerFormProps {
    open: boolean
    onClose: () => void
    customer?: Customer
    /** Called with the saved record — lets the task form auto-select it. */
    onSaved?: (customer: Customer) => void
}

interface ContactDraft {
    id?: number
    name: string
    job_title: string
    phone: string
    email: string
    is_primary: boolean
    is_active: boolean
}

const emptyContact = (): ContactDraft => ({
    name: '',
    job_title: '',
    phone: '',
    email: '',
    is_primary: false,
    is_active: true,
})

const contactDraft = (contact: Contact): ContactDraft => ({
    id: contact.id,
    name: contact.name,
    job_title: contact.job_title ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    is_primary: contact.is_primary,
    is_active: contact.is_active,
})

export function CustomerForm({ open, onClose, customer, onSaved }: CustomerFormProps) {
    const toast = useToast()
    const save = useSaveCustomer(customer?.id)
    const saveContact = useSaveContact()
    const deleteContact = useDeleteContact()
    const { data: existingContacts } = useCustomerContacts(customer?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [contactRows, setContactRows] = useState<ContactDraft[]>([])
    const [removedContactIds, setRemovedContactIds] = useState<number[]>([])
    const [contactsInitializedFor, setContactsInitializedFor] = useState<number | null>(null)

    useEffect(() => {
        if (!customer) {
            setContactRows([])
            setRemovedContactIds([])
            setContactsInitializedFor(null)
            return
        }

        if (existingContacts && contactsInitializedFor !== customer.id) {
            setContactRows(existingContacts.map(contactDraft))
            setRemovedContactIds([])
            setContactsInitializedFor(customer.id)
        }
    }, [customer?.id, existingContacts, contactsInitializedFor])

    const updateContact = (index: number, key: keyof ContactDraft, value: string | boolean) => {
        setContactRows((current) =>
            current.map((row, rowIndex) => {
                if (rowIndex !== index) {
                    return key === 'is_primary' && value === true ? { ...row, is_primary: false } : row
                }

                return { ...row, [key]: value }
            }),
        )
    }

    const removeContactRow = (index: number) => {
        setContactRows((current) => {
            const row = current[index]
            if (row?.id) {
                setRemovedContactIds((ids) => (ids.includes(row.id!) ? ids : [...ids, row.id!]))
            }
            return current.filter((_, rowIndex) => rowIndex !== index)
        })
    }

    const [form, setForm] = useState({
        name: customer?.name ?? '',
        name_en: customer?.name_en ?? '',
        company: customer?.company ?? '',
        type: customer?.type ?? '',
        payment_terms: customer?.payment_terms ?? 'cash',
        phone: customer?.phone ?? '',
        whatsapp: customer?.whatsapp ?? '',
        email: customer?.email ?? '',
        tax_id: customer?.tax_id ?? '',
        commercial_register: customer?.commercial_register ?? '',
        address: customer?.address ?? '',
        governorate: customer?.governorate ?? '',
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

    const isSaving = save.isPending || saveContact.isPending || deleteContact.isPending

    const handleSave = async () => {
        setErrors({})

        const incompleteContact = contactRows.find((row) =>
            !row.name.trim() && [row.job_title, row.phone, row.email].some((value) => value.trim()),
        )
        if (incompleteContact) {
            setErrors({ contacts: 'اسم الشخص مطلوب عند إدخال الوظيفة أو الهاتف أو البريد.' })
            toast.error('أكمل اسم جهة الاتصال أو احذف الصف الفارغ.')
            return
        }

        try {
            const saved = await save.mutateAsync({
                ...form,
                lat: form.lat === '' ? null : Number(form.lat),
                lng: form.lng === '' ? null : Number(form.lng),
                name_en: form.name_en || null,
                company: form.company || null,
                type: form.type || null,
                payment_terms: form.payment_terms,
                whatsapp: form.whatsapp || null,
                email: form.email || null,
                tax_id: form.tax_id || null,
                commercial_register: form.commercial_register || null,
                address: form.address || null,
                governorate: form.governorate || null,
                city: form.city || null,
                map_url: form.map_url || null,
                notes: form.notes || null,
            })

            for (const id of removedContactIds) {
                await deleteContact.mutateAsync(id)
            }

            for (const contact of contactRows.filter((row) => row.name.trim())) {
                await saveContact.mutateAsync({
                    id: contact.id,
                    customer_id: saved.id,
                    name: contact.name.trim(),
                    job_title: contact.job_title.trim() || null,
                    phone: contact.phone.trim() || null,
                    email: contact.email.trim() || null,
                    is_primary: contact.is_primary,
                    is_active: contact.is_active,
                })
            }

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
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        {tr('إلغاء')}
                    </Button>
                    <Button icon={Save} loading={isSaving} onClick={handleSave}>
                        {tr('حفظ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم العميل (بالعربية)" required error={errors.name}>
                        <Input
                            value={form.name}
                            onChange={(event) => set('name')(event.target.value)}
                            placeholder="اسم الشخص أو الجهة"
                            autoFocus
                        />
                    </Field>

                    <Field label="الاسم بالإنجليزية" error={errors.name_en}>
                        <Input
                            value={form.name_en}
                            onChange={(event) => set('name_en')(event.target.value)}
                            placeholder="Customer name (English)"
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field
                        label="طريقة الدفع"
                        error={errors.payment_terms}
                        hint="آجل يعني يُفوتر ويُتابع تحصيله"
                    >
                        <Select
                            value={form.payment_terms}
                            onChange={(event) => set('payment_terms')(event.target.value)}
                        >
                            <option value="cash">نقدي</option>
                            <option value="credit">آجل</option>
                        </Select>
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

                    <LocationSelect
                        governorate={form.governorate}
                        district={form.city}
                        onGovernorate={set('governorate')}
                        onDistrict={set('city')}
                        errors={{ governorate: errors.governorate, city: errors.city }}
                    />

                    <Field label="البطاقة الضريبية" error={errors.tax_id}>
                        <Input
                            value={form.tax_id}
                            onChange={(event) => set('tax_id')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                            placeholder="الرقم الضريبي"
                        />
                    </Field>

                    <Field label="السجل التجاري" error={errors.commercial_register}>
                        <Input
                            value={form.commercial_register}
                            onChange={(event) => set('commercial_register')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <div className="rounded-2xl border border-navy-100 bg-navy-50/50 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-bold text-navy-800">أشخاص وبيانات الاتصال</h3>
                            <p className="mt-1 text-xs text-navy-400">أضف أكثر من شخص، ولكل شخص رقم هاتف وبريد إلكتروني ووظيفته.</p>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            icon={Plus}
                            className="text-xs"
                            onClick={() => setContactRows((current) => [...current, emptyContact()])}
                        >
                            إضافة شخص
                        </Button>
                    </div>

                    {contactRows.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-navy-200 bg-white/70 p-3 text-center text-xs text-navy-400">
                            لا توجد جهات اتصال إضافية. اضغط «إضافة شخص» لإضافة رقم أو بريد آخر.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {contactRows.map((contact, index) => (
                                <div
                                    key={contact.id ?? `new-contact-${index}`}
                                    className="rounded-xl border border-navy-100 bg-white p-3 shadow-sm"
                                >
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-navy-500">جهة اتصال {index + 1}</span>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                            onClick={() => removeContactRow(index)}
                                        >
                                            <Trash2 className="size-3.5" />
                                            حذف
                                        </button>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="اسم الشخص" required={Boolean(contact.job_title || contact.phone || contact.email)} error={errors.contacts}>
                                            <Input
                                                value={contact.name}
                                                onChange={(event) => updateContact(index, 'name', event.target.value)}
                                                placeholder="اسم المسؤول أو الشخص المتعامل"
                                            />
                                        </Field>
                                        <Field label="وظيفة الشخص">
                                            <Input
                                                value={contact.job_title}
                                                onChange={(event) => updateContact(index, 'job_title', event.target.value)}
                                                placeholder="مثل: مدير الصيانة"
                                            />
                                        </Field>
                                        <Field label="رقم الهاتف">
                                            <Input
                                                value={contact.phone}
                                                onChange={(event) => updateContact(index, 'phone', event.target.value)}
                                                placeholder="01xxxxxxxxx"
                                                dir="ltr"
                                                className="text-left"
                                                inputMode="tel"
                                            />
                                        </Field>
                                        <Field label="البريد الإلكتروني">
                                            <Input
                                                type="email"
                                                value={contact.email}
                                                onChange={(event) => updateContact(index, 'email', event.target.value)}
                                                dir="ltr"
                                                className="text-left"
                                            />
                                        </Field>
                                    </div>

                                    <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-navy-600">
                                        <input
                                            type="checkbox"
                                            checked={contact.is_primary}
                                            onChange={(event) => updateContact(index, 'is_primary', event.target.checked)}
                                            className="size-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
                                        />
                                        جهة الاتصال الأساسية
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}

                    {errors.contacts && <p className="mt-2 text-xs font-semibold text-red-600">{errors.contacts}</p>}
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
                            {tr('موقعي الحالي')}
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

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

import { Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useSaveSupplier } from '@/lib/queries'
import type { Supplier } from '@/types'

export function SupplierForm({
    open,
    onClose,
    supplier,
    onSaved,
}: {
    open: boolean
    onClose: () => void
    supplier?: Supplier
    onSaved?: (supplier: Supplier) => void
}) {
    const toast = useToast()
    const save = useSaveSupplier(supplier?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: supplier?.name ?? '',
        company: supplier?.company ?? '',
        phone: supplier?.phone ?? '',
        whatsapp: supplier?.whatsapp ?? '',
        email: supplier?.email ?? '',
        address: supplier?.address ?? '',
        tax_id: supplier?.tax_id ?? '',
        notes: supplier?.notes ?? '',
        is_active: supplier?.is_active ?? true,
    })

    const set = (key: keyof typeof form) => (value: string | boolean) =>
        setForm((current) => ({ ...current, [key]: value }))

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                name: form.name,
                company: form.company || null,
                phone: form.phone || null,
                whatsapp: form.whatsapp || null,
                email: form.email || null,
                address: form.address || null,
                tax_id: form.tax_id || null,
                notes: form.notes || null,
                is_active: form.is_active,
            })

            toast.success(supplier ? 'تم تعديل المورّد.' : 'تم إضافة المورّد.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ المورّد.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={supplier ? `تعديل ${supplier.code}` : 'مورّد جديد'}
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
                <Field label="اسم المورّد" required error={errors.name}>
                    <Input value={form.name} onChange={(e) => set('name')(e.target.value)} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الشركة" error={errors.company}>
                        <Input value={form.company} onChange={(e) => set('company')(e.target.value)} />
                    </Field>

                    <Field label="الرقم الضريبي" error={errors.tax_id}>
                        <Input
                            value={form.tax_id}
                            onChange={(e) => set('tax_id')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="الهاتف" error={errors.phone}>
                        <Input
                            value={form.phone}
                            onChange={(e) => set('phone')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>

                    <Field label="واتساب" error={errors.whatsapp}>
                        <Input
                            value={form.whatsapp}
                            onChange={(e) => set('whatsapp')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>
                </div>

                <Field label="البريد الإلكتروني" error={errors.email}>
                    <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => set('email')(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <Field label="العنوان" error={errors.address}>
                    <Textarea value={form.address} onChange={(e) => set('address')(e.target.value)} />
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>

                <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => set('is_active')(e.target.checked)}
                        className="size-4 rounded border-navy-300"
                    />
                    مورّد نشط
                </label>
            </div>
        </Modal>
    )
}

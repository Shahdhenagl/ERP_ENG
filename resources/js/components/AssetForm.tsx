import { Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { ASSET_STATUS } from '@/lib/domain'
import { useCustomers, useSaveAsset } from '@/lib/queries'
import type { Asset, AssetStatus } from '@/types'

interface AssetFormProps {
    open: boolean
    onClose: () => void
    asset?: Asset
    /** Pre-selects the owner when opened from a customer's page. */
    customerId?: number
    onSaved?: (asset: Asset) => void
}

export function AssetForm({ open, onClose, asset, customerId, onSaved }: AssetFormProps) {
    const toast = useToast()
    const save = useSaveAsset(asset?.id)
    const { data: customers } = useCustomers({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        serial: asset?.serial ?? '',
        customer_id: String(asset?.customer_id ?? customerId ?? ''),
        brand: asset?.brand ?? '',
        model: asset?.model ?? '',
        capacity: asset?.capacity ?? '',
        site_address: asset?.site_address ?? '',
        sold_at: asset?.sold_at ?? '',
        warranty_months: asset?.warranty_months?.toString() ?? '',
        installed_at: asset?.installed_at ?? '',
        status: (asset?.status ?? 'active') as AssetStatus,
        notes: asset?.notes ?? '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                serial: form.serial || null,
                customer_id: Number(form.customer_id),
                brand: form.brand || null,
                model: form.model || null,
                capacity: form.capacity || null,
                site_address: form.site_address || null,
                sold_at: form.sold_at || null,
                warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
                installed_at: form.installed_at || null,
                status: form.status,
                notes: form.notes || null,
            })

            toast.success(asset ? 'تم تعديل الجهاز.' : 'تم تسجيل الجهاز.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ الجهاز.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={asset ? `تعديل ${asset.code}` : 'تسجيل جهاز جديد'}
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
                <Field label="العميل المالك" required error={errors.customer_id}>
                    <Select
                        value={form.customer_id}
                        onChange={(event) => set('customer_id')(event.target.value)}
                    >
                        <option value="">— اختر العميل —</option>
                        {customers?.data.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                                {customer.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field
                    label="الرقم التسلسلي"
                    error={errors.serial}
                    hint="يمكن تركه فارغًا الآن وإضافته لاحقًا"
                >
                    <Input
                        value={form.serial}
                        onChange={(event) => set('serial')(event.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الماركة" error={errors.brand}>
                        <Input value={form.brand} onChange={(event) => set('brand')(event.target.value)} />
                    </Field>

                    <Field label="الموديل" error={errors.model}>
                        <Input value={form.model} onChange={(event) => set('model')(event.target.value)} />
                    </Field>

                    <Field label="القدرة" error={errors.capacity}>
                        <Input
                            value={form.capacity}
                            onChange={(event) => set('capacity')(event.target.value)}
                            placeholder="20 kVA"
                        />
                    </Field>

                    <Field label="الحالة" error={errors.status}>
                        <Select
                            value={form.status}
                            onChange={(event) => set('status')(event.target.value)}
                        >
                            {Object.entries(ASSET_STATUS).map(([value, meta]) => (
                                <option key={value} value={value}>
                                    {meta.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <div className="rounded-2xl bg-navy-50 p-4">
                    <p className="mb-3 text-xs font-bold text-navy-500">
                        الضمان — يُحتسب من تاريخ البيع
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="تاريخ البيع" error={errors.sold_at}>
                            <Input
                                type="date"
                                value={form.sold_at}
                                onChange={(event) => set('sold_at')(event.target.value)}
                            />
                        </Field>

                        <Field label="مدة الضمان (شهر)" error={errors.warranty_months}>
                            <Input
                                type="number"
                                min={0}
                                value={form.warranty_months}
                                onChange={(event) => set('warranty_months')(event.target.value)}
                                placeholder="24"
                            />
                        </Field>
                    </div>

                    {(!form.sold_at || !form.warranty_months) && (
                        <p className="mt-2 text-xs text-navy-400">
                            بدون التاريخ والمدة معًا ستظهر حالة الضمان «غير محدد».
                        </p>
                    )}
                </div>

                <Field label="تاريخ التركيب" error={errors.installed_at}>
                    <Input
                        type="date"
                        value={form.installed_at}
                        onChange={(event) => set('installed_at')(event.target.value)}
                    />
                </Field>

                <Field label="موقع الجهاز" error={errors.site_address}>
                    <Textarea
                        value={form.site_address}
                        onChange={(event) => set('site_address')(event.target.value)}
                        placeholder="الدور، الغرفة، أو أي وصف يساعد الفني على الوصول"
                    />
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        value={form.notes}
                        onChange={(event) => set('notes')(event.target.value)}
                    />
                </Field>
            </div>
        </Modal>
    )
}

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAssets, useRegisterWarranty, useSuppliers } from '@/lib/queries'

/**
 * Put a unit under warranty.
 *
 * The term is asked for in months rather than as an end date, because that is
 * how it is sold — "سنة ضمان" — and the server closes it the day before the
 * anniversary so two consecutive terms cannot overlap.
 */
export function WarrantyForm({
    assetId,
    onClose,
}: {
    assetId?: number
    onClose: () => void
}) {
    const toast = useToast()
    const register = useRegisterWarranty()
    const { data: assets } = useAssets({ per_page: 200 })
    const { data: suppliers } = useSuppliers({ per_page: 200 })

    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({
        asset_id: assetId ? String(assetId) : '',
        kind: 'company',
        covers: 'both',
        starts_on: new Date().toISOString().slice(0, 10),
        months: '12',
        supplier_id: '',
        supplier_reference: '',
        terms: '',
        notes: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const handleSave = async () => {
        setErrors({})

        try {
            await register.mutateAsync({
                asset_id: Number(form.asset_id),
                kind: form.kind,
                covers: form.covers,
                starts_on: form.starts_on || null,
                months: Number(form.months),
                // Only meaningful on supplier cover; sending it otherwise would
                // put a supplier's name on our own promise.
                supplier_id: form.kind === 'supplier' && form.supplier_id
                    ? Number(form.supplier_id)
                    : null,
                supplier_reference: form.supplier_reference || null,
                terms: form.terms || null,
                notes: form.notes || null,
            })

            toast.success('تم تسجيل الضمان.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر تسجيل الضمان.'))
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title="تسجيل ضمان"
            size="md"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={register.isPending}>
                        إلغاء
                    </Button>
                    <Button onClick={handleSave} loading={register.isPending}>
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الجهاز" required error={errors.asset_id}>
                    <Select
                        value={form.asset_id}
                        onChange={(e) => set('asset_id')(e.target.value)}
                        disabled={Boolean(assetId)}
                    >
                        <option value="">— اختر الجهاز —</option>
                        {assets?.data.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                                {asset.code} · {asset.label}
                                {asset.serial ? ` · ${asset.serial}` : ''}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="نوع الضمان" required error={errors.kind}>
                        <Select value={form.kind} onChange={(e) => set('kind')(e.target.value)}>
                            <option value="company">ضمان الشركة</option>
                            <option value="supplier">ضمان المورّد</option>
                        </Select>
                    </Field>

                    <Field
                        label="يغطي"
                        error={errors.covers}
                        hint="المصنعية فقط شائعة لو العميل هو من ورّد الجهاز"
                    >
                        <Select value={form.covers} onChange={(e) => set('covers')(e.target.value)}>
                            <option value="both">قطع غيار ومصنعية</option>
                            <option value="parts">قطع الغيار فقط</option>
                            <option value="labour">المصنعية فقط</option>
                        </Select>
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="يبدأ في" required error={errors.starts_on}>
                        <Input
                            type="date"
                            value={form.starts_on}
                            onChange={(e) => set('starts_on')(e.target.value)}
                        />
                    </Field>

                    <Field label="المدة (شهور)" required error={errors.months}>
                        <Input
                            type="number"
                            min={1}
                            max={240}
                            value={form.months}
                            onChange={(e) => set('months')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                {form.kind === 'supplier' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="المورّد" error={errors.supplier_id}>
                            <Select
                                value={form.supplier_id}
                                onChange={(e) => set('supplier_id')(e.target.value)}
                            >
                                <option value="">— اختر —</option>
                                {suppliers?.map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="مرجع الضمان لدى المورّد" error={errors.supplier_reference}>
                            <Input
                                value={form.supplier_reference}
                                onChange={(e) => set('supplier_reference')(e.target.value)}
                                placeholder="APC-2026-0077"
                                dir="ltr"
                                className="text-left"
                            />
                        </Field>
                    </div>
                )}

                <Field label="شروط الضمان" error={errors.terms} hint="تُطبع على الشهادة كما هي">
                    <Textarea
                        value={form.terms}
                        onChange={(e) => set('terms')(e.target.value)}
                        rows={4}
                        placeholder="لا يشمل الضمان سوء الاستخدام أو التلف الناتج عن ارتفاع الجهد…"
                    />
                </Field>

                <Field label="ملاحظات داخلية" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

import { Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { ITEM_CATEGORY } from '@/lib/domain'
import { useSaveItem } from '@/lib/queries'
import type { Item, ItemCategory } from '@/types'

interface ItemFormProps {
    open: boolean
    onClose: () => void
    item?: Item
    onSaved?: (item: Item) => void
}

export function ItemForm({ open, onClose, item, onSaved }: ItemFormProps) {
    const toast = useToast()
    const save = useSaveItem(item?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: item?.name ?? '',
        sku: item?.sku ?? '',
        category: (item?.category ?? 'spare_part') as ItemCategory,
        unit: item?.unit ?? 'قطعة',
        reorder_level: item?.reorder_level?.toString() ?? '',
        notes: item?.notes ?? '',
        is_active: item?.is_active ?? true,
    })

    const set = (key: keyof typeof form) => (value: string | boolean) =>
        setForm((current) => ({ ...current, [key]: value }))

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                name: form.name,
                sku: form.sku || null,
                category: form.category,
                unit: form.unit,
                reorder_level: form.reorder_level ? Number(form.reorder_level) : 0,
                notes: form.notes || null,
                is_active: form.is_active,
            })

            toast.success(item ? 'تم تعديل الصنف.' : 'تم إضافة الصنف.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ الصنف.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={item ? `تعديل ${item.code}` : 'صنف جديد'}
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
                <Field label="اسم الصنف" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(event) => set('name')(event.target.value)}
                        placeholder="بطارية 12V 100Ah"
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="التصنيف" required error={errors.category}>
                        <Select
                            value={form.category}
                            onChange={(event) => set('category')(event.target.value)}
                        >
                            {Object.entries(ITEM_CATEGORY).map(([value, meta]) => (
                                <option key={value} value={value}>
                                    {meta.label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="الوحدة" required error={errors.unit}>
                        <Input
                            value={form.unit}
                            onChange={(event) => set('unit')(event.target.value)}
                            placeholder="قطعة / متر"
                        />
                    </Field>

                    <Field label="كود المورّد" error={errors.sku}>
                        <Input
                            value={form.sku}
                            onChange={(event) => set('sku')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field
                        label="حد إعادة الطلب"
                        error={errors.reorder_level}
                        hint="ينبّهك عندما يقل الرصيد عنه"
                    >
                        <Input
                            type="number"
                            min={0}
                            value={form.reorder_level}
                            onChange={(event) => set('reorder_level')(event.target.value)}
                        />
                    </Field>
                </div>

                {/* Cost is intentionally absent: it comes from what the goods
                    actually cost on receipt, never from typing. */}
                <p className="rounded-xl bg-navy-50 p-3 text-xs text-navy-500">
                    تكلفة الصنف تُحسب تلقائيًا كمتوسط مرجح من أسعار الشراء عند تسجيل الوارد.
                </p>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        value={form.notes}
                        onChange={(event) => set('notes')(event.target.value)}
                    />
                </Field>

                <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(event) => set('is_active')(event.target.checked)}
                        className="size-4 rounded border-navy-300"
                    />
                    صنف نشط
                </label>
            </div>
        </Modal>
    )
}

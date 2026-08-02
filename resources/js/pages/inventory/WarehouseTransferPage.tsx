import { ArrowLeftRight } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PageHeader, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useItems, useStockOperation, useWarehouses } from '@/lib/queries'

/**
 * Move stock between two stores — a store-to-store transfer, distinct from
 * handing a float to a technician. Its own screen off the sidebar; the log of
 * what moved lives on سجل الحركة.
 */
export function WarehouseTransferPage() {
    const toast = useToast()
    const transfer = useStockOperation('warehouse-transfer')
    const { data: items } = useItems({ per_page: 500 })
    const { data: warehouses } = useWarehouses()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const stores = (warehouses ?? []).filter((w) => w.type === 'store')

    const [form, setForm] = useState({
        item_id: '',
        from_warehouse_id: '',
        to_warehouse_id: '',
        qty: '',
        note: '',
    })
    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const sameStore = form.from_warehouse_id && form.from_warehouse_id === form.to_warehouse_id

    const submit = async () => {
        setErrors({})
        try {
            await transfer.mutateAsync({
                item_id: Number(form.item_id),
                from_warehouse_id: Number(form.from_warehouse_id),
                to_warehouse_id: Number(form.to_warehouse_id),
                qty: Number(form.qty),
                note: form.note || null,
            })
            toast.success('تم تنفيذ التحويل.')
            setForm({ ...form, qty: '', note: '' })
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر التحويل.'))
        }
    }

    return (
        <>
            <PageHeader title="تحويلات المخازن" subtitle="نقل الأصناف بين المخازن" />

            <div className="mx-auto max-w-lg">
                <div className="card space-y-4 p-5">
                    <Field label="الصنف" required error={errors.item_id}>
                        <Select value={form.item_id} onChange={(e) => set('item_id')(e.target.value)}>
                            <option value="">— اختر —</option>
                            {items?.data.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="من مخزن" required error={errors.from_warehouse_id}>
                            <Select
                                value={form.from_warehouse_id}
                                onChange={(e) => set('from_warehouse_id')(e.target.value)}
                            >
                                <option value="">— اختر —</option>
                                {stores.map((w) => (
                                    <option key={w.id} value={w.id}>
                                        {w.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="إلى مخزن" required error={errors.to_warehouse_id}>
                            <Select
                                value={form.to_warehouse_id}
                                onChange={(e) => set('to_warehouse_id')(e.target.value)}
                            >
                                <option value="">— اختر —</option>
                                {stores.map((w) => (
                                    <option key={w.id} value={w.id}>
                                        {w.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>

                    {sameStore && (
                        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                            {tr('لا يمكن التحويل إلى نفس المخزن.')}
                        </p>
                    )}

                    <Field label="الكمية" required error={errors.qty}>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={form.qty}
                            onChange={(e) => set('qty')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="ملاحظة" error={errors.note}>
                        <Textarea value={form.note} onChange={(e) => set('note')(e.target.value)} />
                    </Field>

                    <Button
                        icon={ArrowLeftRight}
                        className="w-full"
                        loading={transfer.isPending}
                        disabled={
                            !form.item_id ||
                            !form.from_warehouse_id ||
                            !form.to_warehouse_id ||
                            !form.qty ||
                            Boolean(sameStore)
                        }
                        onClick={submit}
                    >
                        {tr('تنفيذ التحويل')}
                    </Button>
                </div>
            </div>
        </>
    )
}

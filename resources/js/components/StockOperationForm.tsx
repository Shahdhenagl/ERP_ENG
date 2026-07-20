import { Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatQty } from '@/lib/domain'
import {
    useItems,
    useStockOperation,
    useSuppliers,
    useTechnicians,
    useWarehouses,
} from '@/lib/queries'

type Operation = 'receive' | 'transfer' | 'adjust'

const TITLES: Record<Operation, string> = {
    receive: 'تسجيل وارد',
    transfer: 'تسليم عهدة',
    adjust: 'تسوية جرد',
}

interface StockOperationFormProps {
    open: boolean
    onClose: () => void
    operation: Operation
    /** Pre-selects a row when opened from an item. */
    itemId?: number
}

export function StockOperationForm({ open, onClose, operation, itemId }: StockOperationFormProps) {
    const toast = useToast()
    const run = useStockOperation(operation)
    const { data: itemPage } = useItems({ active_only: 1, per_page: 200 })
    const { data: technicians } = useTechnicians()
    const { data: warehouses } = useWarehouses()
    const { data: suppliers } = useSuppliers({ active_only: 1 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        item_id: itemId?.toString() ?? '',
        qty: '',
        unit_cost: '',
        to_user_id: '',
        direction: 'out' as 'out' | 'in',
        warehouse_id: '',
        supplier_id: '',
        reference: '',
        note: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const items = itemPage?.data ?? []
    const selected = items.find((item) => String(item.id) === form.item_id)

    const handleSave = async () => {
        setErrors({})

        const payload: Record<string, unknown> = {
            item_id: Number(form.item_id),
            note: form.note || null,
        }

        if (operation === 'receive') {
            Object.assign(payload, {
                qty: Number(form.qty),
                unit_cost: Number(form.unit_cost),
                supplier_id: Number(form.supplier_id),
                reference: form.reference || null,
            })
        } else if (operation === 'transfer') {
            Object.assign(payload, {
                qty: Number(form.qty),
                to_user_id: Number(form.to_user_id),
                to_main: form.direction === 'in',
            })
        } else {
            Object.assign(payload, {
                warehouse_id: Number(form.warehouse_id),
                counted_qty: Number(form.qty),
            })
        }

        try {
            await run.mutateAsync(payload)
            toast.success(`تم ${TITLES[operation]}.`)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={TITLES[operation]}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={run.isPending}>
                        إلغاء
                    </Button>
                    <Button icon={Save} onClick={handleSave} loading={run.isPending}>
                        تنفيذ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الصنف" required error={errors.item_id}>
                    <Select value={form.item_id} onChange={(event) => set('item_id')(event.target.value)}>
                        <option value="">— اختر الصنف —</option>
                        {items.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name} ({formatQty(item.total_qty)} {item.unit})
                            </option>
                        ))}
                    </Select>
                </Field>

                {operation === 'receive' && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="الكمية" required error={errors.qty}>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    value={form.qty}
                                    onChange={(event) => set('qty')(event.target.value)}
                                />
                            </Field>

                            <Field label="سعر الوحدة" required error={errors.unit_cost}>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={form.unit_cost}
                                    onChange={(event) => set('unit_cost')(event.target.value)}
                                />
                            </Field>
                        </div>

                        {/* Show the effect on the average before it is committed —
                            the number the accountant will ask about later. */}
                        {selected && form.qty && form.unit_cost && (
                            <p className="rounded-xl bg-navy-50 p-3 text-xs text-navy-600">
                                متوسط التكلفة سينتقل من{' '}
                                <strong>{selected.avg_cost.toFixed(2)}</strong> إلى{' '}
                                <strong>
                                    {(
                                        (selected.total_qty * selected.avg_cost +
                                            Number(form.qty) * Number(form.unit_cost)) /
                                        (selected.total_qty + Number(form.qty) || 1)
                                    ).toFixed(2)}
                                </strong>{' '}
                                ج
                            </p>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* A record, not typed text — otherwise the same
                                company gets spelled three ways and nothing
                                totals against them. */}
                            <Field label="المورّد" required error={errors.supplier_id}>
                                <Select
                                    value={form.supplier_id}
                                    onChange={(event) => set('supplier_id')(event.target.value)}
                                >
                                    <option value="">— اختر المورّد —</option>
                                    {suppliers?.map((supplier) => (
                                        <option key={supplier.id} value={supplier.id}>
                                            {supplier.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="رقم الفاتورة" error={errors.reference}>
                                <Input
                                    value={form.reference}
                                    onChange={(event) => set('reference')(event.target.value)}
                                    dir="ltr"
                                    className="text-left"
                                />
                            </Field>
                        </div>
                    </>
                )}

                {operation === 'transfer' && (
                    <>
                        <Field label="الاتجاه" required>
                            <Select
                                value={form.direction}
                                onChange={(event) => set('direction')(event.target.value)}
                            >
                                <option value="out">من المخزن إلى عهدة الفني</option>
                                <option value="in">من عهدة الفني إلى المخزن</option>
                            </Select>
                        </Field>

                        <Field label="الفني" required error={errors.to_user_id}>
                            <Select
                                value={form.to_user_id}
                                onChange={(event) => set('to_user_id')(event.target.value)}
                            >
                                <option value="">— اختر الفني —</option>
                                {technicians?.map((technician) => (
                                    <option key={technician.id} value={technician.id}>
                                        {technician.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="الكمية" required error={errors.qty}>
                            <Input
                                type="number"
                                min={0}
                                step="0.001"
                                value={form.qty}
                                onChange={(event) => set('qty')(event.target.value)}
                            />
                        </Field>
                    </>
                )}

                {operation === 'adjust' && (
                    <>
                        <Field label="المخزن" required error={errors.warehouse_id}>
                            <Select
                                value={form.warehouse_id}
                                onChange={(event) => set('warehouse_id')(event.target.value)}
                            >
                                <option value="">— اختر المخزن —</option>
                                {warehouses?.map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>
                                        {warehouse.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field
                            label="الكمية المجرودة"
                            required
                            error={errors.counted_qty ?? errors.qty}
                            hint="اكتب الرصيد الفعلي بعد العد — وليس الفرق"
                        >
                            <Input
                                type="number"
                                min={0}
                                step="0.001"
                                value={form.qty}
                                onChange={(event) => set('qty')(event.target.value)}
                            />
                        </Field>
                    </>
                )}

                <Field label="ملاحظات" error={errors.note}>
                    <Textarea value={form.note} onChange={(event) => set('note')(event.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

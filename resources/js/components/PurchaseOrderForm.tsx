import clsx from 'clsx'
import { Save, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { LineCell, LineDetailRow, LineItems, LineRow } from '@/components/LineItems'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { DEFAULT_TAX_RATE, formatMoney, formatQty, ITEM_CATEGORY } from '@/lib/domain'
import { itemSpecRows } from '@/lib/specs'
import { SpecSheet } from '@/components/SpecSheet'
import { useItems, useSavePurchaseOrder, useSuppliers } from '@/lib/queries'
import type { PurchaseOrder } from '@/types'

interface Row {
    item_id: string
    qty: string
    unit_price: string
}

export function PurchaseOrderForm({
    open,
    onClose,
    order,
    onSaved,
}: {
    open: boolean
    onClose: () => void
    order?: PurchaseOrder
    onSaved?: (order: PurchaseOrder) => void
}) {
    const toast = useToast()
    const save = useSavePurchaseOrder(order?.id)
    const { data: suppliers } = useSuppliers({ active_only: 1 })
    const { data: itemPage } = useItems({ active_only: 1, per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const items = itemPage?.data ?? []

    const [supplierId, setSupplierId] = useState(String(order?.supplier_id ?? ''))
    const [expected, setExpected] = useState(order?.expected_date ?? '')
    const [taxRate, setTaxRate] = useState(String(order?.tax_rate ?? DEFAULT_TAX_RATE))
    const [notes, setNotes] = useState(order?.notes ?? '')
    const [rows, setRows] = useState<Row[]>(
        (order?.lines ?? []).map((line) => ({
            item_id: String(line.item_id),
            qty: String(line.qty),
            unit_price: String(line.unit_price),
        })),
    )

    const patch = (index: number, key: keyof Row, value: string) =>
        setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

    const subtotal = rows.reduce(
        (sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unit_price) || 0),
        0,
    )
    const total = subtotal + subtotal * ((Number(taxRate) || 0) / 100)

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                supplier_id: Number(supplierId),
                expected_date: expected || null,
                tax_rate: Number(taxRate) || 0,
                notes: notes || null,
                lines: rows
                    .filter((row) => row.item_id)
                    .map((row) => ({
                        item_id: Number(row.item_id),
                        qty: Number(row.qty) || 1,
                        unit_price: Number(row.unit_price) || 0,
                    })),
            })

            toast.success(order ? 'تم حفظ أمر الشراء.' : 'تم إنشاء أمر الشراء.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ أمر الشراء.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={order ? `تعديل ${order.code}` : 'أمر شراء جديد'}
            size="lg"
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
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="المورّد" required error={errors.supplier_id} className="sm:col-span-2">
                        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                            <option value="">— اختر المورّد —</option>
                            {suppliers?.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="تاريخ التوريد المتوقع" error={errors.expected_date}>
                        <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
                    </Field>
                </div>

                <LineItems
                    columns={[
                        { label: 'الصنف', className: 'w-56' },
                        { label: 'الكود', className: 'w-24' },
                        { label: 'الكمية', className: 'w-24' },
                        { label: 'سعر الوحدة', className: 'w-28' },
                        { label: 'الإجمالي', className: 'w-28' },
                    ]}
                    error={errors.lines}
                    addLabel="إضافة صنف"
                    onAdd={() => setRows((c) => [...c, { item_id: '', qty: '1', unit_price: '0' }])}
                >
                    {rows.map((row, index) => {
                        const item = items.find((i) => String(i.id) === row.item_id)
                        const specs = item ? itemSpecRows(item.category, item.specs) : []

                        return (
                            <Fragment key={index}>
                                <LineRow>
                                    <LineCell>
                                        <Select
                                            value={row.item_id}
                                            onChange={(e) => {
                                                patch(index, 'item_id', e.target.value)

                                                // Last purchase price is the
                                                // sensible opener; an unbought
                                                // item has none to suggest.
                                                const picked = items.find(
                                                    (i) => String(i.id) === e.target.value,
                                                )

                                                if (picked && picked.avg_cost > 0 && !Number(row.unit_price)) {
                                                    patch(index, 'unit_price', String(picked.avg_cost))
                                                }
                                            }}
                                        >
                                            <option value="">— اختر الصنف —</option>
                                            {items.map((option) => (
                                                <option key={option.id} value={option.id}>
                                                    {option.name}
                                                </option>
                                            ))}
                                        </Select>
                                    </LineCell>

                                    <LineCell className="tabular text-[11px] text-navy-500">
                                        {item?.code ?? '—'}
                                    </LineCell>

                                    <LineCell>
                                        <Input
                                            type="number"
                                            min={0}
                                            step="0.001"
                                            value={row.qty}
                                            onChange={(e) => patch(index, 'qty', e.target.value)}
                                            className="text-center"
                                            dir="ltr"
                                            aria-label="الكمية"
                                        />
                                    </LineCell>

                                    <LineCell>
                                        <Input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={row.unit_price}
                                            onChange={(e) => patch(index, 'unit_price', e.target.value)}
                                            className="text-center"
                                            dir="ltr"
                                            aria-label="سعر الوحدة"
                                        />
                                    </LineCell>

                                    <LineCell className="tabular pt-4 text-left font-bold text-navy-800">
                                        {formatMoney(
                                            (Number(row.qty) || 0) * (Number(row.unit_price) || 0),
                                        )}
                                    </LineCell>

                                    <LineCell>
                                        <button
                                            type="button"
                                            onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
                                            className="tap grid place-items-center rounded-lg p-2 text-red-500 transition hover:bg-red-50"
                                            aria-label="حذف السطر"
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    </LineCell>
                                </LineRow>

                                {item && (
                                    <LineDetailRow span={5}>
                                        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-navy-500">
                                            <span
                                                className={clsx('badge', ITEM_CATEGORY[item.category].chip)}
                                            >
                                                {ITEM_CATEGORY[item.category].label}
                                            </span>
                                            {item.group && <span>{item.group}</span>}
                                            <span className="tabular">
                                                بالمخزن {formatQty(item.total_qty)} {item.unit}
                                            </span>
                                        </p>

                                        {specs.length > 0 && (
                                            <SpecSheet rows={specs} empty={null} className="mt-2" />
                                        )}
                                    </LineDetailRow>
                                )}
                            </Fragment>
                        )
                    })}
                </LineItems>

                {errors.lines && <p className="text-xs font-medium text-red-600">{errors.lines}</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="نسبة الضريبة %" error={errors.tax_rate}>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={taxRate}
                            onChange={(e) => setTaxRate(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="ملاحظات" error={errors.notes}>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} />
                    </Field>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-4">
                    <span className="font-bold text-navy-800">الإجمالي</span>
                    <span className="tabular text-lg font-extrabold text-navy-900">
                        {formatMoney(total)}
                    </span>
                </div>
            </div>
        </Modal>
    )
}

import clsx from 'clsx'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DiscountField } from '@/components/DiscountField'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney, formatQty, ITEM_CATEGORY } from '@/lib/domain'
import { itemSpecRows } from '@/lib/specs'
import { SpecSheet } from '@/components/SpecSheet'
import { useItems, useSaveInvoice } from '@/lib/queries'
import type { Invoice } from '@/types'

interface Row {
    item_id: string
    description: string
    qty: string
    unit_price: string
}

/**
 * Editing is only ever offered on a draft. Once issued, the customer has seen
 * the document — it is corrected with a void and a fresh invoice, which is
 * what the API enforces too.
 */
export function InvoiceForm({
    open,
    onClose,
    invoice,
}: {
    open: boolean
    onClose: () => void
    invoice: Invoice
}) {
    const toast = useToast()
    const save = useSaveInvoice(invoice.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    // The catalogue, so a line can name a real product rather than a sentence —
    // and so the person billing sees the nameplate they are charging for.
    const { data: itemPage } = useItems({ active_only: 1, per_page: 200 })
    const items = itemPage?.data ?? []

    const [rows, setRows] = useState<Row[]>(
        (invoice.lines ?? []).map((line) => ({
            item_id: line.item_id ? String(line.item_id) : '',
            description: line.description,
            qty: String(line.qty),
            unit_price: String(line.unit_price),
        })),
    )
    const [discount, setDiscount] = useState(String(invoice.discount ?? 0))
    const [discountPercent, setDiscountPercent] = useState(
        invoice.discount_percent != null ? String(invoice.discount_percent) : '',
    )
    const [taxRate, setTaxRate] = useState(String(invoice.tax_rate ?? 0))
    const [dueDate, setDueDate] = useState(invoice.due_date ?? '')

    const patch = (index: number, key: keyof Row, value: string) =>
        setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

    // Mirrors the server's arithmetic so the manager sees the number before saving.
    const subtotal = rows.reduce((sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unit_price) || 0), 0)
    const discountValue =
        discountPercent === ''
            ? Number(discount) || 0
            : Math.min(
                  Math.round(subtotal * (Number(discountPercent) || 0)) / 100,
                  subtotal,
              )
    const taxable = Math.max(subtotal - discountValue, 0)
    const total = taxable + taxable * ((Number(taxRate) || 0) / 100)

    const handleSave = async () => {
        setErrors({})

        try {
            await save.mutateAsync({
                due_date: dueDate || null,
                discount: Number(discount) || 0,
                discount_percent: discountPercent === '' ? null : Number(discountPercent),
                tax_rate: Number(taxRate) || 0,
                lines: rows
                    .filter((row) => row.description.trim())
                    .map((row) => ({
                        item_id: row.item_id ? Number(row.item_id) : null,
                        description: row.description.trim(),
                        qty: Number(row.qty) || 1,
                        unit_price: Number(row.unit_price) || 0,
                    })),
            })

            toast.success('تم حفظ المسودة.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ المسودة.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`تعديل ${invoice.code}`}
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
                <div className="space-y-2">
                    {rows.map((row, index) => (
                        <div key={index} className="space-y-2 rounded-2xl border border-navy-100 p-3">
                            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                                {/* Picking a catalogue item names the product and
                                    opens at its selling price — the same choice the
                                    quote offers, so a bill raised by hand carries the
                                    device rather than a free-text line. */}
                                <Select
                                    value={row.item_id}
                                    onChange={(event) => {
                                        const item = items.find(
                                            (candidate) => String(candidate.id) === event.target.value,
                                        )

                                        setRows((current) =>
                                            current.map((existing, i) =>
                                                i === index
                                                    ? {
                                                          ...existing,
                                                          item_id: event.target.value,
                                                          description: item?.name ?? existing.description,
                                                          unit_price:
                                                              item && !Number(existing.unit_price)
                                                                  ? String(item.sell_price ?? item.avg_cost)
                                                                  : existing.unit_price,
                                                      }
                                                    : existing,
                                            ),
                                        )
                                    }}
                                    className="w-44 shrink-0"
                                >
                                    <option value="">بند حر</option>
                                    {items.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </Select>

                                <Input
                                    value={row.description}
                                    onChange={(event) => patch(index, 'description', event.target.value)}
                                    placeholder="وصف البند"
                                    className="min-w-0 flex-1"
                                />
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    value={row.qty}
                                    onChange={(event) => patch(index, 'qty', event.target.value)}
                                    className="w-20 text-center"
                                    dir="ltr"
                                    aria-label="الكمية"
                                />
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={row.unit_price}
                                    onChange={(event) => patch(index, 'unit_price', event.target.value)}
                                    className="w-28 text-center"
                                    dir="ltr"
                                    aria-label="سعر الوحدة"
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setRows((current) => current.filter((_, i) => i !== index))
                                    }
                                    className="tap grid shrink-0 place-items-center rounded-xl px-3 text-red-500 transition hover:bg-red-50"
                                    aria-label="حذف البند"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>

                            {/* The kind, the nameplate and what is on the shelf —
                                issuing the invoice is what draws the stock down. */}
                            {(() => {
                                const item = items.find(
                                    (candidate) => String(candidate.id) === row.item_id,
                                )

                                if (!item) return null

                                const short = (Number(row.qty) || 0) > item.total_qty
                                const specs = itemSpecRows(item.category, item.specs)

                                return (
                                    <>
                                        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-navy-500">
                                            <span
                                                className={clsx(
                                                    'badge',
                                                    ITEM_CATEGORY[item.category].chip,
                                                )}
                                            >
                                                {ITEM_CATEGORY[item.category].label}
                                            </span>
                                            {item.group && <span>{item.group}</span>}
                                        </p>

                                        {specs.length > 0 && (
                                            <SpecSheet rows={specs} empty={null} />
                                        )}
                                        <p
                                            className={clsx(
                                                'tabular text-[11px] font-bold',
                                                short ? 'text-red-600' : 'text-navy-400',
                                            )}
                                        >
                                            المتاح بالمخزن: {formatQty(item.total_qty)} {item.unit}
                                            {short && ' — أقل من الكمية المطلوبة'}
                                        </p>
                                    </>
                                )
                            })()}
                        </div>
                    ))}

                    <Button
                        variant="ghost"
                        icon={Plus}
                        className="text-xs"
                        onClick={() =>
                            setRows((current) => [
                                ...current,
                                { item_id: '', description: '', qty: '1', unit_price: '0' },
                            ])
                        }
                    >
                        إضافة بند
                    </Button>
                </div>

                {errors.lines && <p className="text-xs font-medium text-red-600">{errors.lines}</p>}

                <div className="grid gap-4 sm:grid-cols-3">
                    <DiscountField
                        amount={discount}
                        percent={discountPercent}
                        subtotal={subtotal}
                        error={errors.discount ?? errors.discount_percent}
                        onChange={(next) => {
                            setDiscount(next.amount)
                            setDiscountPercent(next.percent)
                        }}
                    />

                    <Field label="نسبة الضريبة %" error={errors.tax_rate}>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={taxRate}
                            onChange={(event) => setTaxRate(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="تاريخ الاستحقاق" error={errors.due_date}>
                        <Input
                            type="date"
                            value={dueDate}
                            onChange={(event) => setDueDate(event.target.value)}
                        />
                    </Field>
                </div>

                <div className="rounded-2xl bg-navy-50 p-4 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-navy-500">قبل الخصم</span>
                        <span className="tabular font-semibold">{formatMoney(subtotal)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-navy-200 pt-2">
                        <span className="font-bold text-navy-800">الإجمالي</span>
                        <span className="tabular text-lg font-extrabold text-navy-900">
                            {formatMoney(total)}
                        </span>
                    </div>
                </div>
            </div>
        </Modal>
    )
}

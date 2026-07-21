import { Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { DEFAULT_TAX_RATE, formatMoney } from '@/lib/domain'
import { useCustomers, useItems, useSaveQuotation } from '@/lib/queries'
import type { Quotation } from '@/types'

interface Row {
    item_id: string
    description: string
    qty: string
    unit_price: string
}

export function QuotationForm({
    open,
    onClose,
    quotation,
    onSaved,
}: {
    open: boolean
    onClose: () => void
    quotation?: Quotation
    onSaved?: (quotation: Quotation) => void
}) {
    const toast = useToast()
    const save = useSaveQuotation(quotation?.id)
    const { data: customerPage } = useCustomers({ active_only: 1, per_page: 200 })
    const { data: itemPage } = useItems({ active_only: 1, per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const customers = customerPage?.data ?? []
    const items = itemPage?.data ?? []

    const [customerId, setCustomerId] = useState(String(quotation?.customer_id ?? ''))
    const [title, setTitle] = useState(quotation?.title ?? '')
    const [validUntil, setValidUntil] = useState(
        quotation?.valid_until ?? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
    )
    const [taxRate, setTaxRate] = useState(String(quotation?.tax_rate ?? DEFAULT_TAX_RATE))
    const [discount, setDiscount] = useState(String(quotation?.discount ?? 0))
    const [terms, setTerms] = useState(quotation?.terms ?? '')
    const [notes, setNotes] = useState(quotation?.notes ?? '')

    const [rows, setRows] = useState<Row[]>(
        (quotation?.lines ?? []).map((line) => ({
            item_id: String(line.item_id ?? ''),
            description: line.description,
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
    const afterDiscount = Math.max(subtotal - (Number(discount) || 0), 0)
    const total = afterDiscount + afterDiscount * ((Number(taxRate) || 0) / 100)

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                customer_id: Number(customerId),
                title: title || null,
                valid_until: validUntil || null,
                tax_rate: Number(taxRate) || 0,
                discount: Number(discount) || 0,
                terms: terms || null,
                notes: notes || null,
                lines: rows
                    .filter((row) => row.description.trim())
                    .map((row) => ({
                        item_id: row.item_id ? Number(row.item_id) : null,
                        description: row.description.trim(),
                        qty: Number(row.qty) || 1,
                        unit_price: Number(row.unit_price) || 0,
                    })),
            })

            toast.success(quotation ? 'تم حفظ عرض السعر.' : 'تم إنشاء عرض السعر.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ عرض السعر.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={quotation ? `تعديل ${quotation.code}` : 'عرض سعر جديد'}
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
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="العميل" required error={errors.customer_id}>
                        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                            <option value="">— اختر العميل —</option>
                            {customers.map((customer) => (
                                <option key={customer.id} value={customer.id}>
                                    {customer.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="صالح حتى" error={errors.valid_until} hint="بعده لا يعود السعر ملزمًا">
                        <Input
                            type="date"
                            value={validUntil}
                            onChange={(e) => setValidUntil(e.target.value)}
                        />
                    </Field>
                </div>

                <Field label="عنوان العرض" error={errors.title}>
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="توريد وتركيب جهاز UPS 10kVA"
                    />
                </Field>

                <div className="space-y-2">
                    {rows.map((row, index) => (
                        <div key={index} className="space-y-2 rounded-2xl border border-navy-100 p-3">
                            <div className="flex gap-2">
                                {/* Picking a catalogue item fills the description
                                    and opens at its cost; a free line stays free. */}
                                <Select
                                    value={row.item_id}
                                    onChange={(e) => {
                                        const item = items.find((i) => String(i.id) === e.target.value)

                                        setRows((current) =>
                                            current.map((r, i) =>
                                                i === index
                                                    ? {
                                                          ...r,
                                                          item_id: e.target.value,
                                                          description: item?.name ?? r.description,
                                                          unit_price:
                                                              item && !Number(r.unit_price)
                                                                  ? String(item.avg_cost)
                                                                  : r.unit_price,
                                                      }
                                                    : r,
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
                                    onChange={(e) => patch(index, 'description', e.target.value)}
                                    placeholder="وصف البند"
                                    className="min-w-0 flex-1"
                                />

                                <button
                                    type="button"
                                    onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
                                    className="tap grid shrink-0 place-items-center rounded-xl px-3 text-red-500 transition hover:bg-red-50"
                                    aria-label="حذف السطر"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    value={row.qty}
                                    onChange={(e) => patch(index, 'qty', e.target.value)}
                                    className="w-20 text-center"
                                    dir="ltr"
                                    aria-label="الكمية"
                                />
                                <span className="text-xs text-navy-400">×</span>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={row.unit_price}
                                    onChange={(e) => patch(index, 'unit_price', e.target.value)}
                                    className="w-32 text-center"
                                    dir="ltr"
                                    aria-label="سعر الوحدة"
                                />
                                <span className="tabular flex-1 text-left text-sm font-bold text-navy-700">
                                    {formatMoney((Number(row.qty) || 0) * (Number(row.unit_price) || 0))}
                                </span>
                            </div>
                        </div>
                    ))}

                    <Button
                        variant="ghost"
                        icon={Plus}
                        className="text-xs"
                        onClick={() =>
                            setRows((c) => [
                                ...c,
                                { item_id: '', description: '', qty: '1', unit_price: '0' },
                            ])
                        }
                    >
                        إضافة بند
                    </Button>
                </div>

                {errors.lines && <p className="text-xs font-medium text-red-600">{errors.lines}</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الخصم" error={errors.discount}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={discount}
                            onChange={(e) => setDiscount(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

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
                </div>

                <Field label="شروط العرض" error={errors.terms} hint="الدفع، التسليم، الضمان">
                    <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} />
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} />
                </Field>

                <div className="space-y-1.5 rounded-2xl bg-navy-50 p-4 text-sm">
                    <Row label="الإجمالي قبل الخصم" value={formatMoney(subtotal)} />
                    {Number(discount) > 0 && (
                        <Row label="الخصم" value={`− ${formatMoney(Number(discount))}`} />
                    )}
                    {Number(taxRate) > 0 && (
                        <Row
                            label={`ضريبة ${taxRate}%`}
                            value={formatMoney(afterDiscount * (Number(taxRate) / 100))}
                        />
                    )}
                    <div className="flex items-center justify-between border-t border-navy-200 pt-1.5">
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

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between text-navy-500">
            <span>{label}</span>
            <span className="tabular">{value}</span>
        </div>
    )
}

import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { CustomerSitePicker } from '@/components/CustomerSitePicker'
import { DiscountField } from '@/components/DiscountField'
import { LineCell, LineDetailRow, LineItems, LineRow } from '@/components/LineItems'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { parseConditions, type Condition } from '@/lib/conditions'
import { DEFAULT_TAX_RATE, formatMoney, formatQty, ITEM_CATEGORY } from '@/lib/domain'
import { itemSpecRows } from '@/lib/specs'
import { SpecSheet } from '@/components/SpecSheet'
import { useItems, useSaveQuotation, useSettings } from '@/lib/queries'
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
    const { data: itemPage } = useItems({ active_only: 1, per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const items = itemPage?.data ?? []

    const [customerId, setCustomerId] = useState(String(quotation?.customer_id ?? ''))
    const [branchId, setBranchId] = useState(String(quotation?.branch_id ?? ''))
    const [title, setTitle] = useState(quotation?.title ?? '')
    const [validUntil, setValidUntil] = useState(
        quotation?.valid_until ?? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
    )
    const [taxRate, setTaxRate] = useState(String(quotation?.tax_rate ?? DEFAULT_TAX_RATE))
    const [discount, setDiscount] = useState(String(quotation?.discount ?? 0))
    const [discountPercent, setDiscountPercent] = useState(
        quotation?.discount_percent != null ? String(quotation.discount_percent) : '',
    )
    const { data: settings } = useSettings()

    // The company set is the starting point, not a permanent answer: an offer
    // that needs "50% مقدم" says so on the sheet the customer signs, and saying
    // it here must not rewrite the default for every offer after it.
    const houseConditions = parseConditions(settings?.quotation_conditions)

    const [conditions, setConditions] = useState<Condition[]>(
        quotation?.conditions?.length ? quotation.conditions : houseConditions,
    )
    const [conditionsTouched, setConditionsTouched] = useState(
        Boolean(quotation?.conditions?.length),
    )

    // Settings arrive after the first render, so a new offer opened before they
    // land would show an empty box and save it as a deliberate blank.
    useEffect(() => {
        if (!conditionsTouched && conditions.length === 0 && houseConditions.length > 0) {
            setConditions(houseConditions)
        }
    }, [conditionsTouched, conditions.length, houseConditions])

    const editConditions = (next: Condition[]) => {
        setConditionsTouched(true)
        setConditions(next)
    }

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
    const discountValue =
        discountPercent === ''
            ? Number(discount) || 0
            : Math.min(
                  Math.round(subtotal * (Number(discountPercent) || 0)) / 100,
                  subtotal,
              )
    const afterDiscount = Math.max(subtotal - discountValue, 0)
    const total = afterDiscount + afterDiscount * ((Number(taxRate) || 0) / 100)

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                customer_id: Number(customerId),
                branch_id: branchId ? Number(branchId) : null,
                title: title || null,
                valid_until: validUntil || null,
                tax_rate: Number(taxRate) || 0,
                discount: Number(discount) || 0,
                discount_percent: discountPercent === '' ? null : Number(discountPercent),
                terms: terms || null,
                notes: notes || null,
                // Only what was actually typed. A row with no label is a
                // half-finished thought, not a condition.
                conditions: conditions
                    .filter((condition) => condition.label.trim())
                    .map((condition) => ({
                        label: condition.label.trim(),
                        value: condition.value.trim(),
                    })),
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
            size="xl"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button icon={Save} onClick={handleSave} loading={save.isPending}>
                        {tr('حفظ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <CustomerSitePicker
                    customerId={customerId}
                    branchId={branchId}
                    onChange={(next) => {
                        setCustomerId(next.customerId)
                        setBranchId(next.branchId)
                    }}
                    customerError={errors.customer_id}
                    branchError={errors.branch_id}
                />

                <div className="grid gap-4 sm:grid-cols-2">

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

                <LineItems
                    columns={[
                        { label: 'الصنف', className: 'w-44' },
                        { label: 'الكود', className: 'w-20' },
                        // Declares no width on purpose: under a fixed layout
                        // that is what hands it everything the rest leaves.
                        { label: 'البيان' },
                        { label: 'الكمية', className: 'w-20' },
                        { label: 'سعر الوحدة', className: 'w-28' },
                        { label: 'الإجمالي', className: 'w-28' },
                    ]}
                    error={errors.lines}
                    onAdd={() =>
                        setRows((c) => [
                            ...c,
                            { item_id: '', description: '', qty: '1', unit_price: '0' },
                        ])
                    }
                >
                    {rows.map((row, index) => {
                        const item = items.find((i) => String(i.id) === row.item_id)
                        const short = item ? (Number(row.qty) || 0) > item.total_qty : false
                        const specs = item ? itemSpecRows(item.category, item.specs) : []

                        return (
                            <Fragment key={index}>
                                <LineRow>
                                    <LineCell>
                                        {/* Picking a catalogue item fills the
                                            description and opens at its selling
                                            price — the cost is what the company
                                            paid, and quoting that is how a sale
                                            goes out at no margin. */}
                                        <Select
                                            value={row.item_id}
                                            onChange={(e) => {
                                                const picked = items.find(
                                                    (i) => String(i.id) === e.target.value,
                                                )

                                                setRows((current) =>
                                                    current.map((r, i) =>
                                                        i === index
                                                            ? {
                                                                  ...r,
                                                                  item_id: e.target.value,
                                                                  description:
                                                                      picked?.name ?? r.description,
                                                                  unit_price:
                                                                      picked && !Number(r.unit_price)
                                                                          ? String(
                                                                                picked.sell_price ??
                                                                                    picked.avg_cost,
                                                                            )
                                                                          : r.unit_price,
                                                              }
                                                            : r,
                                                    ),
                                                )
                                            }}
                                        >
                                            <option value="">بند حر</option>
                                            {items.map((option) => (
                                                <option key={option.id} value={option.id}>
                                                    {option.name}
                                                </option>
                                            ))}
                                        </Select>
                                    </LineCell>

                                    <LineCell className="tabular truncate text-[11px] text-navy-500">
                                        {item?.code ?? '—'}
                                    </LineCell>

                                    <LineCell>
                                        <Input
                                            value={row.description}
                                            onChange={(e) => patch(index, 'description', e.target.value)}
                                            placeholder="وصف البند"
                                        />
                                    </LineCell>

                                    <LineCell>
                                        <Input
                                            type="number"
                                            min={0}
                                            step="0.001"
                                            value={row.qty}
                                            onChange={(e) => patch(index, 'qty', e.target.value)}
                                            className="px-2 text-center"
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
                                            className="px-2 text-center"
                                            dir="ltr"
                                            aria-label="سعر الوحدة"
                                        />
                                    </LineCell>

                                    <LineCell className="tabular truncate pt-4 text-left text-[13px] font-bold text-navy-800">
                                        {formatMoney(
                                            (Number(row.qty) || 0) * (Number(row.unit_price) || 0),
                                        )}
                                    </LineCell>

                                    <LineCell>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setRows((c) => c.filter((_, i) => i !== index))
                                            }
                                            className="tap grid place-items-center rounded-lg p-2 text-red-500 transition hover:bg-red-50"
                                            aria-label="حذف السطر"
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    </LineCell>
                                </LineRow>

                                {item && (
                                    <LineDetailRow span={6}>
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
                                            <span
                                                className={clsx(
                                                    'tabular font-bold',
                                                    short ? 'text-red-600' : 'text-navy-400',
                                                )}
                                            >
                                                المتاح بالمخزن: {formatQty(item.total_qty)} {item.unit}
                                                {short && ' — أقل من الكمية المعروضة'}
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

                <div className="grid gap-4 sm:grid-cols-2">
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
                            onChange={(e) => setTaxRate(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="label mb-0">الشروط والأحكام</span>

                        <button
                            type="button"
                            onClick={() => editConditions(houseConditions)}
                            className="tap inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-navy-500 transition hover:bg-navy-50"
                        >
                            <RotateCcw className="size-3.5" />
                            {tr('الشروط الافتراضية')}
                        </button>
                    </div>

                    <p className="mb-2 text-[11px] leading-relaxed text-navy-400">
                        {tr('تظهر أسفل العرض المطبوع. الشرط بلا قيمة يُطبع سطرًا منقّطًا يُملأ بخط اليد.')}
                    </p>

                    <div className="space-y-2">
                        {conditions.map((condition, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    value={condition.label}
                                    onChange={(e) =>
                                        editConditions(
                                            conditions.map((row, i) =>
                                                i === index ? { ...row, label: e.target.value } : row,
                                            ),
                                        )
                                    }
                                    placeholder="البند"
                                    className="w-40 shrink-0"
                                    aria-label="اسم الشرط"
                                />

                                <Input
                                    value={condition.value}
                                    onChange={(e) =>
                                        editConditions(
                                            conditions.map((row, i) =>
                                                i === index ? { ...row, value: e.target.value } : row,
                                            ),
                                        )
                                    }
                                    placeholder="اتركه فارغًا ليُملأ بخط اليد"
                                    aria-label="قيمة الشرط"
                                />

                                <button
                                    type="button"
                                    onClick={() =>
                                        editConditions(conditions.filter((_, i) => i !== index))
                                    }
                                    className="tap grid shrink-0 place-items-center rounded-lg p-2 text-red-500 transition hover:bg-red-50"
                                    aria-label="حذف الشرط"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {errors.conditions && (
                        <p className="mt-1 text-xs font-medium text-red-600">{errors.conditions}</p>
                    )}

                    <button
                        type="button"
                        onClick={() => editConditions([...conditions, { label: '', value: '' }])}
                        className="tap mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-brand-600 transition hover:bg-brand-50"
                    >
                        <Plus className="size-4" />
                        {tr('إضافة شرط')}
                    </button>
                </div>

                <Field label="شروط العرض" error={errors.terms} hint="الدفع، التسليم، الضمان">
                    <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} />
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} />
                </Field>

                <div className="space-y-1.5 rounded-2xl bg-navy-50 p-4 text-sm">
                    <Row label="الإجمالي قبل الخصم" value={formatMoney(subtotal)} />
                    {/* Read the resolved figure, not the field: with a rate in
                        the box the amount field holds zero, and the deduction
                        vanished from the summary while still being applied. */}
                    {discountValue > 0 && (
                        <Row
                            label={discountPercent === '' ? 'الخصم' : `الخصم (${discountPercent}%)`}
                            value={`− ${formatMoney(discountValue)}`}
                        />
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

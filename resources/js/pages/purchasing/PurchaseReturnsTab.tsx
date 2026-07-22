import clsx from 'clsx'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import {
    useItems,
    usePurchaseReturnAction,
    usePurchaseReturns,
    useSavePurchaseReturn,
    useSuppliers,
    useWarehouses,
} from '@/lib/queries'

export function PurchaseReturnsTab() {
    const toast = useToast()
    const act = usePurchaseReturnAction()
    const [creating, setCreating] = useState(false)

    const { data, isLoading } = usePurchaseReturns({ per_page: 40 })

    const run = async (id: number, action: 'post' | 'delete', done: string) => {
        try {
            await act.mutateAsync({ id, action })
            toast.success(done)
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
        }
    }

    return (
        <>
            <div className="mb-4 flex justify-end">
                <Button icon={Plus} onClick={() => setCreating(true)}>
                    مرتجع مشتريات
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Undo2}
                    title="لا توجد مرتجعات"
                    description="سجّل مرتجعًا لإرجاع بضاعة معيبة للمورّد وخصم قيمتها من حسابه."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((entry) => (
                        <div key={entry.id} className="card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular font-bold text-navy-900">
                                            {entry.code}
                                        </span>
                                        <span
                                            className={clsx(
                                                'badge',
                                                entry.status === 'posted'
                                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
                                            )}
                                        >
                                            {entry.status_label}
                                        </span>
                                    </div>

                                    <p className="mt-1 text-sm font-semibold text-navy-800">
                                        {entry.supplier}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {formatDate(entry.return_date)} · من {entry.warehouse}
                                        {entry.supplier_invoice_code &&
                                            ` · ${entry.supplier_invoice_code}`}
                                    </p>
                                    <p className="mt-1.5 text-sm text-navy-600">{entry.reason}</p>

                                    {entry.lines && entry.lines.length > 0 && (
                                        <ul className="mt-2 space-y-0.5">
                                            {entry.lines.map((line) => (
                                                <li
                                                    key={line.id}
                                                    className="tabular text-[11px] text-navy-500"
                                                >
                                                    {line.item} — {formatQty(line.qty)} {line.unit} ×{' '}
                                                    {formatMoney(line.unit_cost)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <p className="tabular shrink-0 font-extrabold text-navy-900">
                                    {formatMoney(entry.total)}
                                </p>
                            </div>

                            {entry.status === 'draft' && (
                                <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                    <button
                                        onClick={() =>
                                            run(entry.id, 'post', 'تم ترحيل المرتجع وخصمه من الحساب.')
                                        }
                                        className="tap rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                                    >
                                        ترحيل وإخراج البضاعة
                                    </button>
                                    <button
                                        onClick={() => run(entry.id, 'delete', 'تم حذف المسودة.')}
                                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                                    >
                                        <Trash2 className="size-3.5" />
                                        حذف
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {creating && <ReturnForm onClose={() => setCreating(false)} />}
        </>
    )
}

/* ── Drafting a return ───────────────────────────────────── */

interface DraftLine {
    item_id: string
    qty: string
}

function ReturnForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSavePurchaseReturn()
    const { data: suppliers } = useSuppliers({ per_page: 200 })
    const { data: warehouses } = useWarehouses()
    const { data: items } = useItems({ per_page: 300 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        supplier_id: '',
        warehouse_id: '',
        return_date: new Date().toISOString().slice(0, 10),
        reason: '',
        notes: '',
    })
    const [lines, setLines] = useState<DraftLine[]>([{ item_id: '', qty: '1' }])

    // Only stores, never a technician's van: goods go back to the supplier from
    // the shelf they were received onto.
    const stores = warehouses?.filter((warehouse) => warehouse.type === 'store') ?? []

    const estimate = lines.reduce((sum, line) => {
        const item = items?.data.find((candidate) => candidate.id === Number(line.item_id))

        return sum + (item ? item.avg_cost * Number(line.qty || 0) : 0)
    }, 0)

    return (
        <Modal
            open
            onClose={onClose}
            title="مرتجع مشتريات"
            description="لن تخرج البضاعة من المخزن إلا بعد الترحيل."
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await save.mutateAsync({
                                    supplier_id: Number(form.supplier_id),
                                    warehouse_id: form.warehouse_id
                                        ? Number(form.warehouse_id)
                                        : null,
                                    return_date: form.return_date,
                                    reason: form.reason,
                                    notes: form.notes || null,
                                    lines: lines
                                        .filter((line) => line.item_id && Number(line.qty) > 0)
                                        .map((line) => ({
                                            item_id: Number(line.item_id),
                                            qty: Number(line.qty),
                                        })),
                                })
                                toast.success('تم حفظ المرتجع كمسودة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر حفظ المرتجع.'))
                            }
                        }}
                    >
                        حفظ كمسودة
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="المورّد" required error={errors.supplier_id}>
                        <Select
                            value={form.supplier_id}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, supplier_id: e.target.value }))
                            }
                        >
                            <option value="">— اختر —</option>
                            {suppliers?.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="من مخزن" error={errors.warehouse_id}>
                        <Select
                            value={form.warehouse_id}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, warehouse_id: e.target.value }))
                            }
                        >
                            <option value="">المخزن الرئيسي</option>
                            {stores.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="التاريخ" required error={errors.return_date}>
                        <Input
                            type="date"
                            value={form.return_date}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, return_date: e.target.value }))
                            }
                        />
                    </Field>
                </div>

                <Field label="سبب الإرجاع" required error={errors.reason}>
                    <Input
                        value={form.reason}
                        onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                        placeholder="بطاريات معيبة — لا تحتفظ بالشحن"
                    />
                </Field>

                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-bold text-navy-800">الأصناف</p>
                        <button
                            onClick={() => setLines((current) => [...current, { item_id: '', qty: '1' }])}
                            className="tap rounded-lg bg-navy-100 px-3 py-1.5 text-xs font-bold text-navy-700"
                        >
                            إضافة صنف
                        </button>
                    </div>

                    {errors.lines && (
                        <p className="mb-2 text-xs font-medium text-red-600">{errors.lines}</p>
                    )}

                    <div className="space-y-2">
                        {lines.map((line, index) => (
                            <div key={index} className="flex items-end gap-2">
                                <Field label={index === 0 ? 'الصنف' : undefined} className="flex-1">
                                    <Select
                                        value={line.item_id}
                                        onChange={(e) =>
                                            setLines((current) =>
                                                current.map((row, i) =>
                                                    i === index
                                                        ? { ...row, item_id: e.target.value }
                                                        : row,
                                                ),
                                            )
                                        }
                                    >
                                        <option value="">— اختر —</option>
                                        {items?.data.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({formatQty(item.total_qty)} {item.unit})
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label={index === 0 ? 'الكمية' : undefined} className="w-28">
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.001"
                                        value={line.qty}
                                        onChange={(e) =>
                                            setLines((current) =>
                                                current.map((row, i) =>
                                                    i === index ? { ...row, qty: e.target.value } : row,
                                                ),
                                            )
                                        }
                                        dir="ltr"
                                        className="text-left"
                                    />
                                </Field>

                                {lines.length > 1 && (
                                    <button
                                        onClick={() =>
                                            setLines((current) =>
                                                current.filter((_, i) => i !== index),
                                            )
                                        }
                                        className="tap mb-0.5 grid size-10 place-items-center rounded-xl bg-red-50 text-red-600"
                                        aria-label="حذف البند"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {estimate > 0 && (
                    <div className="flex items-center justify-between rounded-xl bg-navy-50 p-3">
                        <span className="text-sm font-bold text-navy-700">
                            القيمة التقديرية للخصم
                        </span>
                        <span className="tabular font-extrabold text-navy-900">
                            {formatMoney(estimate)}
                        </span>
                    </div>
                )}

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                </Field>
            </div>
        </Modal>
    )
}

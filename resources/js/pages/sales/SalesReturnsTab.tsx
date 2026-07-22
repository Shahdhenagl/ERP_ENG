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
    useInvoices,
    useReturnableInvoice,
    useSalesReturnAction,
    useSalesReturns,
    useSaveSalesReturn,
    useWarehouses,
} from '@/lib/queries'

export function SalesReturnsTab() {
    const toast = useToast()
    const act = useSalesReturnAction()
    const [creating, setCreating] = useState(false)

    const { data, isLoading } = useSalesReturns({ per_page: 40 })

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
                    مرتجع مبيعات
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Undo2}
                    title="لا توجد مرتجعات"
                    description="سجّل مرتجعًا على فاتورة صادرة لخصم قيمته من حساب العميل وإرجاع البضاعة للمخزن."
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
                                        {entry.invoice_code && (
                                            <span className="tabular text-[11px] text-navy-400">
                                                على {entry.invoice_code}
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-1 text-sm font-semibold text-navy-800">
                                        {entry.customer}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {formatDate(entry.return_date)}
                                        {entry.warehouse && ` · إلى ${entry.warehouse}`}
                                    </p>
                                    <p className="mt-1.5 text-sm text-navy-600">{entry.reason}</p>

                                    {entry.lines && entry.lines.length > 0 && (
                                        <ul className="mt-2 space-y-0.5">
                                            {entry.lines.map((line) => (
                                                <li
                                                    key={line.id}
                                                    className="tabular text-[11px] text-navy-500"
                                                >
                                                    {line.item ?? line.description} —{' '}
                                                    {formatQty(line.qty)} ×{' '}
                                                    {formatMoney(line.unit_price)}
                                                    {!line.restock && (
                                                        <span className="mr-1.5 text-red-600">
                                                            (لا يعود للمخزن)
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="text-left">
                                    <p className="tabular font-extrabold text-navy-900">
                                        {formatMoney(entry.total)}
                                    </p>
                                    {entry.tax_amount > 0 && (
                                        <p className="tabular text-[11px] text-navy-400">
                                            منها ضريبة {formatMoney(entry.tax_amount)}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {entry.status === 'draft' && (
                                <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                    <button
                                        onClick={() =>
                                            run(entry.id, 'post', 'تم ترحيل المرتجع وخصمه من الفاتورة.')
                                        }
                                        className="tap rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                                    >
                                        ترحيل
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

            {creating && <SalesReturnForm onClose={() => setCreating(false)} />}
        </>
    )
}

/* ── Raising a credit note ───────────────────────────────── */

interface DraftLine {
    qty: string
    restock: boolean
}

function SalesReturnForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSaveSalesReturn()
    const { data: warehouses } = useWarehouses()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [invoiceId, setInvoiceId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [reason, setReason] = useState('')
    const [notes, setNotes] = useState('')
    const [chosen, setChosen] = useState<Record<number, DraftLine>>({})

    // Only issued invoices can be returned against, which is the same rule the
    // service enforces — offering a draft here would only earn a refusal.
    const { data: invoices } = useInvoices({ outstanding: undefined, per_page: 100 })
    const { data: returnable } = useReturnableInvoice(invoiceId ? Number(invoiceId) : null)

    const stores = warehouses?.filter((warehouse) => warehouse.type === 'store') ?? []
    const issued = invoices?.data.filter((invoice) => invoice.status === 'issued') ?? []

    const lines = returnable?.lines ?? []
    const taxRate = returnable?.invoice.tax_rate ?? 0

    const subtotal = lines.reduce((sum, line) => {
        const qty = Number(chosen[line.invoice_line_id]?.qty ?? 0)

        return sum + qty * line.unit_price
    }, 0)

    const tax = (subtotal * taxRate) / 100

    return (
        <Modal
            open
            onClose={onClose}
            title="مرتجع مبيعات"
            description="المرتجع يُحرَّر على فاتورة صادرة، ولا يخصم شيئًا حتى يُرحَّل."
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
                                    invoice_id: Number(invoiceId),
                                    warehouse_id: warehouseId ? Number(warehouseId) : null,
                                    reason,
                                    notes: notes || null,
                                    lines: Object.entries(chosen)
                                        .filter(([, line]) => Number(line.qty) > 0)
                                        .map(([lineId, line]) => ({
                                            invoice_line_id: Number(lineId),
                                            qty: Number(line.qty),
                                            restock: line.restock,
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
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الفاتورة" required error={errors.invoice_id}>
                        <Select
                            value={invoiceId}
                            onChange={(e) => {
                                setInvoiceId(e.target.value)
                                setChosen({})
                            }}
                        >
                            <option value="">— اختر الفاتورة —</option>
                            {issued.map((invoice) => (
                                <option key={invoice.id} value={invoice.id}>
                                    {invoice.code} · {invoice.customer?.name} ·{' '}
                                    {formatMoney(invoice.total)}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field
                        label="يعود إلى مخزن"
                        error={errors.warehouse_id}
                        hint="يُستخدم فقط للبنود التي تعود للمخزن"
                    >
                        <Select
                            value={warehouseId}
                            onChange={(e) => setWarehouseId(e.target.value)}
                        >
                            <option value="">المخزن الرئيسي</option>
                            {stores.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <Field label="سبب الإرجاع" required error={errors.reason}>
                    <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="البطارية معيبة من التركيب"
                    />
                </Field>

                {invoiceId && (
                    <div>
                        <p className="mb-2 text-sm font-bold text-navy-800">
                            البنود القابلة للإرجاع
                        </p>

                        {errors.lines && (
                            <p className="mb-2 text-xs font-medium text-red-600">{errors.lines}</p>
                        )}

                        {lines.length === 0 ? (
                            <p className="rounded-xl bg-navy-50 p-3 text-xs text-navy-400">
                                جارٍ تحميل بنود الفاتورة…
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {lines.map((line) => {
                                    const draft = chosen[line.invoice_line_id]
                                    const exhausted = line.remaining <= 0

                                    return (
                                        <div
                                            key={line.invoice_line_id}
                                            className={clsx(
                                                'rounded-xl p-3',
                                                exhausted ? 'bg-navy-50 opacity-60' : 'bg-navy-50',
                                            )}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-navy-800">
                                                        {line.description}
                                                    </p>
                                                    <p className="tabular text-[11px] text-navy-400">
                                                        بيع {formatQty(line.qty)} ·{' '}
                                                        {formatMoney(line.unit_price)}
                                                        {line.returned > 0 &&
                                                            ` · رُجّع ${formatQty(line.returned)}`}
                                                        {' · '}
                                                        <span
                                                            className={clsx(
                                                                'font-bold',
                                                                exhausted
                                                                    ? 'text-red-600'
                                                                    : 'text-emerald-700',
                                                            )}
                                                        >
                                                            متاح {formatQty(line.remaining)}
                                                        </span>
                                                    </p>
                                                </div>

                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={line.remaining}
                                                    step="0.001"
                                                    disabled={exhausted}
                                                    value={draft?.qty ?? ''}
                                                    placeholder="0"
                                                    onChange={(e) =>
                                                        setChosen((current) => ({
                                                            ...current,
                                                            [line.invoice_line_id]: {
                                                                qty: e.target.value,
                                                                restock: draft?.restock ?? true,
                                                            },
                                                        }))
                                                    }
                                                    dir="ltr"
                                                    className="w-24 text-left"
                                                />
                                            </div>

                                            {/* Only a stock line can go back on a
                                                shelf; labour has nothing to put
                                                back. */}
                                            {line.item_id && Number(draft?.qty ?? 0) > 0 && (
                                                <label className="mt-2 flex items-center gap-2 text-[11px] text-navy-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={draft?.restock ?? true}
                                                        onChange={(e) =>
                                                            setChosen((current) => ({
                                                                ...current,
                                                                [line.invoice_line_id]: {
                                                                    qty: draft?.qty ?? '0',
                                                                    restock: e.target.checked,
                                                                },
                                                            }))
                                                        }
                                                        className="size-3.5"
                                                    />
                                                    تعود للمخزن — أزل العلامة لو البضاعة تالفة
                                                </label>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {subtotal > 0 && (
                    <div className="rounded-xl bg-emerald-50 p-3 text-sm">
                        <div className="flex justify-between text-navy-700">
                            <span>قيمة المرتجع</span>
                            <span className="tabular font-bold">{formatMoney(subtotal)}</span>
                        </div>
                        {taxRate > 0 && (
                            <div className="flex justify-between text-navy-700">
                                <span>ضريبة مردودة ({taxRate}%)</span>
                                <span className="tabular font-bold">{formatMoney(tax)}</span>
                            </div>
                        )}
                        <div className="mt-1 flex justify-between border-t border-emerald-200 pt-1 font-extrabold text-navy-900">
                            <span>يُخصم من الفاتورة</span>
                            <span className="tabular">{formatMoney(subtotal + tax)}</span>
                        </div>
                    </div>
                )}

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

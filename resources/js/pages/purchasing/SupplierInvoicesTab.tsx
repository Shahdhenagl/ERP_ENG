import clsx from 'clsx'
import { FileText, Plus, Search, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import {
    useSaveSupplierInvoice,
    useSupplierInvoiceAction,
    useSupplierInvoices,
    useSuppliers,
    useUninvoicedReceipts,
} from '@/lib/queries'
import type { SupplierInvoice, SupplierPaymentState } from '@/types'

const STATE: Record<SupplierPaymentState, string> = {
    draft: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    void: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
    unpaid: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    partly_paid: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    overdue: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

export function SupplierInvoicesTab() {
    const [search, setSearch] = useState('')
    const [outstanding, setOutstanding] = useState(false)
    const [drafting, setDrafting] = useState(false)
    const [voiding, setVoiding] = useState<SupplierInvoice | null>(null)

    const toast = useToast()
    const act = useSupplierInvoiceAction()
    const { data, isLoading } = useSupplierInvoices({
        search,
        outstanding: outstanding ? 1 : undefined,
        per_page: 40,
    })

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

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
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-48 flex-1">
                    <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        placeholder="ابحث بالكود أو رقم فاتورة المورّد"
                        className="pr-10"
                        onChange={(e) => debounced(e.target.value)}
                    />
                </div>

                <button
                    onClick={() => setOutstanding((value) => !value)}
                    className={clsx(
                        'tap rounded-xl px-3 py-2.5 text-xs font-bold transition',
                        outstanding ? 'bg-navy-900 text-white' : 'bg-navy-100 text-navy-600',
                    )}
                >
                    المُرحّلة فقط
                </button>

                <Button icon={Plus} onClick={() => setDrafting(true)}>
                    فاتورة مورّد
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={FileText}
                    title="لا توجد فواتير موردين"
                    description="سجّل فاتورة على بضاعة تم استلامها لتتابع المستحق والسداد عليها."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((invoice) => (
                        <div key={invoice.id} className="card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular font-bold text-navy-900">
                                            {invoice.code}
                                        </span>
                                        <span
                                            className={clsx('badge', STATE[invoice.payment_state])}
                                        >
                                            {invoice.payment_state_label}
                                        </span>
                                        {invoice.supplier_ref && (
                                            <span className="tabular text-[11px] text-navy-400">
                                                مرجع المورّد {invoice.supplier_ref}
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-1 text-sm font-semibold text-navy-800">
                                        {invoice.supplier}
                                    </p>

                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {formatDate(invoice.invoice_date)}
                                        {invoice.due_date && ` · تستحق ${formatDate(invoice.due_date)}`}
                                        {invoice.purchase_order_code &&
                                            ` · ${invoice.purchase_order_code}`}
                                    </p>

                                    {/* The line that stops the screen looking broken: the
                                        debt did not jump by the invoice total because the
                                        goods were already owed for. */}
                                    {invoice.status === 'posted' && invoice.covered_value > 0 && (
                                        <p className="mt-1.5 text-[11px] text-navy-500">
                                            منها {formatMoney(invoice.covered_value)} مُحمّلة على
                                            الحساب وقت الاستلام · أضافت الفاتورة{' '}
                                            {formatMoney(invoice.accrual)}
                                        </p>
                                    )}

                                    {invoice.void_reason && (
                                        <p className="mt-1.5 rounded-lg bg-red-50 p-2 text-[11px] text-red-700">
                                            {invoice.void_reason}
                                        </p>
                                    )}
                                </div>

                                <div className="text-left">
                                    <p className="tabular font-extrabold text-navy-900">
                                        {formatMoney(invoice.total)}
                                    </p>
                                    {invoice.status === 'posted' && (
                                        <p className="tabular text-[11px] text-navy-400">
                                            متبقٍ {formatMoney(invoice.balance)}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                {invoice.status === 'draft' && (
                                    <>
                                        <button
                                            onClick={() => run(invoice.id, 'post', 'تم ترحيل الفاتورة.')}
                                            className="tap rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                                        >
                                            ترحيل
                                        </button>
                                        <button
                                            onClick={() => run(invoice.id, 'delete', 'تم حذف المسودة.')}
                                            className="tap rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                                        >
                                            حذف
                                        </button>
                                    </>
                                )}

                                {invoice.status === 'posted' && (
                                    <button
                                        onClick={() => setVoiding(invoice)}
                                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                                    >
                                        <Undo2 className="size-3.5" />
                                        إلغاء
                                    </button>
                                )}

                                {Boolean(invoice.receipts_count) && (
                                    <span className="rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-500">
                                        {invoice.receipts_count} استلام
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {drafting && <SupplierInvoiceForm onClose={() => setDrafting(false)} />}
            {voiding && <VoidDialog invoice={voiding} onClose={() => setVoiding(null)} />}
        </>
    )
}

/* ── Raising a bill ──────────────────────────────────────── */

function SupplierInvoiceForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSaveSupplierInvoice()
    const { data: suppliers } = useSuppliers({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [supplierId, setSupplierId] = useState('')
    const [chosen, setChosen] = useState<number[]>([])
    const [form, setForm] = useState({
        supplier_ref: '',
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: '',
        tax_rate: '0',
        notes: '',
    })

    const { data: uninvoiced } = useUninvoicedReceipts(supplierId ? Number(supplierId) : null)

    const receipts = uninvoiced?.data ?? []
    const goodsValue = receipts
        .filter((receipt) => chosen.includes(receipt.id))
        .reduce((sum, receipt) => sum + receipt.value, 0)
    const tax = (goodsValue * Number(form.tax_rate || 0)) / 100

    return (
        <Modal
            open
            onClose={onClose}
            title="فاتورة مورّد"
            description="اختر الاستلامات التي تغطيها الفاتورة — البنود تُبنى منها."
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
                                    supplier_id: Number(supplierId),
                                    supplier_ref: form.supplier_ref || null,
                                    invoice_date: form.invoice_date,
                                    due_date: form.due_date || null,
                                    tax_rate: Number(form.tax_rate || 0),
                                    notes: form.notes || null,
                                    receipt_ids: chosen,
                                    // No receipts chosen means a bill for something
                                    // with no delivery — carriage, labour — so it
                                    // needs a line of its own to have any value.
                                    lines: chosen.length
                                        ? undefined
                                        : [
                                              {
                                                  description: form.notes || 'خدمات',
                                                  qty: 1,
                                                  unit_price: 0,
                                              },
                                          ],
                                })
                                toast.success('تم حفظ الفاتورة كمسودة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر حفظ الفاتورة.'))
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
                    <Field label="المورّد" required error={errors.supplier_id}>
                        <Select
                            value={supplierId}
                            onChange={(e) => {
                                setSupplierId(e.target.value)
                                setChosen([])
                            }}
                        >
                            <option value="">— اختر المورّد —</option>
                            {suppliers?.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field
                        label="رقم فاتورة المورّد"
                        error={errors.supplier_ref}
                        hint="الرقم المطبوع على فاتورتهم"
                    >
                        <Input
                            value={form.supplier_ref}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, supplier_ref: e.target.value }))
                            }
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="تاريخ الفاتورة" required error={errors.invoice_date}>
                        <Input
                            type="date"
                            value={form.invoice_date}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, invoice_date: e.target.value }))
                            }
                        />
                    </Field>

                    <Field label="تاريخ الاستحقاق" error={errors.due_date}>
                        <Input
                            type="date"
                            value={form.due_date}
                            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                        />
                    </Field>

                    <Field label="نسبة الضريبة %" error={errors.tax_rate}>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={form.tax_rate}
                            onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                {supplierId && (
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-bold text-navy-800">
                                استلامات بلا فاتورة
                            </p>
                            <span className="tabular text-xs text-navy-400">
                                {formatMoney(uninvoiced?.total ?? 0)}
                            </span>
                        </div>

                        {receipts.length === 0 ? (
                            <p className="rounded-xl bg-navy-50 p-3 text-xs text-navy-400">
                                لا توجد استلامات بانتظار فاتورة من هذا المورّد. احفظ الفاتورة ثم
                                عدّل بنودها إن كانت عن خدمة أو نقل.
                            </p>
                        ) : (
                            <div className="max-h-64 space-y-1.5 overflow-y-auto">
                                {receipts.map((receipt) => (
                                    <label
                                        key={receipt.id}
                                        className="flex cursor-pointer items-center gap-3 rounded-xl bg-navy-50 p-3"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={chosen.includes(receipt.id)}
                                            onChange={(e) =>
                                                setChosen((current) =>
                                                    e.target.checked
                                                        ? [...current, receipt.id]
                                                        : current.filter((id) => id !== receipt.id),
                                                )
                                            }
                                            className="size-4"
                                        />

                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-navy-800">
                                                {receipt.item}
                                            </p>
                                            <p className="tabular text-[11px] text-navy-400">
                                                {formatQty(receipt.qty)} {receipt.unit} ×{' '}
                                                {formatMoney(receipt.unit_cost)}
                                                {receipt.purchase_order_code &&
                                                    ` · ${receipt.purchase_order_code}`}
                                                {receipt.received_at &&
                                                    ` · ${formatDate(receipt.received_at)}`}
                                            </p>
                                        </div>

                                        <span className="tabular shrink-0 text-sm font-bold text-navy-900">
                                            {formatMoney(receipt.value)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {chosen.length > 0 && (
                    <div className="rounded-xl bg-emerald-50 p-3 text-sm">
                        <div className="flex justify-between text-navy-700">
                            <span>قيمة البضاعة</span>
                            <span className="tabular font-bold">{formatMoney(goodsValue)}</span>
                        </div>
                        <div className="flex justify-between text-navy-700">
                            <span>الضريبة</span>
                            <span className="tabular font-bold">{formatMoney(tax)}</span>
                        </div>
                        <div className="mt-1 flex justify-between border-t border-emerald-200 pt-1 font-extrabold text-navy-900">
                            <span>الإجمالي</span>
                            <span className="tabular">{formatMoney(goodsValue + tax)}</span>
                        </div>
                        <p className="mt-1.5 text-[11px] text-emerald-800">
                            قيمة البضاعة محمّلة على حساب المورّد منذ الاستلام، فالفاتورة تضيف
                            الضريبة فقط ({formatMoney(tax)}).
                        </p>
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

/* ── Tearing one up ──────────────────────────────────────── */

function VoidDialog({ invoice, onClose }: { invoice: SupplierInvoice; onClose: () => void }) {
    const toast = useToast()
    const act = useSupplierInvoiceAction()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [reason, setReason] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title={`إلغاء الفاتورة ${invoice.code}`}
            description="الاستلامات التي تغطيها تعود «بلا فاتورة» ليمكن إصدار فاتورة صحيحة."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={act.isPending}>
                        تراجع
                    </Button>
                    <Button
                        loading={act.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await act.mutateAsync({
                                    id: invoice.id,
                                    action: 'void',
                                    payload: { reason },
                                })
                                toast.success('تم إلغاء الفاتورة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر إلغاء الفاتورة.'))
                            }
                        }}
                    >
                        إلغاء الفاتورة
                    </Button>
                </>
            }
        >
            <Field label="السبب" required error={errors.reason || errors.status}>
                <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="فاتورة مكررة من المورّد"
                />
            </Field>
        </Modal>
    )
}

import { HandCoins, Pencil, Printer, RotateCcw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, PAYMENT_METHOD } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { usePayments, useReversePayment, useUpdatePayment } from '@/lib/queries'
import type { Payment } from '@/types'

/**
 * Money collected from customers — the receipts, newest first.
 *
 * A read-through of what came in and against which invoice, so a collector can
 * see the day's takings without opening the treasury. Recording a receipt still
 * belongs to the invoice it settles; this is the ledger side of it.
 */
export function CollectionsPage() {
    const { path } = useArea()
    const toast = useToast()
    const { data, isLoading } = usePayments({ per_page: 50 })
    const reverse = useReversePayment()
    const [search, setSearch] = useState('')
    const [editing, setEditing] = useState<Payment | null>(null)
    const [reversing, setReversing] = useState<Payment | null>(null)

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase()
        const list = data?.data ?? []

        if (!term) return list

        return list.filter(
            (payment) =>
                (payment.customer ?? '').toLowerCase().includes(term) ||
                payment.code.toLowerCase().includes(term) ||
                (payment.invoice_code ?? '').toLowerCase().includes(term),
        )
    }, [data, search])

    const total = useMemo(
        () => rows.reduce((sum, payment) => sum + payment.amount, 0),
        [rows],
    )

    return (
        <>
            <PageHeader
                title="التحصيلات"
                subtitle={data ? `${data.data.length} سند · ${formatMoney(total)}` : undefined}
            />

            <div className="relative mb-4">
                <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ابحث بالعميل أو رقم السند أو الفاتورة…"
                    className="pr-10"
                />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={HandCoins}
                    title="لا توجد تحصيلات"
                    description="تظهر هنا سندات القبض من العملاء بمجرد تسجيلها على الفواتير."
                />
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((payment) => (
                        <div key={payment.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {payment.code}
                                        </span>
                                        <span className="badge bg-navy-100 text-navy-600">
                                            {payment.method_label}
                                        </span>
                                        {payment.invoice_code && (
                                            <Link
                                                to={path(`/invoices/${payment.invoice_id}`)}
                                                className="tabular text-[11px] font-bold text-emerald-600 hover:underline"
                                            >
                                                ← {payment.invoice_code}
                                            </Link>
                                        )}
                                    </div>

                                    <p className="mt-1.5 truncate font-bold text-navy-900">
                                        {payment.customer ?? '—'}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {payment.cash_box && `${payment.cash_box} · `}
                                        {formatSmart(payment.paid_at ?? payment.created_at)}
                                        {payment.actor && ` · ${payment.actor}`}
                                    </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    <p className="tabular mr-1 font-extrabold text-emerald-600">
                                        {formatMoney(payment.amount)}
                                    </p>
                                    <Link
                                        to={path(`/print/receipts/${payment.id}`)}
                                        target="_blank"
                                        className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="طباعة سند القبض"
                                    >
                                        <Printer className="size-4" />
                                    </Link>
                                    <button
                                        onClick={() => setEditing(payment)}
                                        className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="تعديل"
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                    <button
                                        onClick={() => setReversing(payment)}
                                        className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="إلغاء السند"
                                    >
                                        <RotateCcw className="size-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing && <EditReceiptModal payment={editing} onClose={() => setEditing(null)} />}

            <ConfirmDialog
                open={Boolean(reversing)}
                onClose={() => setReversing(null)}
                onConfirm={async () => {
                    if (!reversing) return
                    try {
                        await reverse.mutateAsync(reversing.id)
                        toast.success('تم إلغاء السند.')
                        setReversing(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر الإلغاء.'))
                    }
                }}
                title="إلغاء سند القبض"
                message={`سيُعكس ${reversing ? formatMoney(reversing.amount) : ''} من الخزينة بقيد عكسي. لا يُحذف السجل.`}
                confirmLabel="إلغاء السند"
                loading={reverse.isPending}
                danger
            />
        </>
    )
}

/** Correct a receipt's method, reference, date or note — never its amount or box. */
function EditReceiptModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
    const toast = useToast()
    const update = useUpdatePayment(payment.id)
    const [method, setMethod] = useState(payment.method)
    const [reference, setReference] = useState(payment.reference ?? '')
    const [paidAt, setPaidAt] = useState(payment.paid_at ?? '')
    const [note, setNote] = useState(payment.note ?? '')

    return (
        <Modal
            open
            onClose={onClose}
            title={`تعديل ${payment.code}`}
            description={`${formatMoney(payment.amount)} — القيمة والخزينة ثابتتان.`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={update.isPending}
                        onClick={async () => {
                            try {
                                await update.mutateAsync({
                                    method,
                                    reference: reference || null,
                                    paid_at: paidAt || null,
                                    note: note || null,
                                })
                                toast.success('تم حفظ التعديل.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر الحفظ.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="طريقة الدفع">
                    <Select value={method} onChange={(e) => setMethod(e.target.value as Payment['method'])}>
                        {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="التاريخ">
                    <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </Field>
                <Field label="مرجع">
                    <Input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>
                <Field label="البيان">
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

import { HandCoins, Pencil, Printer, RotateCcw, Search, Trash2 } from 'lucide-react'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { tr } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, PAYMENT_METHOD } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useArea } from '@/lib/nav'
import {
    useCashMovements,
    useDeleteCashMovement,
    usePayments,
    useReversePayment,
    useUpdateCashMovement,
    useUpdatePayment,
} from '@/lib/queries'
import type { CashMovementRow, Payment } from '@/types'

type CollectionRow =
    | { kind: 'customer'; payment: Payment }
    | { kind: 'external'; movement: CashMovementRow }

/**
 * Customer receipts and manually recorded external receipt vouchers, newest
 * first. Both increase a cash box, but only customer receipts settle invoices.
 */
export function CollectionsPage() {
    const { path } = useArea()
    const toast = useToast()
    const [view, setView] = useViewMode('collections')
    const { data: paymentData, isLoading: paymentsLoading } = usePayments({ per_page: 50 })
    const { data: externalData, isLoading: externalLoading } = useCashMovements({
        direction: 'in',
        source: 'external_deposit',
        per_page: 80,
    })
    const reverse = useReversePayment()
    const removeExternal = useDeleteCashMovement()
    const [search, setSearch] = useState('')
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
    const [editingExternal, setEditingExternal] = useState<CashMovementRow | null>(null)
    const [reversing, setReversing] = useState<Payment | null>(null)
    const [deletingExternal, setDeletingExternal] = useState<CashMovementRow | null>(null)

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase()
        const combined: CollectionRow[] = [
            ...(paymentData?.data ?? []).map((payment) => ({ kind: 'customer' as const, payment })),
            ...(externalData ?? []).map((movement) => ({ kind: 'external' as const, movement })),
        ].sort((left, right) => {
            const leftDate = rowDate(left) ?? ''
            const rightDate = rowDate(right) ?? ''
            return rightDate.localeCompare(leftDate)
        })

        if (!term) return combined

        return combined.filter((row) => {
            if (row.kind === 'customer') {
                return [row.payment.customer, row.payment.code, row.payment.invoice_code]
                    .filter(Boolean)
                    .some((value) => value!.toLowerCase().includes(term))
            }

            return [
                externalCode(row.movement),
                row.movement.category,
                row.movement.note,
                row.movement.box,
            ]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(term))
        })
    }, [externalData, paymentData, search])

    const total = useMemo(() => rows.reduce((sum, row) => sum + rowAmount(row), 0), [rows])
    const isLoading = paymentsLoading || externalLoading

    return (
        <>
            <PageHeader
                title="التحصيلات وسندات القبض"
                subtitle={`${rows.length} سند · ${formatMoney(total)}`}
            />

            <div className="relative mb-4">
                <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ابحث بالعميل أو الجهة أو رقم السند أو الفاتورة…"
                    className="pr-10"
                />
            </div>

            <div className="mb-3 flex justify-end">
                <ViewToggle view={view} onChange={setView} />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={HandCoins}
                    title="لا توجد تحصيلات أو سندات قبض"
                    description="تظهر هنا سندات قبض العملاء والإيداعات الخارجية المسجلة على الخزائن."
                />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="0"
                    className="collections-table-wrap"
                    tableClassName="collections-table table-fixed"
                    headers={[
                        { label: 'الكود', className: 'w-[8%]' },
                        { label: 'النوع', className: 'w-[13%]' },
                        { label: 'العميل / الجهة', className: 'w-[20%]' },
                        { label: 'الفاتورة', className: 'w-[12%]' },
                        { label: 'التاريخ', className: 'w-[13%]' },
                        { label: 'طريقة القبض', className: 'w-[13%]' },
                        { label: 'المبلغ', className: 'w-[10%] text-end' },
                        { label: 'الإجراءات', className: 'w-[11%] text-center' },
                    ]}
                >
                    {rows.map((row) => {
                        const customer = row.kind === 'customer' ? row.payment : null
                        const movement = row.kind === 'external' ? row.movement : null

                        return (
                            <tr key={`${row.kind}-${rowId(row)}`} className="border-t border-navy-100 hover:bg-navy-50/60">
                                <td data-label="الكود" className="tabular px-2 py-2.5 font-bold text-brand-600">{rowCode(row)}</td>
                                <td data-label="النوع" className="px-2 py-2.5">
                                    <span className={customer ? 'badge bg-emerald-50 text-emerald-700' : 'badge bg-blue-50 text-blue-700'}>
                                        {customer ? 'تحصيل عميل' : 'سند قبض خارجي'}
                                    </span>
                                </td>
                                <td data-label="العميل / الجهة" className="max-w-sm px-2 py-2.5">
                                    <p className="truncate font-semibold text-navy-800" title={rowParty(row)}>
                                        {rowParty(row)}
                                    </p>
                                    {movement?.box && <p className="mt-0.5 truncate text-[11px] text-navy-400">{movement.box}</p>}
                                </td>
                                <td data-label="الفاتورة" className="tabular px-2 py-2.5 text-navy-600">
                                    {customer?.invoice_code ?? '—'}
                                </td>
                                <td data-label="التاريخ" className="tabular px-2 py-2.5 text-navy-600">
                                    {rowDate(row) ? formatSmart(rowDate(row)!) : '—'}
                                </td>
                                <td data-label="طريقة القبض" className="px-2 py-2.5 text-navy-600">
                                    {customer?.method_label ?? 'إيداع خارجي'}
                                </td>
                                <td data-label="المبلغ" className="tabular px-2 py-2.5 text-end font-bold text-emerald-600">
                                    {formatMoney(rowAmount(row))}
                                </td>
                                <td data-label="الإجراءات" className="px-2 py-2.5">
                                    <div className="flex items-center justify-center gap-1">
                                        <ReceiptActions
                                            row={row}
                                            path={path}
                                            onEditPayment={setEditingPayment}
                                            onEditExternal={setEditingExternal}
                                            onReverse={setReversing}
                                            onDeleteExternal={setDeletingExternal}
                                        />
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </DataTable>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((row) => {
                        const customer = row.kind === 'customer' ? row.payment : null
                        const movement = row.kind === 'external' ? row.movement : null

                        return (
                            <div key={`${row.kind}-${rowId(row)}`} className="card p-3.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular text-[11px] font-bold text-brand-600">{rowCode(row)}</span>
                                            <span className={customer ? 'badge bg-emerald-50 text-emerald-700' : 'badge bg-blue-50 text-blue-700'}>
                                                {customer ? 'تحصيل عميل' : 'سند قبض خارجي'}
                                            </span>
                                            {customer?.invoice_code && (
                                                <Link
                                                    to={path(`/invoices/${customer.invoice_id}`)}
                                                    className="tabular text-[11px] font-bold text-emerald-600 hover:underline"
                                                >
                                                    ← {customer.invoice_code}
                                                </Link>
                                            )}
                                        </div>

                                        <p className="mt-1.5 truncate font-bold text-navy-900">{rowParty(row)}</p>
                                        <p className="mt-0.5 text-[11px] text-navy-400">
                                            {(customer?.cash_box ?? movement?.box) && `${customer?.cash_box ?? movement?.box} · `}
                                            {rowDate(row) ? formatSmart(rowDate(row)!) : '—'}
                                            {customer?.actor && ` · ${customer.actor}`}
                                            {movement?.actor && ` · ${movement.actor}`}
                                        </p>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                        <p className="tabular mr-1 font-extrabold text-emerald-600">{formatMoney(rowAmount(row))}</p>
                                        <ReceiptActions
                                            row={row}
                                            path={path}
                                            onEditPayment={setEditingPayment}
                                            onEditExternal={setEditingExternal}
                                            onReverse={setReversing}
                                            onDeleteExternal={setDeletingExternal}
                                        />
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {editingPayment && <EditReceiptModal payment={editingPayment} onClose={() => setEditingPayment(null)} />}
            {editingExternal && <EditCashReceiptModal movement={editingExternal} onClose={() => setEditingExternal(null)} />}

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

            <ConfirmDialog
                open={Boolean(deletingExternal)}
                onClose={() => setDeletingExternal(null)}
                onConfirm={async () => {
                    if (!deletingExternal) return
                    try {
                        await removeExternal.mutateAsync(deletingExternal.id)
                        toast.success('تم حذف سند القبض والقيود المرتبطة به.')
                        setDeletingExternal(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر حذف سند القبض.'))
                    }
                }}
                title="حذف سند القبض الخارجي"
                message={`سيُحذف سند ${deletingExternal ? externalCode(deletingExternal) : ''} والقيود المرتبطة به. لا يمكن حذف سند تمت تسويته.`}
                confirmLabel="حذف السند"
                loading={removeExternal.isPending}
                danger
            />
        </>
    )
}

function ReceiptActions({
    row,
    path,
    onEditPayment,
    onEditExternal,
    onReverse,
    onDeleteExternal,
}: {
    row: CollectionRow
    path: (to: string) => string
    onEditPayment: (payment: Payment) => void
    onEditExternal: (movement: CashMovementRow) => void
    onReverse: (payment: Payment) => void
    onDeleteExternal: (movement: CashMovementRow) => void
}) {
    if (row.kind === 'customer') {
        return (
            <>
                <Link
                    to={path(`/print/receipts/${row.payment.id}`)}
                    target="_blank"
                    className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                    aria-label="طباعة سند القبض"
                    title="طباعة"
                >
                    <Printer className="size-4" />
                </Link>
                <button
                    onClick={() => onEditPayment(row.payment)}
                    className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                    aria-label="تعديل سند القبض"
                    title="تعديل"
                >
                    <Pencil className="size-4" />
                </button>
                <button
                    onClick={() => onReverse(row.payment)}
                    className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="إلغاء سند القبض"
                    title="إلغاء بقيد عكسي"
                >
                    <RotateCcw className="size-4" />
                </button>
            </>
        )
    }

    return (
        <>
            <Link
                to={path(`/print/cash-vouchers/${row.movement.id}`)}
                target="_blank"
                className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                aria-label="طباعة سند القبض الخارجي"
                title="طباعة"
            >
                <Printer className="size-4" />
            </Link>
            <button
                onClick={() => onEditExternal(row.movement)}
                className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                aria-label="تعديل سند القبض الخارجي"
                title="تعديل"
            >
                <Pencil className="size-4" />
            </button>
            <button
                onClick={() => onDeleteExternal(row.movement)}
                className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label="حذف سند القبض الخارجي"
                title="حذف"
            >
                <Trash2 className="size-4" />
            </button>
        </>
    )
}

function rowId(row: CollectionRow): number {
    return row.kind === 'customer' ? row.payment.id : row.movement.id
}

function rowCode(row: CollectionRow): string {
    return row.kind === 'customer' ? row.payment.code : externalCode(row.movement)
}

function externalCode(movement: CashMovementRow): string {
    return `RC-${String(movement.id).padStart(5, '0')}`
}

function rowParty(row: CollectionRow): string {
    if (row.kind === 'customer') return row.payment.customer ?? '—'
    return row.movement.category ?? row.movement.note ?? 'إيداع خارجي'
}

function rowDate(row: CollectionRow): string | null {
    return row.kind === 'customer'
        ? row.payment.paid_at ?? row.payment.created_at
        : row.movement.created_at
}

function rowAmount(row: CollectionRow): number {
    return row.kind === 'customer' ? row.payment.amount : row.movement.amount
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
                        {tr('إلغاء')}
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
                        {tr('حفظ')}
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

/** A manual receipt keeps its amount, date and cash box immutable after posting. */
function EditCashReceiptModal({ movement, onClose }: { movement: CashMovementRow; onClose: () => void }) {
    const toast = useToast()
    const update = useUpdateCashMovement()
    const [category, setCategory] = useState(movement.category ?? '')
    const [note, setNote] = useState(movement.note ?? '')

    return (
        <Modal
            open
            onClose={onClose}
            title={`تعديل ${externalCode(movement)}`}
            description={`${formatMoney(movement.amount)} — لا يمكن تغيير القيمة أو التاريخ أو الخزينة بعد ترحيل السند.`}
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
                                    id: movement.id,
                                    category: category || null,
                                    note: note || null,
                                })
                                toast.success('تم حفظ التعديل.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر حفظ التعديل.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الجهة المودِعة">
                    <Input value={category} onChange={(event) => setCategory(event.target.value)} />
                </Field>
                <Field label="البيان">
                    <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

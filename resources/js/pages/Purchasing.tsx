import clsx from 'clsx'
import { Ban, PackageCheck, Pencil, Plus, Printer, ScrollText, Search, Send, Truck, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker'
import { SectionTabs } from '@/components/SectionTabs'
import { PurchaseReturnsTab } from '@/pages/purchasing/PurchaseReturnsTab'
import { RequestsTab } from '@/pages/purchasing/RequestsTab'
import { SupplierInvoicesTab } from '@/pages/purchasing/SupplierInvoicesTab'
import { PurchaseOrderForm } from '@/components/PurchaseOrderForm'
import { ReceiveOrderForm } from '@/components/ReceiveOrderForm'
import { SupplierForm } from '@/components/SupplierForm'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatQty, PAYMENT_METHOD } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import {
    useCashBoxes,
    usePaySupplier,
    usePurchaseOrder,
    usePurchaseOrderAction,
    usePurchaseOrders,
    useSupplierInvoices,
    useSuppliers,
    useSupplierStatement,
} from '@/lib/queries'
import type { PurchaseOrder, Supplier } from '@/types'

const FULFILMENT_CHIP: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    awaiting: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    partly_received: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    received: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

type Tab = 'requests' | 'orders' | 'invoices' | 'returns' | 'suppliers'

const TABS: Array<{ key: Tab; label: string; to: string }> = [
    { key: 'requests', label: 'طلبات الشراء', to: '/purchasing/requests' },
    { key: 'orders', label: 'أوامر الشراء', to: '/purchasing/orders' },
    { key: 'invoices', label: 'فواتير الموردين', to: '/purchasing/invoices' },
    { key: 'returns', label: 'مرتجعات المشتريات', to: '/purchasing/returns' },
    { key: 'suppliers', label: 'الموردون', to: '/purchasing/suppliers' },
]

export function Purchasing() {
    const { tab } = useParams<{ tab: Tab }>()
    // Orders is the section this module opens on when none is named.
    const active = TABS.find((entry) => entry.key === tab) ?? TABS[1]

    if (active.key !== tab) return <Navigate to={active.key} replace />

    return (
        <>
            <PageHeader title="المشتريات" subtitle="الموردون وأوامر الشراء والفواتير والاستلام" />

            <SectionTabs sections={TABS.map((entry) => [entry.to, entry.label] as const)} />

            {active.key === 'requests' && <RequestsTab />}
            {active.key === 'orders' && <OrdersTab />}
            {active.key === 'invoices' && <SupplierInvoicesTab />}
            {active.key === 'returns' && <PurchaseReturnsTab />}
            {active.key === 'suppliers' && <SuppliersTab />}
        </>
    )
}

/* ── Purchase orders ─────────────────────────────────────── */

function OrdersTab() {
    const toast = useToast()
    const action = usePurchaseOrderAction()

    const [openOnly, setOpenOnly] = useState(false)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<PurchaseOrder | undefined>()
    const [detailId, setDetailId] = useState<number | null>(null)

    const { data: orders, isLoading } = usePurchaseOrders({ open: openOnly ? 1 : undefined })

    const run = async (fn: () => Promise<unknown>, success: string) => {
        try {
            await fn()
            toast.success(success)
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
        }
    }

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button
                    icon={Plus}
                    onClick={() => {
                        setEditing(undefined)
                        setFormOpen(true)
                    }}
                >
                    أمر شراء جديد
                </Button>

                <button
                    onClick={() => setOpenOnly((current) => !current)}
                    className={clsx(
                        'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                        openOnly
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                    )}
                >
                    المفتوحة فقط
                </button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !orders?.length ? (
                <EmptyState
                    icon={Truck}
                    title="لا توجد أوامر شراء"
                    description="أنشئ أمر شراء بالأصناف المطلوبة، ثم سجّل الاستلام عليه عند وصول البضاعة."
                />
            ) : (
                <div className="space-y-3">
                    {orders.map((order) => (
                        <div key={order.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <button
                                    onClick={() => setDetailId(order.id)}
                                    className="min-w-0 flex-1 text-right"
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {order.code}
                                        </span>
                                        <span
                                            className={clsx('badge', FULFILMENT_CHIP[order.fulfilment])}
                                        >
                                            {order.fulfilment_label}
                                        </span>
                                    </div>

                                    <p className="mt-1.5 truncate font-bold text-navy-900">
                                        {order.supplier}
                                    </p>

                                    <p className="mt-0.5 text-xs text-navy-400">
                                        {order.order_date && formatDate(order.order_date)}
                                        {order.expected_date && ` · متوقع ${formatDate(order.expected_date)}`}
                                    </p>
                                </button>

                                <div className="shrink-0 text-left">
                                    <p className="tabular font-extrabold text-navy-900">
                                        {formatMoney(order.total)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                {order.status === 'draft' && (
                                    <>
                                        <Button
                                            variant="secondary"
                                            icon={Pencil}
                                            className="text-xs"
                                            onClick={() => {
                                                setEditing(order)
                                                setFormOpen(true)
                                            }}
                                        >
                                            تعديل
                                        </Button>
                                        <Button
                                            icon={Send}
                                            className="text-xs"
                                            onClick={() =>
                                                run(
                                                    () =>
                                                        action.mutateAsync({
                                                            id: order.id,
                                                            action: 'send',
                                                        }),
                                                    'تم إرسال أمر الشراء.',
                                                )
                                            }
                                        >
                                            إرسال للمورّد
                                        </Button>
                                    </>
                                )}

                                {order.fulfilment === 'awaiting' ||
                                order.fulfilment === 'partly_received' ? (
                                    <Button
                                        icon={PackageCheck}
                                        className="text-xs"
                                        onClick={() => setDetailId(order.id)}
                                    >
                                        تسجيل استلام
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {formOpen && (
                <PurchaseOrderForm
                    key={editing?.id ?? 'new'}
                    open={formOpen}
                    onClose={() => setFormOpen(false)}
                    order={editing}
                />
            )}

            {detailId && <OrderDetail id={detailId} onClose={() => setDetailId(null)} />}
        </>
    )
}

/* ── One order, with its receipt history ─────────────────── */

function OrderDetail({ id, onClose }: { id: number; onClose: () => void }) {
    const toast = useToast()
    const { data: order, isLoading } = usePurchaseOrder(id)
    const action = usePurchaseOrderAction()
    const [receiveOpen, setReceiveOpen] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    const [cancelOpen, setCancelOpen] = useState(false)

    if (isLoading || !order) return null

    return (
        <>
            <Modal open onClose={onClose} title={order.code} size="lg">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p className="font-bold text-navy-900">{order.supplier}</p>
                            <span className={clsx('badge mt-1', FULFILMENT_CHIP[order.fulfilment])}>
                                {order.fulfilment_label}
                            </span>
                        </div>
                        <p className="tabular text-lg font-extrabold text-navy-900">
                            {formatMoney(order.total)}
                        </p>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-navy-100">
                        {order.lines?.map((line) => (
                            <div
                                key={line.id}
                                className="flex items-center justify-between gap-3 border-b border-navy-100 p-3 last:border-0"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-navy-900">{line.item}</p>
                                    <p className="tabular mt-0.5 text-xs text-navy-400">
                                        طُلب {formatQty(line.qty)} · وصل {formatQty(line.received ?? 0)}
                                        {(line.outstanding ?? 0) > 0 && (
                                            <span className="font-bold text-amber-600">
                                                {' '}
                                                · متبقٍ {formatQty(line.outstanding ?? 0)}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <p className="tabular shrink-0 text-sm font-bold text-navy-900">
                                    {formatMoney(line.line_total ?? 0)}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(order.fulfilment === 'awaiting' || order.fulfilment === 'partly_received') && (
                            <Button icon={PackageCheck} onClick={() => setReceiveOpen(true)}>
                                تسجيل استلام
                            </Button>
                        )}

                        {order.status !== 'cancelled' && (order.fulfilment !== 'received') && (
                            <Button
                                variant="secondary"
                                icon={Ban}
                                className="text-red-600"
                                onClick={() => setCancelOpen(true)}
                            >
                                إلغاء الأمر
                            </Button>
                        )}
                    </div>

                    {order.cancel_reason && (
                        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                            سبب الإلغاء: {order.cancel_reason}
                        </p>
                    )}
                </div>
            </Modal>

            {receiveOpen && (
                <ReceiveOrderForm
                    open={receiveOpen}
                    onClose={() => {
                        setReceiveOpen(false)
                        onClose()
                    }}
                    order={order}
                />
            )}

            <Modal
                open={cancelOpen}
                onClose={() => setCancelOpen(false)}
                title="إلغاء أمر الشراء"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setCancelOpen(false)}>
                            رجوع
                        </Button>
                        <Button
                            variant="danger"
                            disabled={!cancelReason.trim()}
                            loading={action.isPending}
                            onClick={async () => {
                                try {
                                    await action.mutateAsync({
                                        id: order.id,
                                        action: 'cancel',
                                        payload: { reason: cancelReason },
                                    })
                                    toast.success('تم إلغاء أمر الشراء.')
                                    setCancelOpen(false)
                                    onClose()
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر الإلغاء.'))
                                }
                            }}
                        >
                            تأكيد
                        </Button>
                    </>
                }
            >
                <Field label="سبب الإلغاء" required>
                    <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                </Field>
                <p className="mt-2 text-xs text-navy-400">
                    لا يمكن إلغاء أمر تم استلام جزء منه.
                </p>
            </Modal>
        </>
    )
}

/* ── Suppliers ───────────────────────────────────────────── */

function SuppliersTab() {
    const [search, setSearch] = useState('')
    const [owingOnly, setOwingOnly] = useState(false)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<Supplier | undefined>()
    const [paying, setPaying] = useState<Supplier | null>(null)
    const [statementFor, setStatementFor] = useState<Supplier | null>(null)

    const { data: suppliers, isLoading } = useSuppliers({
        search,
        owing: owingOnly ? 1 : undefined,
    })

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    return (
        <>
            <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        icon={Plus}
                        onClick={() => {
                            setEditing(undefined)
                            setFormOpen(true)
                        }}
                    >
                        مورّد جديد
                    </Button>

                    <button
                        onClick={() => setOwingOnly((current) => !current)}
                        className={clsx(
                            'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                            owingOnly
                                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        المستحق عليهم فقط
                    </button>
                </div>

                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={search}
                        onChange={(event) => debounced(event.target.value)}
                        placeholder="ابحث بالاسم أو الهاتف…"
                        className="pr-10"
                    />
                </div>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !suppliers?.length ? (
                <EmptyState
                    icon={Truck}
                    title="لا يوجد موردون"
                    description="سجّل الموردين لتعرف كل بضاعة جاءت من أين وما المستحق عليهم."
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {suppliers.map((supplier) => (
                        <div key={supplier.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <span className="tabular text-[11px] font-bold text-brand-600">
                                        {supplier.code}
                                    </span>
                                    <p className="mt-1 truncate font-bold text-navy-900">
                                        {supplier.name}
                                    </p>
                                    {supplier.phone && (
                                        <p className="tabular mt-0.5 text-left text-xs text-navy-400" dir="ltr">
                                            {supplier.phone}
                                        </p>
                                    )}
                                </div>

                                <div className="shrink-0 text-left">
                                    <p className="text-[10px] font-bold text-navy-400">المستحق</p>
                                    <p
                                        className={clsx(
                                            'tabular font-extrabold',
                                            supplier.balance > 0 ? 'text-amber-600' : 'text-navy-900',
                                        )}
                                    >
                                        {formatMoney(supplier.balance)}
                                    </p>
                                    {/* Deliveries whose invoice has not turned up.
                                        Worth chasing before a month-end. */}
                                    {supplier.uninvoiced_total > 0 && (
                                        <p className="tabular mt-0.5 text-[10px] text-sky-600">
                                            بلا فاتورة {formatMoney(supplier.uninvoiced_total)}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                <Button
                                    variant="secondary"
                                    icon={Pencil}
                                    className="text-xs"
                                    onClick={() => {
                                        setEditing(supplier)
                                        setFormOpen(true)
                                    }}
                                >
                                    تعديل
                                </Button>

                                <Button
                                    variant="secondary"
                                    icon={ScrollText}
                                    className="text-xs"
                                    onClick={() => setStatementFor(supplier)}
                                >
                                    كشف حساب
                                </Button>

                                {supplier.balance > 0 && (
                                    <Button
                                        icon={Wallet}
                                        className="text-xs"
                                        onClick={() => setPaying(supplier)}
                                    >
                                        سداد
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {formOpen && (
                <SupplierForm
                    key={editing?.id ?? 'new'}
                    open={formOpen}
                    onClose={() => setFormOpen(false)}
                    supplier={editing}
                />
            )}

            {paying && <PaySupplierDialog supplier={paying} onClose={() => setPaying(null)} />}
            {statementFor && (
                <SupplierStatementDialog
                    supplier={statementFor}
                    onClose={() => setStatementFor(null)}
                />
            )}
        </>
    )
}

function PaySupplierDialog({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
    const toast = useToast()
    const { path } = useArea()
    const pay = usePaySupplier()
    const { data: boxes } = useCashBoxes()
    const { data: bills } = useSupplierInvoices({
        supplier_id: supplier.id,
        outstanding: 1,
        per_page: 100,
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [amount, setAmount] = useState(supplier.balance.toFixed(2))
    const [invoiceId, setInvoiceId] = useState('')
    const [boxId, setBoxId] = useState('')
    const [method, setMethod] = useState('cash')
    const [reference, setReference] = useState('')

    // Bills still owing something. Choosing one is what turns "3,000 paid" into
    // "3,000 against SB-2026-0004" on the statement.
    const open = bills?.data.filter((bill) => bill.balance > 0) ?? []

    // Held after a successful payment so the voucher can be printed on the
    // spot: paying and handing over the slip are one act at the counter.
    const [voucher, setVoucher] = useState<{ id: number; code: string } | null>(null)

    return (
        <Modal
            open
            onClose={onClose}
            title={`سداد لـ ${supplier.name}`}
            size="sm"
            footer={
                voucher ? (
                    <Button onClick={onClose}>تم</Button>
                ) : (
                <>
                    <Button variant="secondary" onClick={onClose} disabled={pay.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={pay.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                const created = await pay.mutateAsync({
                                    supplier_id: supplier.id,
                                    supplier_invoice_id: invoiceId ? Number(invoiceId) : null,
                                    cash_box_id: Number(boxId || boxes?.[0]?.id),
                                    amount: Number(amount),
                                    method,
                                    reference: reference || null,
                                })
                                toast.success('تم تسجيل السداد.')
                                setVoucher(created?.data ?? null)
                            } catch (caught) {
                                setErrors(fieldErrorsOf(caught))
                                toast.error(errorMessage(caught, 'تعذّر تسجيل السداد.'))
                            }
                        }}
                    >
                        تسجيل
                    </Button>
                </>
                )
            }
        >
            {voucher ? (
                <div className="space-y-4 text-center">
                    <p className="text-sm font-bold text-emerald-700">
                        تم تسجيل سند الصرف {voucher.code}
                    </p>

                    <Link
                        to={path(`/print/vouchers/${voucher.id}`)}
                        target="_blank"
                        className="btn-primary inline-flex"
                    >
                        <Printer className="size-4" />
                        طباعة السند
                    </Link>
                </div>
            ) : (
            <div className="space-y-4">
                <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-4 text-sm">
                    <span className="text-navy-500">المستحق عليه</span>
                    <span className="tabular font-extrabold text-amber-600">
                        {formatMoney(supplier.balance)}
                    </span>
                </div>

                {open.length > 0 && (
                    <Field
                        label="على فاتورة"
                        error={errors.supplier_invoice_id}
                        hint="اتركها فارغة لتسجيل دفعة تحت الحساب"
                    >
                        <Select
                            value={invoiceId}
                            onChange={(e) => {
                                setInvoiceId(e.target.value)

                                // Default the amount to what that bill still
                                // asks for — paying more is refused anyway.
                                const bill = open.find(
                                    (candidate) => candidate.id === Number(e.target.value),
                                )

                                if (bill) setAmount(bill.balance.toFixed(2))
                            }}
                        >
                            <option value="">— دفعة تحت الحساب —</option>
                            {open.map((bill) => (
                                <option key={bill.id} value={bill.id}>
                                    {bill.code}
                                    {bill.supplier_ref ? ` · ${bill.supplier_ref}` : ''} —{' '}
                                    {formatMoney(bill.balance)}
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}

                <Field label="المبلغ" required error={errors.amount}>
                    <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <Field label="من خزينة" required error={errors.cash_box_id}>
                    <Select value={boxId} onChange={(e) => setBoxId(e.target.value)}>
                        {boxes?.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} ({formatMoney(box.balance)})
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="طريقة الدفع" error={errors.method}>
                    <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                        {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="رقم الشيك / التحويل" error={errors.reference}>
                    <Input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>
            </div>
            )}
        </Modal>
    )
}

/** Local alias so this file does not need the api module's full surface. */
function fieldErrorsOf(error: unknown): Record<string, string> {
    const response = (error as { response?: { data?: { errors?: Record<string, string[]> } } })?.response

    return Object.fromEntries(
        Object.entries(response?.data?.errors ?? {}).map(([key, messages]) => [key, messages[0]]),
    )
}

/* ── Supplier statement ──────────────────────────────────── */

/**
 * One supplier's account, oldest first.
 *
 * Goods received sit on their own line rather than folded into a bill, because
 * that is the order the events happen in — and a delivery with no invoice
 * behind it is exactly what the clerk came here to find.
 */
function SupplierStatementDialog({
    supplier,
    onClose,
}: {
    supplier: Supplier
    onClose: () => void
}) {
    const period = usePeriod('year')
    const { data, isLoading } = useSupplierStatement(supplier.id, period.range)

    return (
        <Modal open onClose={onClose} title={`كشف حساب ${supplier.name}`} size="xl">
            <PeriodPicker period={period} presets={['month', 'quarter', 'year', 'all']} />

            {isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatementFigure label="رصيد أول المدة" value={data.opening_balance} />
                        <StatementFigure label="عليه" value={data.total_credit} tone="up" />
                        <StatementFigure label="له / مدفوع" value={data.total_debit} tone="down" />
                        <StatementFigure
                            label="الرصيد"
                            value={data.closing_balance}
                            tone="brand"
                        />
                    </div>

                    {data.uninvoiced > 0 && (
                        <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-800">
                            استلامات بقيمة {formatMoney(data.uninvoiced)} لم تصل فاتورتها بعد —
                            محمّلة على الحساب بالفعل.
                        </p>
                    )}

                    {data.rows.length === 0 ? (
                        <p className="rounded-xl bg-navy-50 p-4 text-center text-sm text-navy-400">
                            لا توجد حركات في هذه الفترة.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="doc-table">
                                <thead>
                                    <tr>
                                        <th className="w-24">التاريخ</th>
                                        <th className="w-28">النوع</th>
                                        <th>البيان</th>
                                        <th className="w-24 text-left">عليه</th>
                                        <th className="w-24 text-left">له</th>
                                        <th className="w-28 text-left">الرصيد</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((row, index) => (
                                        <tr key={`${row.type}-${row.code}-${index}`}>
                                            <td className="tabular text-navy-500">
                                                {row.date ? formatDate(row.date) : '—'}
                                            </td>
                                            <td className="text-navy-600">{row.type_label}</td>
                                            <td>
                                                <span className="font-semibold text-navy-800">
                                                    {row.code}
                                                </span>
                                                {row.note && (
                                                    <span className="block text-[11px] text-navy-400">
                                                        {row.note}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="tabular text-left text-amber-700">
                                                {row.credit > 0 ? formatMoney(row.credit) : '—'}
                                            </td>
                                            <td className="tabular text-left text-emerald-700">
                                                {row.debit > 0 ? formatMoney(row.debit) : '—'}
                                            </td>
                                            <td className="tabular text-left font-bold text-navy-900">
                                                {formatMoney(row.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    )
}

function StatementFigure({
    label,
    value,
    tone,
}: {
    label: string
    value: number
    tone?: 'up' | 'down' | 'brand'
}) {
    const colour = tone
        ? { up: 'text-amber-700', down: 'text-emerald-700', brand: 'text-brand-700' }[tone]
        : 'text-navy-500'

    return (
        <div className="card p-3">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p className={clsx('tabular mt-1 text-base font-extrabold', colour)}>
                {formatMoney(value)}
            </p>
        </div>
    )
}

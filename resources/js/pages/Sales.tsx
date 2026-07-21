import clsx from 'clsx'
import {
    Ban,
    CheckCircle2,
    FileText,
    Pencil,
    Plus,
    Printer,
    Receipt,
    Search,
    Send,
    ThumbsDown,
    Truck,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { QuotationForm } from '@/components/QuotationForm'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatQty, QUOTATION_STATUS, SALES_BILLING_STATE, SALES_ORDER_STATUS } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import {
    useQuotation,
    useQuotationAction,
    useQuotations,
    useSalesOrder,
    useSalesOrderAction,
    useSalesOrders,
} from '@/lib/queries'
import type { Quotation } from '@/types'
import { Link, useNavigate } from 'react-router-dom'

export function Sales() {
    const [tab, setTab] = useState<'quotations' | 'orders'>('quotations')

    return (
        <>
            <PageHeader title="المبيعات" subtitle="عروض الأسعار وأوامر البيع" />

            <div className="mb-4 flex gap-1 rounded-xl bg-navy-100 p-1">
                {(
                    [
                        ['quotations', 'عروض الأسعار'],
                        ['orders', 'أوامر البيع'],
                    ] as Array<['quotations' | 'orders', string]>
                ).map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => setTab(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                            tab === value ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'quotations' ? <QuotationsTab /> : <OrdersTab />}
        </>
    )
}

/* ── Quotations ──────────────────────────────────────────── */

function QuotationsTab() {
    const [search, setSearch] = useState('')
    const [awaiting, setAwaiting] = useState(false)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<Quotation | undefined>()
    const [detailId, setDetailId] = useState<number | null>(null)

    const { data: quotations, isLoading } = useQuotations({
        search,
        awaiting: awaiting ? 1 : undefined,
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
                        عرض سعر جديد
                    </Button>

                    <button
                        onClick={() => setAwaiting((current) => !current)}
                        className={clsx(
                            'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                            awaiting
                                ? 'bg-sky-50 text-sky-700 ring-sky-200'
                                : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        بانتظار رد العميل
                    </button>
                </div>

                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={search}
                        onChange={(event) => debounced(event.target.value)}
                        placeholder="ابحث بالكود أو العميل…"
                        className="pr-10"
                    />
                </div>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !quotations?.length ? (
                <EmptyState
                    icon={FileText}
                    title="لا توجد عروض أسعار"
                    description="سجّل ما تعرضه على العميل، ليتحول إلى أمر بيع بضغطة عند الموافقة."
                />
            ) : (
                <div className="space-y-3">
                    {quotations.map((quotation) => (
                        <button
                            key={quotation.id}
                            onClick={() => setDetailId(quotation.id)}
                            className="card-interactive block w-full p-4 text-right"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {quotation.code}
                                        </span>
                                        <span
                                            className={clsx(
                                                'badge',
                                                QUOTATION_STATUS[quotation.effective_status].chip,
                                            )}
                                        >
                                            {quotation.effective_status_label}
                                        </span>
                                        {quotation.sales_order_code && (
                                            <span className="tabular text-[11px] font-bold text-emerald-600">
                                                ← {quotation.sales_order_code}
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-1.5 truncate font-bold text-navy-900">
                                        {quotation.customer}
                                    </p>
                                    {quotation.title && (
                                        <p className="truncate text-xs text-navy-400">{quotation.title}</p>
                                    )}

                                    {/* Only worth showing while a reply is still expected. */}
                                    {quotation.effective_status === 'sent' &&
                                        quotation.days_remaining !== null && (
                                            <p className="mt-1 text-[11px] font-bold text-amber-600">
                                                متبقٍ {quotation.days_remaining} يوم على انتهاء الصلاحية
                                            </p>
                                        )}
                                </div>

                                <p className="tabular shrink-0 font-extrabold text-navy-900">
                                    {formatMoney(quotation.total)}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {formOpen && (
                <QuotationForm
                    key={editing?.id ?? 'new'}
                    open={formOpen}
                    onClose={() => setFormOpen(false)}
                    quotation={editing}
                />
            )}

            {detailId && (
                <QuotationDetail
                    id={detailId}
                    onClose={() => setDetailId(null)}
                    onEdit={(quotation) => {
                        setDetailId(null)
                        setEditing(quotation)
                        setFormOpen(true)
                    }}
                />
            )}
        </>
    )
}

function QuotationDetail({
    id,
    onClose,
    onEdit,
}: {
    id: number
    onClose: () => void
    onEdit: (quotation: Quotation) => void
}) {
    const toast = useToast()
    const { path } = useArea()
    const action = useQuotationAction()
    const { data: quotation, isLoading } = useQuotation(id)
    const [reasonFor, setReasonFor] = useState<'reject' | 'cancel' | null>(null)
    const [reason, setReason] = useState('')

    if (isLoading || !quotation) return null

    const run = async (act: 'send' | 'accept', success: string) => {
        try {
            const result = await action.mutateAsync({ id: quotation.id, action: act })
            toast.success(
                act === 'accept' && result?.data?.sales_order_code
                    ? `${success} (${result.data.sales_order_code})`
                    : success,
            )

            if (act === 'accept') onClose()
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
        }
    }

    return (
        <>
            <Modal open onClose={onClose} title={quotation.code} size="lg">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="font-bold text-navy-900">{quotation.customer}</p>
                            {quotation.title && (
                                <p className="text-sm text-navy-500">{quotation.title}</p>
                            )}
                            <span
                                className={clsx(
                                    'badge mt-1.5',
                                    QUOTATION_STATUS[quotation.effective_status].chip,
                                )}
                            >
                                {quotation.effective_status_label}
                            </span>
                        </div>

                        <div className="text-left">
                            <p className="tabular text-lg font-extrabold text-navy-900">
                                {formatMoney(quotation.total)}
                            </p>
                            {quotation.valid_until && (
                                <p className="text-[11px] text-navy-400">
                                    صالح حتى {formatDate(quotation.valid_until)}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-navy-100">
                        {quotation.lines?.map((line) => (
                            <div
                                key={line.id}
                                className="flex items-center justify-between gap-3 border-b border-navy-100 p-3 last:border-0"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-navy-900">
                                        {line.description}
                                    </p>
                                    <p className="tabular mt-0.5 text-xs text-navy-400">
                                        {formatQty(line.qty)} × {formatMoney(line.unit_price)}
                                    </p>
                                </div>
                                <p className="tabular shrink-0 text-sm font-bold text-navy-900">
                                    {formatMoney(line.line_total)}
                                </p>
                            </div>
                        ))}
                    </div>

                    {quotation.terms && (
                        <div className="rounded-2xl bg-navy-50 p-3">
                            <p className="mb-1 text-[11px] font-bold text-navy-400">شروط العرض</p>
                            <p className="text-sm whitespace-pre-line text-navy-700">{quotation.terms}</p>
                        </div>
                    )}

                    {quotation.reject_reason && (
                        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                            {quotation.reject_reason}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-navy-100 pt-4">
                        {/* Available from draft onwards — a quote is often
                            printed to be read over before it is sent. */}
                        <Link
                            to={path(`/print/quotations/${quotation.id}`)}
                            className="btn-secondary text-xs"
                        >
                            <Printer className="size-4" />
                            طباعة
                        </Link>

                        {quotation.status === 'draft' && (
                            <>
                                <Button
                                    variant="secondary"
                                    icon={Pencil}
                                    className="text-xs"
                                    onClick={() => onEdit(quotation)}
                                >
                                    تعديل
                                </Button>
                                <Button
                                    icon={Send}
                                    className="text-xs"
                                    loading={action.isPending}
                                    onClick={() => run('send', 'تم إرسال العرض.')}
                                >
                                    إرسال للعميل
                                </Button>
                            </>
                        )}

                        {quotation.status === 'sent' && (
                            <>
                                <Button
                                    icon={CheckCircle2}
                                    className="text-xs"
                                    loading={action.isPending}
                                    onClick={() => run('accept', 'تم قبول العرض وتحويله إلى أمر بيع.')}
                                >
                                    العميل وافق
                                </Button>
                                <Button
                                    variant="secondary"
                                    icon={ThumbsDown}
                                    className="text-xs text-red-600"
                                    onClick={() => setReasonFor('reject')}
                                >
                                    العميل رفض
                                </Button>
                            </>
                        )}

                        {!['accepted', 'cancelled', 'rejected'].includes(quotation.status) && (
                            <Button
                                variant="secondary"
                                icon={Ban}
                                className="text-xs"
                                onClick={() => setReasonFor('cancel')}
                            >
                                إلغاء
                            </Button>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                open={Boolean(reasonFor)}
                onClose={() => setReasonFor(null)}
                title={reasonFor === 'reject' ? 'رفض العميل للعرض' : 'إلغاء العرض'}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setReasonFor(null)}>
                            رجوع
                        </Button>
                        <Button
                            variant="danger"
                            disabled={reasonFor === 'cancel' && !reason.trim()}
                            loading={action.isPending}
                            onClick={async () => {
                                try {
                                    await action.mutateAsync({
                                        id: quotation.id,
                                        action: reasonFor!,
                                        payload: { reason },
                                    })
                                    toast.success('تم التسجيل.')
                                    setReasonFor(null)
                                    onClose()
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                                }
                            }}
                        >
                            تأكيد
                        </Button>
                    </>
                }
            >
                <Field
                    label="السبب"
                    required={reasonFor === 'cancel'}
                    hint="يبقى في السجل — معرفة سبب الرفض هو نصف فائدة التسعير"
                >
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
            </Modal>
        </>
    )
}

/* ── Sales orders ────────────────────────────────────────── */

function OrdersTab() {
    const [uninvoiced, setUninvoiced] = useState(false)
    const [detailId, setDetailId] = useState<number | null>(null)

    const { data: orders, isLoading } = useSalesOrders({
        uninvoiced: uninvoiced ? 1 : undefined,
    })

    return (
        <>
            <div className="mb-4">
                <button
                    onClick={() => setUninvoiced((current) => !current)}
                    className={clsx(
                        'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                        uninvoiced
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                    )}
                >
                    لم تتم فوترته
                </button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !orders?.length ? (
                <EmptyState
                    icon={Truck}
                    title="لا توجد أوامر بيع"
                    description="أوامر البيع تنشأ تلقائيًا عند موافقة العميل على عرض السعر."
                />
            ) : (
                <div className="space-y-3">
                    {orders.map((order) => (
                        <button
                            key={order.id}
                            onClick={() => setDetailId(order.id)}
                            className="card-interactive block w-full p-4 text-right"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {order.code}
                                        </span>
                                        <span className={clsx('badge', SALES_ORDER_STATUS[order.status].chip)}>
                                            {order.status_label}
                                        </span>
                                        <span
                                            className={clsx(
                                                'badge',
                                                SALES_BILLING_STATE[order.billing_state].chip,
                                            )}
                                        >
                                            {order.billing_state_label}
                                        </span>
                                    </div>

                                    <p className="mt-1.5 truncate font-bold text-navy-900">
                                        {order.customer}
                                    </p>
                                    <p className="text-xs text-navy-400">
                                        {order.order_date && formatDate(order.order_date)}
                                        {order.quotation_code && ` · من ${order.quotation_code}`}
                                    </p>
                                </div>

                                <p className="tabular shrink-0 font-extrabold text-navy-900">
                                    {formatMoney(order.total)}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {detailId && <OrderDetail id={detailId} onClose={() => setDetailId(null)} />}
        </>
    )
}

function OrderDetail({ id, onClose }: { id: number; onClose: () => void }) {
    const toast = useToast()
    const navigate = useNavigate()
    const { path } = useArea()
    const action = useSalesOrderAction()
    const { data: order, isLoading } = useSalesOrder(id)
    const [cancelOpen, setCancelOpen] = useState(false)
    const [reason, setReason] = useState('')

    if (isLoading || !order) return null

    return (
        <>
            <Modal open onClose={onClose} title={order.code} size="lg">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="font-bold text-navy-900">{order.customer}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <span className={clsx('badge', SALES_ORDER_STATUS[order.status].chip)}>
                                    {order.status_label}
                                </span>
                                <span
                                    className={clsx('badge', SALES_BILLING_STATE[order.billing_state].chip)}
                                >
                                    {order.billing_state_label}
                                </span>
                            </div>
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
                                    <p className="truncate text-sm font-bold text-navy-900">
                                        {line.description}
                                    </p>
                                    <p className="tabular mt-0.5 text-xs text-navy-400">
                                        {formatQty(line.qty)} × {formatMoney(line.unit_price)}
                                    </p>
                                </div>
                                <p className="tabular shrink-0 text-sm font-bold text-navy-900">
                                    {formatMoney(line.line_total)}
                                </p>
                            </div>
                        ))}
                    </div>

                    {Boolean(order.invoices?.length) && (
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-bold text-navy-400">الفواتير</p>
                            {order.invoices?.map((invoice) => (
                                <div
                                    key={invoice.id}
                                    className="flex items-center justify-between rounded-xl bg-navy-50 px-3 py-2 text-sm"
                                >
                                    <span className="tabular font-bold text-navy-700">{invoice.code}</span>
                                    <span className="text-xs text-navy-500">
                                        {invoice.payment_state_label} · {formatMoney(invoice.total)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-navy-100 pt-4">
                        {order.billing_state === 'not_invoiced' && order.status !== 'cancelled' && (
                            <Button
                                icon={Receipt}
                                className="text-xs"
                                loading={action.isPending}
                                onClick={async () => {
                                    try {
                                        const invoice = await action.mutateAsync({
                                            id: order.id,
                                            action: 'invoice',
                                        })
                                        toast.success(`تم إنشاء الفاتورة ${invoice.code}.`)
                                        onClose()
                                        navigate(path(`/invoices/${invoice.id}`))
                                    } catch (caught) {
                                        toast.error(errorMessage(caught, 'تعذّر إنشاء الفاتورة.'))
                                    }
                                }}
                            >
                                إنشاء فاتورة
                            </Button>
                        )}

                        {order.status === 'open' && (
                            <Button
                                variant="secondary"
                                icon={Truck}
                                className="text-xs"
                                onClick={async () => {
                                    try {
                                        await action.mutateAsync({ id: order.id, action: 'deliver' })
                                        toast.success('تم تسجيل التسليم.')
                                    } catch (caught) {
                                        toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                                    }
                                }}
                            >
                                تم التسليم
                            </Button>
                        )}

                        {order.status !== 'cancelled' && order.billing_state === 'not_invoiced' && (
                            <Button
                                variant="secondary"
                                icon={Ban}
                                className="text-xs text-red-600"
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

            <Modal
                open={cancelOpen}
                onClose={() => setCancelOpen(false)}
                title="إلغاء أمر البيع"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setCancelOpen(false)}>
                            رجوع
                        </Button>
                        <Button
                            variant="danger"
                            disabled={!reason.trim()}
                            loading={action.isPending}
                            onClick={async () => {
                                try {
                                    await action.mutateAsync({
                                        id: order.id,
                                        action: 'cancel',
                                        payload: { reason },
                                    })
                                    toast.success('تم الإلغاء.')
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
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
            </Modal>
        </>
    )
}

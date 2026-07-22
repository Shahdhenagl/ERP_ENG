import clsx from 'clsx'
import { ArrowRight, Ban, Building2, CheckCircle2, Pencil, Printer, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { InvoiceForm } from '@/components/InvoiceForm'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { PaymentForm } from '@/components/PaymentForm'
import { useToast } from '@/components/Toast'
import { Button, ErrorState, Field, PageLoader, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatQty, PAYMENT_STATE } from '@/lib/domain'
import { formatDate, formatSmart } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useInvoice, useInvoiceAction, useReversePayment } from '@/lib/queries'

export function InvoiceDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { path } = useArea()
    const toast = useToast()

    const { data: invoice, isLoading, isError, refetch } = useInvoice(id)
    const action = useInvoiceAction()
    const reverse = useReversePayment()

    const [payOpen, setPayOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [voidOpen, setVoidOpen] = useState(false)
    const [voidReason, setVoidReason] = useState('')
    const [reversing, setReversing] = useState<number | null>(null)

    if (isLoading) return <PageLoader />
    if (isError || !invoice) {
        return <ErrorState message="تعذّر تحميل الفاتورة." onRetry={() => void refetch()} />
    }

    const state = PAYMENT_STATE[invoice.payment_state]
    const isDraft = invoice.status === 'draft'
    const collectable = invoice.status === 'issued' && invoice.balance > 0.005

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
            <div className="mb-4 flex items-center justify-between gap-2">
                <button onClick={() => navigate(-1)} className="btn-ghost tap -mr-2 text-sm">
                    <ArrowRight className="size-4" />
                    رجوع
                </button>

                {/* Opens the document rather than printing this screen — the
                    customer's copy needs a letterhead, not a nav bar. */}
                <Link
                    to={path(`/print/invoices/${invoice.id}`)}
                    className="btn-secondary tap text-sm"
                >
                    <Printer className="size-4" />
                    طباعة
                </Link>
            </div>

            {/* ══ Header ════════════════════════════════════════ */}
            <div className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular text-sm font-extrabold text-brand-600">
                                {invoice.code}
                            </span>
                            <span className={clsx('badge', state.chip)}>{state.label}</span>
                        </div>

                        <p className="mt-2 flex items-center gap-1.5 font-bold text-navy-900">
                            <Building2 className="size-4 text-navy-300" />
                            {invoice.customer?.name}
                        </p>

                        <p className="mt-1 text-xs text-navy-400">
                            {invoice.issue_date && `صدرت ${formatDate(invoice.issue_date)}`}
                            {invoice.due_date && ` · تستحق ${formatDate(invoice.due_date)}`}
                            {invoice.task_code && ` · ${invoice.task_code}`}
                        </p>
                    </div>

                    <div className="text-left">
                        <p className="tabular text-2xl font-extrabold text-navy-900">
                            {formatMoney(invoice.total)}
                        </p>
                        {invoice.balance > 0 && invoice.status === 'issued' && (
                            <p className="tabular text-xs font-bold text-amber-600">
                                متبقٍ {formatMoney(invoice.balance)}
                            </p>
                        )}
                        {/* Stated on its own line: an invoice whose balance
                            fell without a receipt looks like a mistake unless
                            the reason is on the page. */}
                        {invoice.credited_total > 0 && (
                            <p className="tabular text-xs font-bold text-violet-700">
                                مرتجع {formatMoney(invoice.credited_total)}
                            </p>
                        )}
                    </div>
                </div>

                {invoice.void_reason && (
                    <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                        سبب الإلغاء: {invoice.void_reason}
                    </p>
                )}
            </div>

            {/* ══ Actions ═══════════════════════════════════════ */}
            {invoice.status !== 'void' && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {isDraft && (
                        <>
                            {/* A draft from a job carries a zero labour line on
                                purpose — this is where its price gets set. */}
                            <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
                                تعديل البنود
                            </Button>

                            <Button
                                icon={CheckCircle2}
                                loading={action.isPending}
                                onClick={() =>
                                    run(
                                        () => action.mutateAsync({ id: invoice.id, action: 'issue' }),
                                        'تم إصدار الفاتورة.',
                                    )
                                }
                            >
                                إصدار الفاتورة
                            </Button>
                        </>
                    )}

                    {collectable && (
                        <Button icon={Wallet} onClick={() => setPayOpen(true)}>
                            تسجيل تحصيل
                        </Button>
                    )}

                    <Button
                        variant="secondary"
                        icon={Ban}
                        className="text-red-600"
                        onClick={() => setVoidOpen(true)}
                    >
                        إلغاء الفاتورة
                    </Button>
                </div>
            )}

            {/* ══ Lines ═════════════════════════════════════════ */}
            <section className="card mt-5 overflow-hidden">
                <h2 className="border-b border-navy-100 p-4 text-sm font-bold text-navy-800">البنود</h2>

                <div className="divide-y divide-navy-100">
                    {invoice.lines?.map((line) => (
                        <div key={line.id} className="flex items-start justify-between gap-3 p-4">
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

                <div className="space-y-1.5 bg-navy-50 p-4 text-sm">
                    <Row label="الإجمالي قبل الخصم" value={formatMoney(invoice.subtotal)} />
                    {invoice.discount > 0 && (
                        <Row label="الخصم" value={`− ${formatMoney(invoice.discount)}`} />
                    )}
                    {invoice.tax_rate > 0 && (
                        <Row
                            label={`ضريبة القيمة المضافة (${invoice.tax_rate}%)`}
                            value={formatMoney(invoice.tax_amount)}
                        />
                    )}
                    <div className="flex items-center justify-between border-t border-navy-200 pt-2">
                        <span className="font-bold text-navy-800">الإجمالي</span>
                        <span className="tabular text-lg font-extrabold text-navy-900">
                            {formatMoney(invoice.total)}
                        </span>
                    </div>
                </div>
            </section>

            {/* ══ Receipts ══════════════════════════════════════ */}
            <section className="mt-5">
                <h2 className="mb-3 font-bold text-navy-900">سندات القبض</h2>

                {!invoice.payments?.length ? (
                    <p className="card p-4 text-sm text-navy-400">لم يُحصَّل أي مبلغ بعد.</p>
                ) : (
                    <div className="space-y-2">
                        {invoice.payments.map((payment) => (
                            <div key={payment.id} className="card flex items-center justify-between gap-3 p-4">
                                <div className="min-w-0">
                                    <p className="tabular text-[11px] font-bold text-brand-600">
                                        {payment.code}
                                    </p>
                                    <p className="mt-0.5 text-sm font-bold text-navy-900">
                                        {formatMoney(payment.amount)}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {payment.method_label}
                                        {payment.cash_box && ` · ${payment.cash_box}`}
                                        {payment.paid_at && ` · ${formatSmart(payment.paid_at)}`}
                                    </p>
                                </div>

                                <button
                                    onClick={() => setReversing(payment.id)}
                                    className="tap shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"
                                >
                                    إلغاء السند
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {payOpen && (
                <PaymentForm open={payOpen} onClose={() => setPayOpen(false)} invoice={invoice} />
            )}

            {editOpen && (
                <InvoiceForm open={editOpen} onClose={() => setEditOpen(false)} invoice={invoice} />
            )}

            <Modal
                open={voidOpen}
                onClose={() => setVoidOpen(false)}
                title="إلغاء الفاتورة"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setVoidOpen(false)}>
                            رجوع
                        </Button>
                        <Button
                            variant="danger"
                            loading={action.isPending}
                            disabled={!voidReason.trim()}
                            onClick={async () => {
                                await run(
                                    () =>
                                        action.mutateAsync({
                                            id: invoice.id,
                                            action: 'void',
                                            payload: { reason: voidReason },
                                        }),
                                    'تم إلغاء الفاتورة.',
                                )
                                setVoidOpen(false)
                            }}
                        >
                            تأكيد الإلغاء
                        </Button>
                    </>
                }
            >
                <Field label="سبب الإلغاء" required>
                    <Textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
                </Field>
                <p className="mt-2 text-xs text-navy-400">
                    الفاتورة الملغاة تبقى في السجل ولا تُحذف — ولا يمكن إلغاء فاتورة عليها تحصيل.
                </p>
            </Modal>

            <ConfirmDialog
                open={Boolean(reversing)}
                onClose={() => setReversing(null)}
                onConfirm={async () => {
                    await run(() => reverse.mutateAsync(reversing!), 'تم إلغاء سند القبض.')
                    setReversing(null)
                }}
                title="إلغاء سند القبض"
                message="سيُسجَّل قيد عكسي في الخزينة ويعود المبلغ إلى رصيد الفاتورة. السجل يحتفظ بالحركتين."
                confirmLabel="إلغاء السند"
                loading={reverse.isPending}
                danger
            />
        </>
    )
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-navy-500">{label}</span>
            <span className="tabular font-semibold text-navy-800">{value}</span>
        </div>
    )
}

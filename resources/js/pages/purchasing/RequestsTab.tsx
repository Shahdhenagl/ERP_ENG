import clsx from 'clsx'
import { Check, ClipboardList, Plus, Send, ShoppingCart, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatQty, PRIORITY } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import {
    useItems,
    usePurchaseRequestAction,
    usePurchaseRequests,
    useSavePurchaseRequest,
    useSuppliers,
} from '@/lib/queries'
import type { PurchaseRequest } from '@/types'

const STATUS_CHIP: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    submitted: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    ordered: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
}

export function RequestsTab() {
    const toast = useToast()
    const { user, canDispatch } = useAuth()
    const act = usePurchaseRequestAction()

    const [awaiting, setAwaiting] = useState(false)
    const [creating, setCreating] = useState(false)
    const [deciding, setDeciding] = useState<{ row: PurchaseRequest; approve: boolean } | null>(null)
    const [ordering, setOrdering] = useState<PurchaseRequest | null>(null)

    const { data, isLoading } = usePurchaseRequests({
        awaiting: awaiting ? 1 : undefined,
        per_page: 40,
    })

    const run = async (id: number, action: 'submit' | 'delete', done: string) => {
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
                <Button icon={Plus} onClick={() => setCreating(true)}>
                    طلب شراء
                </Button>

                {canDispatch && (
                    <button
                        onClick={() => setAwaiting((current) => !current)}
                        className={clsx(
                            'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                            awaiting
                                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        بانتظار الاعتماد
                        {data?.meta.awaiting ? ` (${data.meta.awaiting})` : ''}
                    </button>
                )}
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={ClipboardList}
                    title="لا توجد طلبات شراء"
                    description="الفني اللي خلصت منه قطعة يقدر يطلبها من هنا، والمدير يعتمدها ويحوّلها لأمر شراء."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((row) => {
                        const mine = row.requested_by === user?.id

                        return (
                            <div key={row.id} className="card p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular font-bold text-navy-900">
                                                {row.code}
                                            </span>
                                            <span className={clsx('badge', STATUS_CHIP[row.status])}>
                                                {row.status_label}
                                            </span>
                                            {row.priority !== 'normal' && (
                                                <span
                                                    className={clsx('badge', PRIORITY[row.priority].chip)}
                                                >
                                                    {PRIORITY[row.priority].label}
                                                </span>
                                            )}
                                            {row.purchase_order_code && (
                                                <span className="tabular text-[11px] font-bold text-brand-600">
                                                    ← {row.purchase_order_code}
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 text-sm font-semibold text-navy-800">
                                            {row.requester}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-navy-400">
                                            {formatDate(row.created_at)}
                                            {row.needed_by && ` · مطلوب قبل ${formatDate(row.needed_by)}`}
                                            {row.task_code && ` · ${row.task_code}`}
                                        </p>

                                        {row.reason && (
                                            <p className="mt-1.5 text-sm text-navy-600">{row.reason}</p>
                                        )}

                                        {row.lines && (
                                            <ul className="mt-2 space-y-0.5">
                                                {row.lines.map((line) => (
                                                    <li
                                                        key={line.id}
                                                        className="tabular text-[11px] text-navy-500"
                                                    >
                                                        {line.description} — {formatQty(line.qty)}{' '}
                                                        {line.unit ?? ''}
                                                        {/* Said before approving, not after: this
                                                            line cannot become an order line. */}
                                                        {!line.in_catalogue && (
                                                            <span className="mr-1.5 text-amber-600">
                                                                (غير مسجّل في المخزون)
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        {row.decision_note && (
                                            <p className="mt-2 rounded-lg bg-navy-50 p-2 text-[11px] text-navy-600">
                                                {row.decider}: {row.decision_note}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                    {mine && row.is_editable && (
                                        <>
                                            <button
                                                onClick={() => run(row.id, 'submit', 'تم إرسال الطلب.')}
                                                className="tap inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                                            >
                                                <Send className="size-3.5" />
                                                إرسال
                                            </button>
                                            <button
                                                onClick={() => run(row.id, 'delete', 'تم حذف الطلب.')}
                                                className="tap inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                                            >
                                                <Trash2 className="size-3.5" />
                                                حذف
                                            </button>
                                        </>
                                    )}

                                    {/* Approving is a separate act by someone else — the
                                        whole reason the document exists. */}
                                    {canDispatch && row.status === 'submitted' && !mine && (
                                        <>
                                            <button
                                                onClick={() => setDeciding({ row, approve: true })}
                                                className="tap inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                                            >
                                                <Check className="size-3.5" />
                                                اعتماد
                                            </button>
                                            <button
                                                onClick={() => setDeciding({ row, approve: false })}
                                                className="tap inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                                            >
                                                <X className="size-3.5" />
                                                رفض
                                            </button>
                                        </>
                                    )}

                                    {canDispatch && row.status === 'submitted' && mine && (
                                        <span className="rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-400">
                                            لا يمكنك اعتماد طلبك بنفسك
                                        </span>
                                    )}

                                    {canDispatch && row.status === 'approved' && (
                                        <button
                                            onClick={() => setOrdering(row)}
                                            className="tap inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700"
                                        >
                                            <ShoppingCart className="size-3.5" />
                                            تحويل لأمر شراء
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {creating && <RequestForm onClose={() => setCreating(false)} />}
            {deciding && (
                <DecideDialog
                    row={deciding.row}
                    approve={deciding.approve}
                    onClose={() => setDeciding(null)}
                />
            )}
            {ordering && <OrderDialog row={ordering} onClose={() => setOrdering(null)} />}
        </>
    )
}

/* ── Asking ──────────────────────────────────────────────── */

interface DraftLine {
    item_id: string
    description: string
    qty: string
}

function RequestForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSavePurchaseRequest()
    const { data: items } = useItems({ per_page: 300 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({ needed_by: '', priority: 'normal', reason: '' })
    const [lines, setLines] = useState<DraftLine[]>([{ item_id: '', description: '', qty: '1' }])

    return (
        <Modal
            open
            onClose={onClose}
            title="طلب شراء"
            description="اطلب ما نفد. لو الصنف غير مسجّل في المخزون اكتب اسمه ونوصفه."
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
                                    needed_by: form.needed_by || null,
                                    priority: form.priority,
                                    reason: form.reason || null,
                                    lines: lines
                                        .filter(
                                            (line) =>
                                                Number(line.qty) > 0 &&
                                                (line.item_id || line.description),
                                        )
                                        .map((line) => ({
                                            item_id: line.item_id ? Number(line.item_id) : null,
                                            description: line.description || null,
                                            qty: Number(line.qty),
                                        })),
                                })
                                toast.success('تم حفظ الطلب كمسودة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر حفظ الطلب.'))
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
                    <Field label="مطلوب قبل" error={errors.needed_by}>
                        <Input
                            type="date"
                            value={form.needed_by}
                            onChange={(e) => setForm((f) => ({ ...f, needed_by: e.target.value }))}
                        />
                    </Field>

                    <Field label="الأولوية" error={errors.priority}>
                        <Select
                            value={form.priority}
                            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                        >
                            <option value="low">منخفضة</option>
                            <option value="normal">عادية</option>
                            <option value="high">عالية</option>
                            <option value="urgent">عاجلة</option>
                        </Select>
                    </Field>
                </div>

                <Field label="السبب" error={errors.reason}>
                    <Input
                        value={form.reason}
                        onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                        placeholder="نفدت من السيارة"
                    />
                </Field>

                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-bold text-navy-800">المطلوب</p>
                        <button
                            onClick={() =>
                                setLines((c) => [...c, { item_id: '', description: '', qty: '1' }])
                            }
                            className="tap rounded-lg bg-navy-100 px-3 py-1.5 text-xs font-bold text-navy-700"
                        >
                            إضافة سطر
                        </button>
                    </div>

                    {errors.lines && (
                        <p className="mb-2 text-xs font-medium text-red-600">{errors.lines}</p>
                    )}

                    <div className="space-y-3">
                        {lines.map((line, index) => (
                            <div key={index} className="rounded-xl bg-navy-50 p-3">
                                <div className="flex items-end gap-2">
                                    <Field label="من المخزون" className="flex-1">
                                        <Select
                                            value={line.item_id}
                                            onChange={(e) =>
                                                setLines((c) =>
                                                    c.map((row, i) =>
                                                        i === index
                                                            ? { ...row, item_id: e.target.value }
                                                            : row,
                                                    ),
                                                )
                                            }
                                        >
                                            <option value="">— أو اكتبه بالأسفل —</option>
                                            {items?.data.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="الكمية" className="w-24">
                                        <Input
                                            type="number"
                                            min={0}
                                            step="0.001"
                                            value={line.qty}
                                            onChange={(e) =>
                                                setLines((c) =>
                                                    c.map((row, i) =>
                                                        i === index
                                                            ? { ...row, qty: e.target.value }
                                                            : row,
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
                                                setLines((c) => c.filter((_, i) => i !== index))
                                            }
                                            className="tap mb-0.5 grid size-10 place-items-center rounded-xl bg-red-50 text-red-600"
                                            aria-label="حذف السطر"
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    )}
                                </div>

                                {!line.item_id && (
                                    <Field label="أو اسم الصنف" className="mt-2">
                                        <Input
                                            value={line.description}
                                            onChange={(e) =>
                                                setLines((c) =>
                                                    c.map((row, i) =>
                                                        i === index
                                                            ? { ...row, description: e.target.value }
                                                            : row,
                                                    ),
                                                )
                                            }
                                            placeholder="مروحة تبريد 12 بوصة"
                                        />
                                    </Field>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    )
}

/* ── Deciding ────────────────────────────────────────────── */

function DecideDialog({
    row,
    approve,
    onClose,
}: {
    row: PurchaseRequest
    approve: boolean
    onClose: () => void
}) {
    const toast = useToast()
    const act = usePurchaseRequestAction()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [note, setNote] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title={`${approve ? 'اعتماد' : 'رفض'} الطلب ${row.code}`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={act.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={act.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await act.mutateAsync({
                                    id: row.id,
                                    action: 'decide',
                                    payload: approve
                                        ? { action: 'approve', note: note || null }
                                        : { action: 'reject', reason: note },
                                })
                                toast.success(approve ? 'تم اعتماد الطلب.' : 'تم رفض الطلب.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
                            }
                        }}
                    >
                        {approve ? 'اعتماد' : 'رفض'}
                    </Button>
                </>
            }
        >
            <Field
                label={approve ? 'ملاحظات' : 'سبب الرفض'}
                required={!approve}
                error={errors.reason || errors.note || errors.status}
            >
                <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={approve ? undefined : 'يوجد مخزون كافٍ'}
                />
            </Field>
        </Modal>
    )
}

/* ── Turning it into an order ────────────────────────────── */

function OrderDialog({ row, onClose }: { row: PurchaseRequest; onClose: () => void }) {
    const toast = useToast()
    const act = usePurchaseRequestAction()
    const { data: suppliers } = useSuppliers({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [supplierId, setSupplierId] = useState('')

    const uncatalogued = row.lines?.filter((line) => !line.in_catalogue) ?? []

    return (
        <Modal
            open
            onClose={onClose}
            title={`تحويل ${row.code} إلى أمر شراء`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={act.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={act.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await act.mutateAsync({
                                    id: row.id,
                                    action: 'order',
                                    payload: { supplier_id: Number(supplierId) },
                                })
                                toast.success('تم إنشاء أمر الشراء.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر إنشاء أمر الشراء.'))
                            }
                        }}
                    >
                        إنشاء أمر الشراء
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="المورّد" required error={errors.supplier_id || errors.lines}>
                    <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                        <option value="">— اختر —</option>
                        {suppliers?.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                {uncatalogued.length > 0 && (
                    <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800">
                        {uncatalogued.length} سطر غير مسجّل في المخزون لن ينتقل لأمر الشراء. سجّله
                        كصنف أولًا لو محتاجه.
                    </p>
                )}
            </div>
        </Modal>
    )
}

import clsx from 'clsx'
import { Check, FileText, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
    Button,
    EmptyState,
    Field,
    Input,
    PageHeader,
    Select,
    SkeletonCard,
    Textarea,
} from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import {
    useItems,
    usePurchaseRequests,
    useSaveSupplierQuote,
    useSuppliers,
    useSupplierQuote,
    useSupplierQuoteAction,
    useSupplierQuotes,
} from '@/lib/queries'
import type { SupplierQuote, SupplierQuoteStatus } from '@/types'

const STATUS: Record<SupplierQuoteStatus, string> = {
    received: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    selected: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

/**
 * Supplier quotes, grouped for comparison.
 *
 * Quotes against the same purchase request sit together, cheapest first, so the
 * choice is a glance rather than a hunt. Selecting one raises the purchase order
 * it becomes and rejects the rest.
 */
export function SupplierQuotesPage() {
    const { data: quotes, isLoading } = useSupplierQuotes()
    const [creating, setCreating] = useState(false)

    const { groups, singles } = useMemo(() => {
        const byRequest = new Map<number, { code: string; rows: SupplierQuote[] }>()
        const loose: SupplierQuote[] = []

        for (const quote of quotes ?? []) {
            if (quote.purchase_request_id) {
                const entry = byRequest.get(quote.purchase_request_id) ?? {
                    code: quote.request_code ?? '—',
                    rows: [],
                }
                entry.rows.push(quote)
                byRequest.set(quote.purchase_request_id, entry)
            } else {
                loose.push(quote)
            }
        }

        // Cheapest first inside each comparison.
        for (const entry of byRequest.values()) entry.rows.sort((a, b) => a.total - b.total)

        return { groups: [...byRequest.values()], singles: loose }
    }, [quotes])

    return (
        <>
            <PageHeader
                title="عروض الموردين"
                subtitle="سجّل عروض الأسعار وقارنها واعتمد الأفضل"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        عرض جديد
                    </Button>
                }
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !quotes?.length ? (
                <EmptyState
                    icon={FileText}
                    title="لا توجد عروض موردين"
                    description="سجّل ما يعرضه كل مورد لتقارن الأسعار وتحوّل الأفضل إلى أمر شراء."
                />
            ) : (
                <div className="space-y-5">
                    {groups.map((group) => (
                        <div key={group.code}>
                            <p className="mb-2 flex items-center gap-2 text-xs font-extrabold text-navy-400">
                                مقارنة على {group.code}
                                <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px]">
                                    {group.rows.length} عروض
                                </span>
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {group.rows.map((quote, index) => (
                                    <QuoteRow key={quote.id} quote={quote} best={index === 0} />
                                ))}
                            </div>
                        </div>
                    ))}

                    {Boolean(singles.length) && (
                        <div>
                            <p className="mb-2 text-xs font-extrabold text-navy-400">عروض مفردة</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {singles.map((quote) => (
                                    <QuoteRow key={quote.id} quote={quote} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {creating && <QuoteForm onClose={() => setCreating(false)} />}
        </>
    )
}

function QuoteRow({ quote, best }: { quote: SupplierQuote; best?: boolean }) {
    const toast = useToast()
    const action = useSupplierQuoteAction()
    const [detail, setDetail] = useState(false)

    const act = async (which: 'select' | 'reject') => {
        try {
            const result = await action.mutateAsync({ id: quote.id, action: which })
            toast.success(
                which === 'select' && result?.purchase_order
                    ? `تم الاعتماد وإنشاء أمر شراء ${result.purchase_order.code}.`
                    : which === 'select'
                      ? 'تم الاعتماد.'
                      : 'تم الرفض.',
            )
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
        }
    }

    return (
        <>
            <div className={clsx('card p-3.5', best && quote.status === 'received' && 'ring-1 ring-emerald-200')}>
                <div className="flex items-start justify-between gap-3">
                    <button onClick={() => setDetail(true)} className="min-w-0 flex-1 text-start">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular text-[11px] font-bold text-brand-600">{quote.code}</span>
                            <span className={clsx('badge', STATUS[quote.status])}>{quote.status_label}</span>
                            {best && quote.status === 'received' && (
                                <span className="badge bg-emerald-50 text-emerald-700">الأقل سعرًا</span>
                            )}
                            {quote.order_code && (
                                <span className="tabular text-[11px] font-bold text-emerald-600">
                                    ← {quote.order_code}
                                </span>
                            )}
                        </div>
                        <p className="mt-1 font-bold text-navy-900">{quote.supplier}</p>
                        <p className="text-[11px] text-navy-400">
                            {quote.lines_count} صنف
                            {quote.lead_days !== null && ` · توريد ${quote.lead_days} يوم`}
                        </p>
                    </button>

                    <div className="shrink-0 text-left">
                        <p className="tabular font-extrabold text-navy-900">{formatMoney(quote.total)}</p>
                    </div>
                </div>

                {quote.status === 'received' && (
                    <div className="mt-3 flex gap-2 border-t border-navy-100 pt-3">
                        <button
                            onClick={() => act('select')}
                            disabled={action.isPending}
                            className="tap inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                        >
                            <Check className="size-3.5" />
                            اعتماد وإنشاء أمر
                        </button>
                        <button
                            onClick={() => act('reject')}
                            disabled={action.isPending}
                            className="tap inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                        >
                            <X className="size-3.5" />
                            رفض
                        </button>
                    </div>
                )}
            </div>

            {detail && <QuoteDetail id={quote.id} onClose={() => setDetail(false)} />}
        </>
    )
}

function QuoteDetail({ id, onClose }: { id: number; onClose: () => void }) {
    const { data: quote } = useSupplierQuote(id)

    return (
        <Modal open onClose={onClose} title={quote?.code ?? 'عرض المورد'} size="lg">
            {!quote ? (
                <SkeletonCard />
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p className="font-bold text-navy-900">{quote.supplier}</p>
                            <p className="text-[11px] text-navy-400">
                                {quote.request_code && `على ${quote.request_code} · `}
                                {quote.status_label}
                            </p>
                        </div>
                        <p className="tabular text-lg font-extrabold text-navy-900">
                            {formatMoney(quote.total)}
                        </p>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-navy-100">
                        {quote.lines?.map((line) => (
                            <div
                                key={line.id}
                                className="flex items-center justify-between gap-3 border-b border-navy-100 p-3 last:border-0"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-navy-900">
                                        {line.description}
                                    </p>
                                    <p className="tabular text-xs text-navy-400">
                                        {line.qty} × {formatMoney(line.unit_price)}
                                    </p>
                                </div>
                                <p className="tabular text-sm font-bold text-navy-900">
                                    {formatMoney(line.line_total)}
                                </p>
                            </div>
                        ))}
                    </div>

                    {quote.notes && (
                        <p className="rounded-xl bg-navy-50 p-3 text-sm text-navy-600">{quote.notes}</p>
                    )}
                </div>
            )}
        </Modal>
    )
}

/* ── New quote ───────────────────────────────────────────── */

type DraftLine = { item_id: string; qty: string; unit_price: string }

function QuoteForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSaveSupplierQuote()
    const { data: suppliers } = useSuppliers({ active_only: 1 })
    const { data: items } = useItems({ per_page: 500 })
    const { data: requests } = usePurchaseRequests({ per_page: 100 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [head, setHead] = useState({
        supplier_id: '',
        purchase_request_id: '',
        tax_rate: '0',
        lead_days: '',
        valid_until: '',
        notes: '',
    })
    const [lines, setLines] = useState<DraftLine[]>([{ item_id: '', qty: '1', unit_price: '' }])

    const setHeadField = (key: keyof typeof head) => (value: string) =>
        setHead((current) => ({ ...current, [key]: value }))

    const setLine = (index: number, key: keyof DraftLine, value: string) =>
        setLines((current) => current.map((line, i) => (i === index ? { ...line, [key]: value } : line)))

    const total = lines.reduce(
        (sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unit_price) || 0),
        0,
    )
    const withTax = total + total * ((Number(head.tax_rate) || 0) / 100)

    return (
        <Modal
            open
            onClose={onClose}
            title="عرض مورد جديد"
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
                                    supplier_id: Number(head.supplier_id),
                                    purchase_request_id: head.purchase_request_id
                                        ? Number(head.purchase_request_id)
                                        : null,
                                    tax_rate: Number(head.tax_rate) || 0,
                                    lead_days: head.lead_days ? Number(head.lead_days) : null,
                                    valid_until: head.valid_until || null,
                                    notes: head.notes || null,
                                    lines: lines
                                        .filter((line) => line.item_id && Number(line.qty) > 0)
                                        .map((line) => ({
                                            item_id: Number(line.item_id),
                                            qty: Number(line.qty),
                                            unit_price: Number(line.unit_price) || 0,
                                        })),
                                })
                                toast.success('تم حفظ العرض.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
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
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="المورد" required error={errors.supplier_id}>
                        <Select
                            value={head.supplier_id}
                            onChange={(e) => setHeadField('supplier_id')(e.target.value)}
                        >
                            <option value="">— اختر —</option>
                            {suppliers?.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="طلب الشراء (اختياري)" hint="اربطه بطلب لمقارنته بعروض أخرى">
                        <Select
                            value={head.purchase_request_id}
                            onChange={(e) => setHeadField('purchase_request_id')(e.target.value)}
                        >
                            <option value="">بدون</option>
                            {requests?.data.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.code}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="الضريبة %" error={errors.tax_rate}>
                        <Input
                            type="number"
                            value={head.tax_rate}
                            onChange={(e) => setHeadField('tax_rate')(e.target.value)}
                        />
                    </Field>
                    <Field label="مدة التوريد (يوم)" error={errors.lead_days}>
                        <Input
                            type="number"
                            value={head.lead_days}
                            onChange={(e) => setHeadField('lead_days')(e.target.value)}
                        />
                    </Field>
                    <Field label="صالح حتى" error={errors.valid_until}>
                        <Input
                            type="date"
                            value={head.valid_until}
                            onChange={(e) => setHeadField('valid_until')(e.target.value)}
                        />
                    </Field>
                </div>

                <div>
                    <p className="mb-2 text-xs font-bold text-navy-400">الأصناف</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {lines.map((line, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Select
                                    value={line.item_id}
                                    onChange={(e) => setLine(index, 'item_id', e.target.value)}
                                    className="flex-1"
                                >
                                    <option value="">— صنف —</option>
                                    {items?.data.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </Select>
                                <Input
                                    type="number"
                                    value={line.qty}
                                    onChange={(e) => setLine(index, 'qty', e.target.value)}
                                    placeholder="كمية"
                                    className="w-20 text-center"
                                />
                                <Input
                                    type="number"
                                    value={line.unit_price}
                                    onChange={(e) => setLine(index, 'unit_price', e.target.value)}
                                    placeholder="سعر"
                                    className="w-24 text-center"
                                />
                                <button
                                    onClick={() =>
                                        setLines((current) =>
                                            current.length > 1
                                                ? current.filter((_, i) => i !== index)
                                                : current,
                                        )
                                    }
                                    className="tap grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600"
                                    aria-label="حذف السطر"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() =>
                            setLines((current) => [...current, { item_id: '', qty: '1', unit_price: '' }])
                        }
                        className="tap mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand-600"
                    >
                        <Plus className="size-3.5" />
                        إضافة صنف
                    </button>
                    {errors.lines && <p className="mt-1 text-xs text-red-600">{errors.lines}</p>}
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-navy-50 px-4 py-3">
                    <span className="text-xs font-bold text-navy-400">الإجمالي شامل الضريبة</span>
                    <span className="tabular text-lg font-extrabold text-navy-900">
                        {formatMoney(withTax)}
                    </span>
                </div>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={head.notes} onChange={(e) => setHeadField('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

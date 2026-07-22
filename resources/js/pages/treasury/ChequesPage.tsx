import clsx from 'clsx'
import { Banknote, Plus, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { SectionTabs } from '@/components/SectionTabs'
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
import { formatDate } from '@/lib/format'
import {
    useCashBoxes,
    useCheques,
    useChequeTransition,
    useCustomers,
    useInvoices,
    useSaveCheque,
    useSupplierInvoices,
    useSuppliers,
} from '@/lib/queries'
import { MONEY_SECTIONS } from '@/lib/sections'
import type { Cheque, ChequeStatus } from '@/types'

const STATUS: Record<ChequeStatus, string> = {
    held: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    deposited: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    cleared: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    bounced: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

type Filter = 'open' | 'incoming' | 'outgoing' | 'all'

const FILTERS: Array<[Filter, string]> = [
    ['open', 'المفتوحة'],
    ['incoming', 'واردة'],
    ['outgoing', 'صادرة'],
    ['all', 'الكل'],
]

export function ChequesPage() {
    const [filter, setFilter] = useState<Filter>('open')
    const [search, setSearch] = useState('')
    const [creating, setCreating] = useState<'incoming' | 'outgoing' | null>(null)
    const [acting, setActing] = useState<{ cheque: Cheque; action: Action } | null>(null)

    const { data, isLoading } = useCheques({
        search,
        open: filter === 'open' ? 1 : undefined,
        direction: filter === 'incoming' || filter === 'outgoing' ? filter : undefined,
        per_page: 60,
    })

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    const outlook = data?.meta

    return (
        <>
            <PageHeader
                title="الشيكات"
                subtitle="الشيك وعد بالمال، وليس مالًا — لا يمسّ الخزينة حتى يُحصَّل"
                actions={
                    <div className="flex gap-2">
                        <Button variant="secondary" icon={Plus} onClick={() => setCreating('outgoing')}>
                            شيك صادر
                        </Button>
                        <Button icon={Plus} onClick={() => setCreating('incoming')}>
                            شيك وارد
                        </Button>
                    </div>
                }
            />

            <SectionTabs sections={MONEY_SECTIONS} />

            {outlook && (
                <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Figure
                        label="شيكات واردة"
                        value={formatMoney(outlook.incoming_total)}
                        hint={`منها ${formatMoney(outlook.incoming_due)} خلال ${outlook.days} يومًا`}
                        tone="up"
                    />
                    <Figure
                        label="شيكات صادرة"
                        value={formatMoney(outlook.outgoing_total)}
                        hint={`يجب تغطية ${formatMoney(outlook.outgoing_due)} خلال ${outlook.days} يومًا`}
                        tone="down"
                    />
                    <Figure
                        label="متأخرة عن موعدها"
                        value={String(outlook.overdue_incoming)}
                        hint="واردة فات موعدها ولم تُودع"
                        tone={outlook.overdue_incoming > 0 ? 'warn' : undefined}
                    />
                    <Figure
                        label="مرتدة هذا العام"
                        value={String(outlook.bounced_this_year)}
                        tone={outlook.bounced_this_year > 0 ? 'down' : undefined}
                    />
                </div>
            )}

            <div className="mb-4 space-y-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        placeholder="ابحث برقم الشيك أو البنك أو الساحب…"
                        className="pr-10"
                        onChange={(e) => debounced(e.target.value)}
                    />
                </div>

                <div className="flex gap-1 rounded-xl bg-navy-100 p-1">
                    {FILTERS.map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={clsx(
                                'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                                filter === value ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Banknote}
                    title="لا توجد شيكات"
                    description="سجّل الشيكات الواردة والصادرة لتتابع مواعيدها قبل أن تفاجئك."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((cheque) => (
                        <div
                            key={cheque.id}
                            className={clsx('card p-4', cheque.is_due && 'ring-1 ring-amber-300')}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular font-bold text-navy-900">
                                            {cheque.cheque_number}
                                        </span>
                                        <span className={clsx('badge', STATUS[cheque.status])}>
                                            {cheque.status_label}
                                        </span>
                                        <span
                                            className={clsx(
                                                'badge',
                                                cheque.direction === 'incoming'
                                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                    : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
                                            )}
                                        >
                                            {cheque.direction_label}
                                        </span>
                                    </div>

                                    <p className="mt-1 text-sm font-semibold text-navy-800">
                                        {cheque.party_name ?? cheque.customer ?? cheque.supplier}
                                    </p>

                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {cheque.bank_name && `${cheque.bank_name} · `}
                                        {cheque.code}
                                        {cheque.invoice_code && ` · ${cheque.invoice_code}`}
                                        {cheque.supplier_invoice_code &&
                                            ` · ${cheque.supplier_invoice_code}`}
                                        {cheque.box && ` · ${cheque.box}`}
                                    </p>

                                    {cheque.bounce_reason && (
                                        <p className="mt-1.5 rounded-lg bg-red-50 p-2 text-[11px] text-red-700">
                                            {cheque.bounce_reason}
                                        </p>
                                    )}
                                </div>

                                <div className="text-left">
                                    <p className="tabular font-extrabold text-navy-900">
                                        {formatMoney(cheque.amount)}
                                    </p>
                                    <p
                                        className={clsx(
                                            'tabular text-[11px] font-bold',
                                            cheque.is_due
                                                ? 'text-amber-600'
                                                : 'text-navy-400',
                                        )}
                                    >
                                        {formatDate(cheque.due_date)}
                                        {cheque.is_open &&
                                            (cheque.days_to_due < 0
                                                ? ` · فات بـ ${Math.abs(cheque.days_to_due)} يوم`
                                                : ` · بعد ${cheque.days_to_due} يوم`)}
                                    </p>
                                </div>
                            </div>

                            {cheque.is_open && (
                                <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                    {cheque.status === 'held' && (
                                        <Move
                                            label={
                                                cheque.direction === 'incoming'
                                                    ? 'إيداع بالبنك'
                                                    : 'تقديم للبنك'
                                            }
                                            tone="indigo"
                                            onClick={() => setActing({ cheque, action: 'deposit' })}
                                        />
                                    )}

                                    <Move
                                        label="تم التحصيل"
                                        tone="emerald"
                                        onClick={() => setActing({ cheque, action: 'clear' })}
                                    />
                                    <Move
                                        label="ارتد"
                                        tone="red"
                                        onClick={() => setActing({ cheque, action: 'bounce' })}
                                    />
                                    <Move
                                        label="إلغاء"
                                        tone="slate"
                                        onClick={() => setActing({ cheque, action: 'cancel' })}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {creating && <ChequeForm direction={creating} onClose={() => setCreating(null)} />}
            {acting && (
                <TransitionDialog
                    cheque={acting.cheque}
                    action={acting.action}
                    onClose={() => setActing(null)}
                />
            )}
        </>
    )
}

function Figure({
    label,
    value,
    hint,
    tone,
}: {
    label: string
    value: string
    hint?: string
    tone?: 'up' | 'down' | 'warn'
}) {
    const colour = tone
        ? { up: 'text-emerald-700', down: 'text-amber-700', warn: 'text-red-700' }[tone]
        : 'text-navy-900'

    return (
        <div className="card p-4">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p className={clsx('tabular mt-1 text-lg font-extrabold', colour)}>{value}</p>
            {hint && <p className="mt-0.5 text-[10px] text-navy-400">{hint}</p>}
        </div>
    )
}

function Move({
    label,
    tone,
    onClick,
}: {
    label: string
    tone: 'indigo' | 'emerald' | 'red' | 'slate'
    onClick: () => void
}) {
    const chip = {
        indigo: 'bg-indigo-50 text-indigo-700',
        emerald: 'bg-emerald-50 text-emerald-700',
        red: 'bg-red-50 text-red-700',
        slate: 'bg-navy-50 text-navy-600',
    }[tone]

    return (
        <button onClick={onClick} className={clsx('tap rounded-lg px-3 py-1.5 text-xs font-bold', chip)}>
            {label}
        </button>
    )
}

/* ── Recording one ───────────────────────────────────────── */

function ChequeForm({
    direction,
    onClose,
}: {
    direction: 'incoming' | 'outgoing'
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveCheque()
    const { data: customers } = useCustomers({ per_page: 200 })
    const { data: suppliers } = useSuppliers({ per_page: 200 })
    const { data: boxes } = useCashBoxes()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const incoming = direction === 'incoming'

    const [form, setForm] = useState({
        party_id: '',
        document_id: '',
        cheque_number: '',
        bank_name: '',
        party_name: '',
        cash_box_id: '',
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: '',
        amount: '',
        notes: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const banks = boxes?.filter((box) => box.type === 'bank') ?? []

    // Only what is still owed: a cheque against a settled document is
    // nearly always the wrong document.
    const { data: invoices } = useInvoices({
        customer_id: incoming && form.party_id ? Number(form.party_id) : undefined,
        outstanding: 1,
        per_page: 100,
    })

    const { data: bills } = useSupplierInvoices({
        supplier_id: ! incoming && form.party_id ? Number(form.party_id) : undefined,
        outstanding: 1,
        per_page: 100,
    })

    const documents = incoming
        ? (invoices?.data ?? []).map((row) => ({ id: row.id, code: row.code, balance: row.balance }))
        : (bills?.data ?? [])
              .filter((row) => row.balance > 0)
              .map((row) => ({ id: row.id, code: row.code, balance: row.balance }))

    return (
        <Modal
            open
            onClose={onClose}
            title={incoming ? 'شيك وارد' : 'شيك صادر'}
            description={
                incoming
                    ? 'لن تتأثر الخزينة ولا الفاتورة حتى يتم التحصيل.'
                    : 'لن يُخصم المبلغ من الحساب حتى يُصرف الشيك.'
            }
            size="md"
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
                                    direction,
                                    customer_id: incoming ? Number(form.party_id) : null,
                                    supplier_id: incoming ? null : Number(form.party_id),
                                    invoice_id:
                                        incoming && form.document_id ? Number(form.document_id) : null,
                                    supplier_invoice_id:
                                        ! incoming && form.document_id ? Number(form.document_id) : null,
                                    cheque_number: form.cheque_number,
                                    bank_name: form.bank_name || null,
                                    party_name: form.party_name || null,
                                    cash_box_id: form.cash_box_id ? Number(form.cash_box_id) : null,
                                    issue_date: form.issue_date,
                                    due_date: form.due_date,
                                    amount: Number(form.amount),
                                    notes: form.notes || null,
                                })
                                toast.success('تم تسجيل الشيك.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تسجيل الشيك.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field
                    label={incoming ? 'العميل' : 'المورّد'}
                    required
                    error={errors.customer_id || errors.supplier_id}
                >
                    <Select
                        value={form.party_id}
                        onChange={(e) => {
                            set('party_id')(e.target.value)
                            set('document_id')('')
                        }}
                    >
                        <option value="">— اختر —</option>
                        {(incoming ? customers?.data : suppliers)?.map((party) => (
                            <option key={party.id} value={party.id}>
                                {party.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                {/* Naming the document is what lets clearing settle it. Left
                    blank the cheque still works, but it lands on the account
                    rather than on the invoice the customer meant to pay. */}
                {form.party_id && (
                    <Field
                        label={incoming ? 'على فاتورة' : 'على فاتورة مورّد'}
                        error={errors.invoice_id || errors.supplier_invoice_id}
                        hint="اتركها فارغة لتسجيله تحت الحساب"
                    >
                        <Select
                            value={form.document_id}
                            onChange={(e) => {
                                set('document_id')(e.target.value)

                                const doc = documents.find(
                                    (row) => row.id === Number(e.target.value),
                                )

                                if (doc) set('amount')(String(doc.balance))
                            }}
                        >
                            <option value="">— تحت الحساب —</option>
                            {documents.map((doc) => (
                                <option key={doc.id} value={doc.id}>
                                    {doc.code} — {formatMoney(doc.balance)}
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="رقم الشيك" required error={errors.cheque_number}>
                        <Input
                            value={form.cheque_number}
                            onChange={(e) => set('cheque_number')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="البنك" error={errors.bank_name}>
                        <Input
                            value={form.bank_name}
                            onChange={(e) => set('bank_name')(e.target.value)}
                            placeholder="بنك مصر"
                        />
                    </Field>
                </div>

                <Field
                    label="اسم الساحب"
                    error={errors.party_name}
                    hint="اتركه فارغًا لو الشيك باسم العميل نفسه"
                >
                    <Input
                        value={form.party_name}
                        onChange={(e) => set('party_name')(e.target.value)}
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="تاريخ التحرير" error={errors.issue_date}>
                        <Input
                            type="date"
                            value={form.issue_date}
                            onChange={(e) => set('issue_date')(e.target.value)}
                        />
                    </Field>

                    <Field label="تاريخ الاستحقاق" required error={errors.due_date}>
                        <Input
                            type="date"
                            value={form.due_date}
                            onChange={(e) => set('due_date')(e.target.value)}
                        />
                    </Field>

                    <Field label="المبلغ" required error={errors.amount}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.amount}
                            onChange={(e) => set('amount')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                {!incoming && (
                    <Field
                        label="مسحوب على حساب"
                        error={errors.cash_box_id}
                        hint="الحساب الذي يجب أن يغطي الشيك في موعده"
                    >
                        <Select
                            value={form.cash_box_id}
                            onChange={(e) => set('cash_box_id')(e.target.value)}
                        >
                            <option value="">— اختر —</option>
                            {banks.map((box) => (
                                <option key={box.id} value={box.id}>
                                    {box.name} ({formatMoney(box.balance)})
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

/* ── Moving it along ─────────────────────────────────────── */

type Action = 'deposit' | 'clear' | 'bounce' | 'cancel'

const ACTION: Record<Action, { title: string; verb: string; done: string }> = {
    deposit: { title: 'إيداع بالبنك', verb: 'إيداع', done: 'تم الإيداع.' },
    clear: { title: 'تحصيل الشيك', verb: 'تحصيل', done: 'تم التحصيل وسُجّل السند.' },
    bounce: { title: 'ارتداد الشيك', verb: 'تسجيل الارتداد', done: 'تم تسجيل الارتداد.' },
    cancel: { title: 'إلغاء الشيك', verb: 'إلغاء', done: 'تم إلغاء الشيك.' },
}

function TransitionDialog({
    cheque,
    action,
    onClose,
}: {
    cheque: Cheque
    action: Action
    onClose: () => void
}) {
    const toast = useToast()
    const move = useChequeTransition()
    const { data: boxes } = useCashBoxes()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [boxId, setBoxId] = useState(String(cheque.cash_box_id ?? ''))
    const [reason, setReason] = useState('')
    const [on, setOn] = useState(new Date().toISOString().slice(0, 10))

    const meta = ACTION[action]
    const banks = boxes?.filter((box) => box.type === 'bank') ?? []
    const needsBox = action === 'deposit' || (action === 'clear' && !cheque.cash_box_id)
    const needsReason = action === 'bounce' || action === 'cancel'

    return (
        <Modal
            open
            onClose={onClose}
            title={`${meta.title} — ${cheque.cheque_number}`}
            description={
                action === 'clear'
                    ? 'هنا فقط تتحرك النقدية: سيُنشأ سند وتتحدّث الفاتورة.'
                    : action === 'bounce'
                      ? 'لا شيء يحتاج عكسًا — الشيك لم يُحتسب أصلًا.'
                      : undefined
            }
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={move.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={move.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await move.mutateAsync({
                                    id: cheque.id,
                                    action,
                                    cash_box_id: boxId ? Number(boxId) : null,
                                    reason: needsReason ? reason : undefined,
                                    on,
                                })
                                toast.success(meta.done)
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
                            }
                        }}
                    >
                        {meta.verb}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-navy-50 p-3 text-sm">
                    <span className="text-navy-500">قيمة الشيك</span>
                    <span className="tabular font-extrabold text-navy-900">
                        {formatMoney(cheque.amount)}
                    </span>
                </div>

                {needsBox && (
                    <Field label="الحساب البنكي" required error={errors.cash_box_id}>
                        <Select value={boxId} onChange={(e) => setBoxId(e.target.value)}>
                            <option value="">— اختر —</option>
                            {banks.map((box) => (
                                <option key={box.id} value={box.id}>
                                    {box.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}

                {needsReason && (
                    <Field label="السبب" required error={errors.reason}>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={action === 'bounce' ? 'رصيد غير كافٍ' : 'أُلغي بالاتفاق'}
                        />
                    </Field>
                )}

                <Field label="التاريخ" error={errors.on}>
                    <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import {
    ArrowLeftRight,
    Banknote,
    FileText,
    Landmark,
    Plus,
    Scale,
} from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { SectionTabs } from '@/components/SectionTabs'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Textarea, Th } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import {
    useCashBoxes,
    useReconcile,
    useReconciliation,
    useSaveCashBox,
    useTreasuryOperation,
    useTreasuryStatement,
} from '@/lib/queries'
import type { CashBoxSummary } from '@/types'

type View = 'accounts' | 'transfers' | 'reconcile'

const SECTIONS = [
    ['/banks/accounts', 'الحسابات'],
    ['/banks/transfers', 'الإيداعات والتحويلات'],
    ['/banks/reconcile', 'التسوية البنكية'],
] as const

export function BanksPage() {
    const { view } = useParams<{ view: string }>()
    // Bare /banks and anything unrecognised fall to the accounts list.
    const active: View =
        view === 'transfers' ? 'transfers' : view === 'reconcile' ? 'reconcile' : 'accounts'

    return (
        <>
            <PageHeader title="البنوك" subtitle="الحسابات البنكية والإيداعات والتسوية" />

            <SectionTabs sections={SECTIONS} />

            {active === 'accounts' && <AccountsView />}
            {active === 'transfers' && <TransfersView />}
            {active === 'reconcile' && <ReconcileView />}
        </>
    )
}

/* ── Accounts ────────────────────────────────────────────── */

function AccountsView() {
    const { data: boxes, isLoading } = useCashBoxes()
    const [creating, setCreating] = useState(false)
    const [statementFor, setStatementFor] = useState<CashBoxSummary | null>(null)

    const banks = (boxes ?? []).filter((box) => box.type === 'bank')
    const total = banks.reduce((sum, box) => sum + box.balance, 0)

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="rounded-2xl bg-navy-50 px-4 py-2">
                    <p className="text-[11px] font-bold text-navy-400">إجمالي أرصدة البنوك</p>
                    <p className="tabular text-lg font-extrabold text-navy-900">{formatMoney(total)}</p>
                </div>
                <Button icon={Plus} onClick={() => setCreating(true)}>
                    {tr('حساب بنكي جديد')}
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !banks.length ? (
                <EmptyState
                    icon={Landmark}
                    title="لا توجد حسابات بنكية"
                    description="أضف حسابًا بنكيًا لتودع فيه التحصيلات وتتابع رصيده وتسويته."
                />
            ) : (
                <div className="space-y-2">
                    {banks.map((box) => (
                        <div key={box.id} className="card flex items-center gap-3 p-4">
                            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
                                <Landmark className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-bold text-navy-900">{box.name}</p>
                                <p className="tabular text-[11px] text-navy-400">
                                    {box.account_number ?? '—'} · {box.currency}
                                </p>
                            </div>
                            <div className="text-left">
                                <p
                                    className={clsx(
                                        'tabular font-extrabold',
                                        box.balance < 0 ? 'text-red-600' : 'text-navy-900',
                                    )}
                                >
                                    {formatMoney(box.balance)}
                                </p>
                                <button
                                    onClick={() => setStatementFor(box)}
                                    className="tap mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600"
                                >
                                    <FileText className="size-3" />
                                    {tr('كشف الحساب')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {creating && <AccountDialog onClose={() => setCreating(false)} />}
            {statementFor && (
                <StatementModal box={statementFor} onClose={() => setStatementFor(null)} />
            )}
        </>
    )
}

function AccountDialog({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSaveCashBox()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({ name: '', account_number: '' })

    return (
        <Modal
            open
            onClose={onClose}
            title="حساب بنكي جديد"
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await save.mutateAsync({ ...form, type: 'bank' })
                                toast.success('تم إضافة الحساب.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّرت الإضافة.'))
                            }
                        }}
                    >
                        {tr('حفظ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="اسم الحساب / البنك" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="البنك الأهلي — جاري"
                    />
                </Field>
                <Field label="رقم الحساب" error={errors.account_number}>
                    <Input
                        value={form.account_number}
                        onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>
            </div>
        </Modal>
    )
}

function StatementModal({ box, onClose }: { box: CashBoxSummary; onClose: () => void }) {
    const { data, isLoading } = useTreasuryStatement(box.id)

    return (
        <Modal open onClose={onClose} title={`كشف ${box.name}`} size="lg">
            {isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <Tile label="رصيد أول المدة" value={formatMoney(data.opening_balance)} />
                        <Tile label="الوارد" value={formatMoney(data.in_total)} tone="up" />
                        <Tile label="المنصرف" value={formatMoney(data.out_total)} tone="down" />
                    </div>

                    {!data.rows.length ? (
                        <EmptyState icon={FileText} title="لا توجد حركات" />
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-navy-100">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                                    <tr>
                                        <Th className="px-3 py-2 text-start">التاريخ</Th>
                                        <Th className="px-3 py-2 text-start">البيان</Th>
                                        <Th className="w-24 px-3 py-2 text-left">وارد</Th>
                                        <Th className="w-24 px-3 py-2 text-left">منصرف</Th>
                                        <Th className="w-24 px-3 py-2 text-left">الرصيد</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((row) => (
                                        <tr key={row.id} className="border-t border-navy-100">
                                            <td className="px-3 py-2 text-navy-500">
                                                {formatDate(row.date)}
                                            </td>
                                            <td className="px-3 py-2 text-navy-700">
                                                {row.label}
                                                {row.customer && (
                                                    <span className="block text-[11px] text-navy-400">
                                                        {row.customer}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="tabular px-3 py-2 text-left text-emerald-600">
                                                {row.in ? formatMoney(row.in) : '—'}
                                            </td>
                                            <td className="tabular px-3 py-2 text-left text-red-600">
                                                {row.out ? formatMoney(row.out) : '—'}
                                            </td>
                                            <td className="tabular px-3 py-2 text-left font-bold text-navy-900">
                                                {formatMoney(row.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="flex items-center justify-between rounded-2xl bg-navy-50 px-4 py-3">
                        <span className="text-xs font-bold text-navy-400">رصيد آخر المدة</span>
                        <span className="tabular text-lg font-extrabold text-navy-900">
                            {formatMoney(data.closing_balance)}
                        </span>
                    </div>
                </div>
            )}
        </Modal>
    )
}

/* ── Deposits & transfers ────────────────────────────────── */

function TransfersView() {
    const toast = useToast()
    const { data: boxes } = useCashBoxes()
    const transfer = useTreasuryOperation('transfer')
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({ from_box_id: '', to_box_id: '', amount: '', note: '' })

    const options = boxes ?? []
    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const submit = async () => {
        setErrors({})
        try {
            await transfer.mutateAsync({
                from_box_id: Number(form.from_box_id),
                to_box_id: Number(form.to_box_id),
                amount: Number(form.amount),
                note: form.note || null,
            })
            toast.success('تم التحويل.')
            setForm({ from_box_id: '', to_box_id: '', amount: '', note: '' })
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر التحويل.'))
        }
    }

    const sameBox = form.from_box_id && form.from_box_id === form.to_box_id

    return (
        <div className="mx-auto max-w-lg">
            <div className="card space-y-4 p-5">
                <p className="text-sm text-navy-500">
                    الإيداع هو تحويل من خزينة نقدية إلى حساب بنكي؛ ونفس الشاشة تحوّل بين أي
                    خزينتين أو حسابين.
                </p>

                <Field label="من" required error={errors.from_box_id}>
                    <Select value={form.from_box_id} onChange={(e) => set('from_box_id')(e.target.value)}>
                        <option value="">— اختر —</option>
                        {options.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} · {formatMoney(box.balance)}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="إلى" required error={errors.to_box_id}>
                    <Select value={form.to_box_id} onChange={(e) => set('to_box_id')(e.target.value)}>
                        <option value="">— اختر —</option>
                        {options.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} · {box.type_label}
                            </option>
                        ))}
                    </Select>
                </Field>

                {sameBox && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                        {tr('لا يمكن التحويل إلى نفس الخزينة.')}
                    </p>
                )}

                <Field label="المبلغ" required error={errors.amount}>
                    <Input
                        type="number"
                        min={0}
                        step="any"
                        value={form.amount}
                        onChange={(e) => set('amount')(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <Field label="ملاحظة" error={errors.note}>
                    <Textarea value={form.note} onChange={(e) => set('note')(e.target.value)} />
                </Field>

                <Button
                    icon={ArrowLeftRight}
                    className="w-full"
                    loading={transfer.isPending}
                    disabled={!form.from_box_id || !form.to_box_id || !form.amount || Boolean(sameBox)}
                    onClick={submit}
                >
                    {tr('تنفيذ التحويل')}
                </Button>
            </div>
        </div>
    )
}

/* ── Reconciliation ──────────────────────────────────────── */

function ReconcileView() {
    const { data: boxes } = useCashBoxes()
    const banks = (boxes ?? []).filter((box) => box.type === 'bank')

    const [boxId, setBoxId] = useState<number | null>(null)
    const [statementBalance, setStatementBalance] = useState('')

    const { data, isLoading } = useReconciliation(boxId, {
        statement_balance: statementBalance || undefined,
    })
    const reconcile = useReconcile()

    const toggle = (id: number, reconciled: boolean) =>
        reconcile.mutate({ ids: [id], reconciled: !reconciled })

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="الحساب البنكي">
                    <Select
                        value={boxId ?? ''}
                        onChange={(e) => setBoxId(e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">اختر الحساب…</option>
                        {banks.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="رصيد كشف البنك" hint="أدخله لحساب الفرق مع المسوّى">
                    <Input
                        type="number"
                        step="any"
                        value={statementBalance}
                        onChange={(e) => setStatementBalance(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>
            </div>

            {!boxId ? (
                <EmptyState icon={Scale} title="اختر حسابًا لبدء التسوية" />
            ) : isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <Tile label="رصيد الدفاتر" value={formatMoney(data.book_balance)} />
                        <Tile label="المسوّى" value={formatMoney(data.reconciled_balance)} tone="up" />
                        <Tile label="غير مسوّى" value={formatMoney(data.unreconciled_total)} tone="down" />
                        <Tile
                            label="الفرق"
                            value={data.difference !== null ? formatMoney(data.difference) : '—'}
                            tone={
                                data.difference === null
                                    ? undefined
                                    : Math.abs(data.difference) < 0.01
                                      ? 'up'
                                      : 'down'
                            }
                        />
                    </div>

                    {!data.rows.length ? (
                        <EmptyState icon={Banknote} title="لا توجد حركات على هذا الحساب" />
                    ) : (
                        <div className="space-y-2">
                            {data.rows.map((row) => (
                                <label
                                    key={row.id}
                                    className="card flex cursor-pointer items-center gap-3 p-3"
                                >
                                    <input
                                        type="checkbox"
                                        checked={row.reconciled}
                                        onChange={() => toggle(row.id, row.reconciled)}
                                        className="size-5 shrink-0 accent-emerald-600"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-navy-800">
                                            {row.note ?? row.source}
                                            {row.customer && (
                                                <span className="text-navy-400"> · {row.customer}</span>
                                            )}
                                        </p>
                                        <p className="tabular text-[11px] text-navy-400">
                                            {formatDate(row.date)}
                                            {row.reconciled && row.reconciled_at
                                                ? ` · سُوّيت ${formatDate(row.reconciled_at)}`
                                                : ''}
                                        </p>
                                    </div>
                                    <span
                                        className={clsx(
                                            'tabular shrink-0 font-bold',
                                            row.direction === 'in' ? 'text-emerald-600' : 'text-red-600',
                                        )}
                                    >
                                        {row.direction === 'in' ? '+' : '−'}
                                        {formatMoney(row.amount)}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

/* ── Shared ──────────────────────────────────────────────── */

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
    return (
        <div className="rounded-xl bg-navy-50 px-3 py-2">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular text-sm font-extrabold',
                    tone === 'up'
                        ? 'text-emerald-600'
                        : tone === 'down'
                          ? 'text-red-600'
                          : 'text-navy-900',
                )}
            >
                {value}
            </p>
        </div>
    )
}

import clsx from 'clsx'
import {
    ArrowLeftRight,
    Banknote,
    Landmark,
    Pencil,
    Plus,
    Printer,
    Trash2,
    TrendingDown,
    TrendingUp,
    Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker'
import { SectionTabs } from '@/components/SectionTabs'
import { MONEY_SECTIONS } from '@/lib/sections'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Textarea, Th } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate, formatSmart } from '@/lib/format'
import { useArea } from '@/lib/nav'
import {
    useCashBoxes,
    useCashMovements,
    useDeleteCashBox,
    useDeleteCashMovement,
    useSaveCashBox,
    useTreasuryStatement,
    useTreasurySummary,
    useUpdateCashMovement,
} from '@/lib/queries'
import { TreasuryDialog } from '@/pages/treasury/TreasuryDialog'
import type { CashBoxSummary, CashMovementRow } from '@/types'

/** The two manual vouchers a hand raises here — printable, editable, deletable. */
const VOUCHER_SOURCES = new Set(['expense', 'external_deposit'])

export function TreasuryPage() {
    const period = usePeriod('month')
    const [dialog, setDialog] = useState<'expense' | 'transfer' | 'box' | null>(null)
    const [openBox, setOpenBox] = useState<CashBoxSummary | null>(null)
    const [editingBox, setEditingBox] = useState<CashBoxSummary | null>(null)
    const [deletingBox, setDeletingBox] = useState<CashBoxSummary | null>(null)
    const deleteBox = useDeleteCashBox()
    const toast = useToast()

    const [moveBox, setMoveBox] = useState('')
    const [moveDir, setMoveDir] = useState<'' | 'in' | 'out'>('')
    const [editingMove, setEditingMove] = useState<CashMovementRow | null>(null)
    const [deletingMove, setDeletingMove] = useState<CashMovementRow | null>(null)
    const deleteMove = useDeleteCashMovement()
    const { path } = useArea()

    const { range } = period
    const { data: summary, isLoading } = useTreasurySummary(range)
    const { data: boxes } = useCashBoxes()
    const { data: movements } = useCashMovements({
        ...range,
        cash_box_id: moveBox || undefined,
        direction: moveDir || undefined,
        per_page: 40,
    })

    const analysis = summary?.analysis

    return (
        <>
            <PageHeader
                title="الخزينة"
                subtitle={summary ? `النقدية المتاحة ${formatMoney(summary.cash_on_hand)}` : undefined}
                actions={
                    <Button icon={Plus} onClick={() => setDialog('box')}>
                        خزينة جديدة
                    </Button>
                }
            />

            <SectionTabs sections={MONEY_SECTIONS} />

            <PeriodPicker period={period} />

            {/* ══ Income against expense ════════════════════════ */}
            {isLoading || !analysis ? (
                <SkeletonCard />
            ) : (
                <>
                    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Stat label="رصيد أول المدة" value={formatMoney(analysis.opening_balance)} tone="muted" />
                        <Stat
                            label="إجمالي الإيراد"
                            value={formatMoney(analysis.income_total)}
                            tone="up"
                            icon={TrendingUp}
                        />
                        <Stat
                            label="إجمالي المصروف"
                            value={formatMoney(analysis.expense_total)}
                            tone="down"
                            icon={TrendingDown}
                        />
                        <Stat label="الرصيد الحالي" value={formatMoney(analysis.closing_balance)} tone="brand" />
                    </div>

                    {/* The number people came for, stated rather than left to
                        be worked out from the two above it. */}
                    <div
                        className={clsx(
                            'mb-5 flex items-center justify-between rounded-2xl p-4',
                            analysis.net >= 0
                                ? 'bg-emerald-50 ring-1 ring-emerald-200'
                                : 'bg-red-50 ring-1 ring-red-200',
                        )}
                    >
                        <span className="text-sm font-bold text-navy-700">
                            صافي الفترة {analysis.net >= 0 ? '(فائض)' : '(عجز)'}
                        </span>
                        <span
                            className={clsx(
                                'tabular text-xl font-extrabold',
                                analysis.net >= 0 ? 'text-emerald-700' : 'text-red-700',
                            )}
                        >
                            {formatMoney(analysis.net)}
                        </span>
                    </div>

                    <div className="mb-6 grid gap-4 lg:grid-cols-2">
                        <Breakdown title="الإيراد" rows={analysis.income} tone="up" />
                        <Breakdown title="المصروف" rows={analysis.expense} tone="down" />
                    </div>
                </>
            )}

            {/* ══ Boxes ═════════════════════════════════════════ */}
            <div className="mb-3 flex flex-wrap gap-2">
                <Button variant="secondary" icon={Banknote} onClick={() => setDialog('expense')}>
                    تسجيل مصروف
                </Button>
                <Button variant="secondary" icon={ArrowLeftRight} onClick={() => setDialog('transfer')}>
                    تحويل بين الخزائن
                </Button>
            </div>

            {!boxes?.length ? (
                <EmptyState icon={Wallet} title="لا توجد خزائن" />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {boxes.map((box) => (
                        <button
                            key={box.id}
                            onClick={() => setOpenBox(box)}
                            className="card-interactive p-4 text-start"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span
                                        className={clsx(
                                            'grid size-10 shrink-0 place-items-center rounded-2xl',
                                            box.type === 'bank'
                                                ? 'bg-indigo-50 text-indigo-600'
                                                : box.type === 'custody'
                                                  ? 'bg-amber-50 text-amber-600'
                                                  : 'bg-emerald-50 text-emerald-600',
                                        )}
                                    >
                                        {box.type === 'bank' ? (
                                            <Landmark className="size-5" />
                                        ) : (
                                            <Wallet className="size-5" />
                                        )}
                                    </span>

                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-navy-900">{box.name}</p>
                                        <p className="truncate text-[11px] text-navy-400">
                                            {box.type === 'custody'
                                                ? `عهدة ${box.holder ?? ''}`
                                                : box.type_label}
                                            {box.account_number && ` · ${box.account_number}`}
                                        </p>
                                    </div>
                                </div>

                                <p
                                    className={clsx(
                                        'tabular shrink-0 font-extrabold',
                                        box.balance < 0 ? 'text-red-600' : 'text-navy-900',
                                    )}
                                >
                                    {formatMoney(box.balance)}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* ══ Recent movement across every box ══════════════ */}
            <section className="mt-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold text-navy-900">حركة الخزينة</h2>

                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={moveBox}
                            onChange={(e) => setMoveBox(e.target.value)}
                            className="w-auto text-xs"
                        >
                            <option value="">كل الخزائن</option>
                            {boxes?.map((box) => (
                                <option key={box.id} value={box.id}>
                                    {box.name}
                                </option>
                            ))}
                        </Select>

                        {(['', 'in', 'out'] as const).map((dir) => (
                            <button
                                key={dir || 'all'}
                                onClick={() => setMoveDir(dir)}
                                className={clsx(
                                    'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                                    moveDir === dir
                                        ? dir === 'in'
                                            ? 'bg-emerald-600 text-white ring-emerald-600'
                                            : dir === 'out'
                                              ? 'bg-red-600 text-white ring-red-600'
                                              : 'bg-brand-600 text-white ring-brand-600'
                                        : 'bg-surface text-navy-500 ring-navy-200 hover:bg-navy-50',
                                )}
                            >
                                {dir === 'in' ? 'وارد' : dir === 'out' ? 'منصرف' : 'الكل'}
                            </button>
                        ))}
                    </div>
                </div>

                {!movements?.length ? (
                    <EmptyState icon={Banknote} title="لا توجد حركات في هذه الفترة" />
                ) : (
                    <div className="space-y-2">
                        {movements.map((movement) => {
                            const isVoucher = VOUCHER_SOURCES.has(movement.source)

                            return (
                                <div key={movement.id} className="card p-3.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <span
                                                className={clsx(
                                                    'badge',
                                                    movement.direction === 'in'
                                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                        : 'bg-red-50 text-red-700 ring-1 ring-red-200',
                                                )}
                                            >
                                                {movement.source_label}
                                            </span>

                                            <p className="mt-1 truncate text-sm font-bold text-navy-900">
                                                {movement.customer ?? movement.category ?? movement.box}
                                            </p>

                                            <p className="mt-0.5 text-[11px] text-navy-400">
                                                {movement.box}
                                                {movement.note && ` · ${movement.note}`}
                                                {movement.actor && ` · ${movement.actor}`}
                                                {movement.created_at &&
                                                    ` · ${formatSmart(movement.created_at)}`}
                                            </p>
                                        </div>

                                        <p
                                            className={clsx(
                                                'tabular shrink-0 font-extrabold',
                                                movement.direction === 'in'
                                                    ? 'text-emerald-600'
                                                    : 'text-red-600',
                                            )}
                                        >
                                            {movement.direction === 'in' ? '+' : '−'}
                                            {formatMoney(movement.amount)}
                                        </p>
                                    </div>

                                    {/* Only the manual vouchers — an expense paid, a deposit
                                        taken — carry these. A customer or supplier receipt is
                                        undone from its own screen. */}
                                    {isVoucher && (
                                        <div className="mt-2.5 flex items-center gap-1 border-t border-navy-100 pt-2.5">
                                            <Link
                                                to={path(`/print/cash-vouchers/${movement.id}`)}
                                                target="_blank"
                                                className="tap flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-navy-500 transition hover:bg-navy-50 hover:text-navy-800"
                                            >
                                                <Printer className="size-3.5" />
                                                طباعة
                                            </Link>
                                            <button
                                                onClick={() => setEditingMove(movement)}
                                                className="tap flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-navy-500 transition hover:bg-navy-50 hover:text-navy-800"
                                            >
                                                <Pencil className="size-3.5" />
                                                تعديل
                                            </button>
                                            <button
                                                onClick={() => setDeletingMove(movement)}
                                                className="tap flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                            >
                                                <Trash2 className="size-3.5" />
                                                حذف
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            {dialog === 'box' || editingBox ? (
                <CashBoxDialog
                    box={editingBox ?? undefined}
                    onClose={() => {
                        setDialog(null)
                        setEditingBox(null)
                    }}
                />
            ) : dialog ? (
                <TreasuryDialog operation={dialog} onClose={() => setDialog(null)} />
            ) : null}

            {openBox && (
                <StatementDialog
                    box={openBox}
                    range={range}
                    onClose={() => setOpenBox(null)}
                    onEdit={() => {
                        setEditingBox(openBox)
                        setOpenBox(null)
                    }}
                    onDelete={() => {
                        setDeletingBox(openBox)
                        setOpenBox(null)
                    }}
                />
            )}

            <ConfirmDialog
                open={Boolean(deletingBox)}
                onClose={() => setDeletingBox(null)}
                onConfirm={async () => {
                    if (!deletingBox) return
                    try {
                        await deleteBox.mutateAsync(deletingBox.id)
                        toast.success('تم حذف الخزينة.')
                        setDeletingBox(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                    }
                }}
                title="حذف الخزينة"
                message={`حذف «${deletingBox?.name ?? ''}»؟ الخزائن التي لها حركة لا يمكن حذفها.`}
                confirmLabel="حذف"
                loading={deleteBox.isPending}
                danger
            />

            {editingMove && (
                <VoucherEditDialog movement={editingMove} onClose={() => setEditingMove(null)} />
            )}

            <ConfirmDialog
                open={Boolean(deletingMove)}
                onClose={() => setDeletingMove(null)}
                onConfirm={async () => {
                    if (!deletingMove) return
                    try {
                        await deleteMove.mutateAsync(deletingMove.id)
                        toast.success('تم حذف السند وإرجاع الرصيد.')
                        setDeletingMove(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                    }
                }}
                title="حذف السند"
                message={`حذف ${deletingMove?.source_label ?? ''} بمبلغ ${formatMoney(deletingMove?.amount ?? 0)}؟ سيُعاد الرصيد إلى الخزينة.`}
                confirmLabel="حذف"
                loading={deleteMove.isPending}
                danger
            />
        </>
    )
}

/* ── Editing a manual voucher ────────────────────────────── */

function VoucherEditDialog({
    movement,
    onClose,
}: {
    movement: CashMovementRow
    onClose: () => void
}) {
    const toast = useToast()
    const update = useUpdateCashMovement()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const isDeposit = movement.source === 'external_deposit'

    // For a deposit the heading holds the party; for an expense it is the item.
    const [category, setCategory] = useState(movement.category ?? '')
    const [note, setNote] = useState(movement.note ?? '')

    return (
        <Modal
            open
            onClose={onClose}
            title="تعديل السند"
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={update.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await update.mutateAsync({
                                    id: movement.id,
                                    category: category || null,
                                    note: note || null,
                                })
                                toast.success('تم حفظ التعديل.')
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
                <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-3 text-sm">
                    <span className="text-navy-500">المبلغ (ثابت)</span>
                    <span className="tabular font-extrabold text-navy-900">
                        {formatMoney(movement.amount)}
                    </span>
                </div>

                <Field label={isDeposit ? 'الجهة المودِعة' : 'البند'} error={errors.category}>
                    <Input value={category} onChange={(e) => setCategory(e.target.value)} />
                </Field>

                <Field label="ملاحظة" error={errors.note}>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </Field>

                <p className="text-[11px] text-navy-400">
                    لتغيير المبلغ أو الخزينة، احذف السند وسجّل واحدًا جديدًا.
                </p>
            </div>
        </Modal>
    )
}

function Stat({
    label,
    value,
    tone,
    icon: Icon,
}: {
    label: string
    value: string
    tone: 'up' | 'down' | 'brand' | 'muted'
    icon?: typeof TrendingUp
}) {
    const colour = {
        up: 'text-emerald-700',
        down: 'text-red-700',
        brand: 'text-brand-700',
        muted: 'text-navy-500',
    }[tone]

    return (
        <div className="card p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-navy-400">
                {Icon && <Icon className="size-3.5" />}
                {label}
            </p>
            <p className={clsx('tabular mt-1 text-lg font-extrabold', colour)}>{value}</p>
        </div>
    )
}

function Breakdown({
    title,
    rows,
    tone,
}: {
    title: string
    rows: Array<{ source: string; label: string; total: number; count: number }>
    tone: 'up' | 'down'
}) {
    const total = rows.reduce((sum, row) => sum + row.total, 0)

    return (
        <section className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-navy-800">{title}</h2>

            {rows.length === 0 ? (
                <p className="text-xs text-navy-400">لا توجد حركات في هذه الفترة.</p>
            ) : (
                <div className="space-y-2.5">
                    {rows.map((row) => (
                        <div key={row.source}>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-navy-600">
                                    {row.label}
                                    <span className="tabular mr-1.5 text-[11px] text-navy-400">
                                        ({row.count})
                                    </span>
                                </span>
                                <span className="tabular font-bold text-navy-900">
                                    {formatMoney(row.total)}
                                </span>
                            </div>

                            {/* Share of its own side, so the biggest line is
                                obvious without reading every figure. */}
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-navy-100">
                                <div
                                    className={clsx(
                                        'h-full rounded-full',
                                        tone === 'up' ? 'bg-emerald-500' : 'bg-red-500',
                                    )}
                                    style={{ width: `${total > 0 ? (row.total / total) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}

/* ── One box's ledger ────────────────────────────────────── */

function StatementDialog({
    box,
    range,
    onClose,
    onEdit,
    onDelete,
}: {
    box: CashBoxSummary
    range: { from?: string; to?: string }
    onClose: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const { data, isLoading } = useTreasuryStatement(box.id, range)
    // A technician's float is managed from the custody screen, not here.
    const editable = box.type !== 'custody'

    return (
        <Modal
            open
            onClose={onClose}
            title={`كشف ${box.name}`}
            size="lg"
            footer={
                editable ? (
                    <>
                        <Button variant="secondary" icon={Pencil} className="text-xs" onClick={onEdit}>
                            تعديل
                        </Button>
                        <Button
                            variant="secondary"
                            icon={Trash2}
                            className="text-xs text-red-600"
                            onClick={onDelete}
                        >
                            حذف
                        </Button>
                    </>
                ) : undefined
            }
        >
            {isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Stat label="أول المدة" value={formatMoney(data.opening_balance)} tone="muted" />
                        <Stat label="وارد" value={formatMoney(data.in_total)} tone="up" />
                        <Stat label="منصرف" value={formatMoney(data.out_total)} tone="down" />
                        <Stat label="الرصيد" value={formatMoney(data.closing_balance)} tone="brand" />
                    </div>

                    {data.rows.length === 0 ? (
                        <p className="rounded-xl bg-navy-50 p-4 text-center text-sm text-navy-400">
                            لا توجد حركات في هذه الفترة.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="doc-table">
                                <thead>
                                    <tr>
                                        <Th className="w-24">التاريخ</Th>
                                        <Th>البيان</Th>
                                        <Th className="w-24 text-left">وارد</Th>
                                        <Th className="w-24 text-left">منصرف</Th>
                                        <Th className="w-28 text-left">الرصيد</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="tabular text-navy-500">
                                                {row.date ? formatDate(row.date) : '—'}
                                            </td>
                                            <td>
                                                <span className="font-semibold text-navy-800">
                                                    {row.label}
                                                </span>
                                                {(row.customer || row.category || row.note) && (
                                                    <span className="block text-[11px] text-navy-400">
                                                        {row.customer ?? row.category ?? row.note}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="tabular text-left text-emerald-700">
                                                {row.in > 0 ? formatMoney(row.in) : '—'}
                                            </td>
                                            <td className="tabular text-left text-red-700">
                                                {row.out > 0 ? formatMoney(row.out) : '—'}
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

/* ── Opening a box ───────────────────────────────────────── */

function CashBoxDialog({ onClose, box }: { onClose: () => void; box?: CashBoxSummary }) {
    const toast = useToast()
    const save = useSaveCashBox(box?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [name, setName] = useState(box?.name ?? '')
    const [type, setType] = useState(box?.type === 'bank' ? 'bank' : 'cash')
    const [accountNumber, setAccountNumber] = useState(box?.account_number ?? '')
    const [isActive, setIsActive] = useState(box?.is_active ?? true)

    return (
        <Modal
            open
            onClose={onClose}
            title={box ? 'تعديل الخزينة' : 'خزينة جديدة'}
            size="sm"
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
                                    name,
                                    type,
                                    account_number: accountNumber || null,
                                    ...(box ? { is_active: isActive } : {}),
                                })
                                toast.success(box ? 'تم حفظ التعديل.' : 'تم فتح الخزينة.')
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
                <Field label="الاسم" required error={errors.name}>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="حساب البنك الأهلي"
                    />
                </Field>

                <Field label="النوع" required error={errors.type}>
                    <Select value={type} onChange={(e) => setType(e.target.value)}>
                        <option value="cash">خزينة نقدية</option>
                        <option value="bank">حساب بنكي</option>
                    </Select>
                </Field>

                {type === 'bank' && (
                    <Field label="رقم الحساب" error={errors.account_number}>
                        <Input
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                )}

                {box && (
                    <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
                        <input
                            type="checkbox"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                            className="size-4 rounded border-navy-300"
                        />
                        خزينة نشطة
                    </label>
                )}
            </div>
        </Modal>
    )
}

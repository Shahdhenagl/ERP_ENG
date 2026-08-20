import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import {
    ArrowLeftRight,
    Banknote,
    Landmark,
    Pencil,
    Plus,
    Trash2,
    TrendingDown,
    TrendingUp,
    Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker'
import { SectionTabs } from '@/components/SectionTabs'
import { MONEY_SECTIONS } from '@/lib/sections'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Th } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import {
    useCashBoxes,
    useDeleteCashBox,
    useSaveCashBox,
    useTreasuryStatement,
    useTreasurySummary,
} from '@/lib/queries'
import { TreasuryDialog } from '@/pages/treasury/TreasuryDialog'
import type { CashBoxSummary } from '@/types'

export function TreasuryPage() {
    const period = usePeriod('month')
    const [dialog, setDialog] = useState<'expense' | 'transfer' | 'box' | null>(null)
    const [openBox, setOpenBox] = useState<CashBoxSummary | null>(null)
    const [editingBox, setEditingBox] = useState<CashBoxSummary | null>(null)
    const [deletingBox, setDeletingBox] = useState<CashBoxSummary | null>(null)
    const deleteBox = useDeleteCashBox()
    const toast = useToast()

    const { range } = period
    const { data: summary, isLoading } = useTreasurySummary(range)
    const { data: boxes } = useCashBoxes()
    const analysis = summary?.analysis

    return (
        <>
            <PageHeader
                title="الخزينة"
                subtitle={summary ? `النقدية المتاحة ${formatMoney(summary.cash_on_hand)}` : undefined}
                actions={
                    <Button icon={Plus} onClick={() => setDialog('box')}>
                        {tr('خزينة جديدة')}
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
                    <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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
                            'mb-5 flex items-center justify-between rounded-xl p-3',
                            analysis.net >= 0
                                ? 'bg-emerald-50 ring-1 ring-emerald-200'
                                : 'bg-red-50 ring-1 ring-red-200',
                        )}
                    >
                        <span className="text-xs font-bold text-navy-700">
                            صافي الفترة {analysis.net >= 0 ? '(فائض)' : '(عجز)'}
                        </span>
                        <span
                            className={clsx(
                                'tabular text-lg font-extrabold',
                                analysis.net >= 0 ? 'text-emerald-700' : 'text-red-700',
                            )}
                        >
                            {formatMoney(analysis.net)}
                        </span>
                    </div>

                    <div className="mb-5 grid gap-3 lg:grid-cols-2">
                        <Breakdown title="الإيراد" rows={analysis.income} tone="up" />
                        <Breakdown title="المصروف" rows={analysis.expense} tone="down" />
                    </div>
                </>
            )}

            {/* ══ Boxes ═════════════════════════════════════════ */}
            <div className="mb-3 flex flex-wrap gap-2">
                <Button variant="secondary" icon={Banknote} onClick={() => setDialog('expense')}>
                    {tr('تسجيل مصروف')}
                </Button>
                <Button variant="secondary" icon={ArrowLeftRight} onClick={() => setDialog('transfer')}>
                    {tr('تحويل بين الخزائن')}
                </Button>
            </div>

            {!boxes?.length ? (
                <EmptyState icon={Wallet} title="لا توجد خزائن" />
            ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                    {boxes.map((box) => (
                        <button
                            key={box.id}
                            onClick={() => setOpenBox(box)}
                            className="card-interactive p-3.5 text-start"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span
                                        className={clsx(
                                            'grid size-9 shrink-0 place-items-center rounded-xl',
                                            box.type === 'bank'
                                                ? 'bg-indigo-50 text-indigo-600'
                                                : box.type === 'custody'
                                                  ? 'bg-amber-50 text-amber-600'
                                                  : 'bg-emerald-50 text-emerald-600',
                                        )}
                                    >
                                        {box.type === 'bank' ? (
                                            <Landmark className="size-4" />
                                        ) : (
                                            <Wallet className="size-4" />
                                        )}
                                    </span>

                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-navy-900">{box.name}</p>
                                        <p className="truncate text-[10px] text-navy-400">
                                            {box.type === 'custody'
                                                ? `عهدة ${box.holder ?? ''}`
                                                : box.type_label}
                                            {box.account_number && ` · ${box.account_number}`}
                                        </p>
                                    </div>
                                </div>

                                <p
                                    className={clsx(
                                        'tabular shrink-0 text-sm font-extrabold',
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
                        toast.error(
                            errorMessage(
                                caught,
                                'لا يمكن حذف الخزينة المرتبطة بسندات مالية. قم بإيقافها بدلًا من حذفها.',
                            ),
                        )
                    }
                }}
                title="حذف الخزينة"
                message={`حذف «${deletingBox?.name ?? ''}»؟ إذا كانت الخزينة مرتبطة بأي سند مالي فلن تُحذف. استخدم تعديل الخزينة ثم أوقفها بدلًا من حذفها.`}
                confirmLabel="حذف"
                loading={deleteBox.isPending}
                danger
            />

        </>
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
        <div className="card p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-navy-400">
                {Icon && <Icon className="size-3.5" />}
                {label}
            </p>
            <p className={clsx('tabular mt-1 text-base font-extrabold', colour)}>{value}</p>
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
        <section className="card p-3">
            <h2 className="mb-2 text-xs font-bold text-navy-800">{title}</h2>

            {rows.length === 0 ? (
                <p className="text-xs text-navy-400">لا توجد حركات في هذه الفترة.</p>
            ) : (
                <div className="space-y-2">
                    {rows.map((row) => (
                        <div key={row.source}>
                            <div className="flex items-center justify-between text-xs">
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
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-navy-100">
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
                            {tr('تعديل')}
                        </Button>
                        <Button
                            variant="secondary"
                            icon={Trash2}
                            className="text-xs text-red-600"
                            onClick={onDelete}
                        >
                            {tr('حذف')}
                        </Button>
                    </>
                ) : undefined
            }
        >
            {isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat label="أول المدة" value={formatMoney(data.opening_balance)} tone="muted" />
                        <Stat label="وارد" value={formatMoney(data.in_total)} tone="up" />
                        <Stat label="منصرف" value={formatMoney(data.out_total)} tone="down" />
                        <Stat label="الرصيد" value={formatMoney(data.closing_balance)} tone="brand" />
                    </div>

                    {data.rows.length === 0 ? (
                        <p className="rounded-xl bg-navy-50 p-3 text-center text-xs text-navy-400">
                            {tr('لا توجد حركات في هذه الفترة.')}
                        </p>
                    ) : (
                        <div className="w-full min-w-0 overflow-hidden">
                            {/* Desktop: the fixed layout keeps every column inside the dialog. */}
                            <table className="doc-table treasury-table hidden w-full table-fixed md:table">
                                <thead>
                                    <tr>
                                        <Th className="w-[8%]">التاريخ</Th>
                                        <Th className="w-[10%]">نوع الإيصال</Th>
                                        <Th className="w-[11%]">الرقم No</Th>
                                        <Th className="w-[18%]">البيان</Th>
                                        <Th className="w-[14%]">مستلم / دافع</Th>
                                        <Th className="w-[16%]">الحساب المقابل</Th>
                                        <Th className="w-[8%] text-left">مدين</Th>
                                        <Th className="w-[8%] text-left">دائن</Th>
                                        <Th className="w-[9%] text-left">الرصيد</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="break-words tabular text-navy-500">
                                                {row.date ? formatDate(row.date) : '—'}
                                            </td>
                                            <td className="break-words font-semibold text-navy-800">{row.voucher_type}</td>
                                            <td className="break-words tabular font-bold text-brand-700">
                                                {row.voucher_number}
                                                {row.journal_code && (
                                                    <span className="block break-words text-[9px] font-medium text-navy-400">
                                                        {row.journal_code}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="break-words text-navy-700">{row.description}</td>
                                            <td className="break-words text-navy-700">{row.party ?? '—'}</td>
                                            <td className="break-words text-navy-700">
                                                {row.account_name ?? 'بانتظار الترحيل'}
                                                {row.account_type && (
                                                    <span className="block text-[10px] text-navy-400">{row.account_type}</span>
                                                )}
                                            </td>
                                            <td className="break-words tabular text-left text-emerald-700">
                                                {row.debit > 0 ? formatMoney(row.debit) : '—'}
                                            </td>
                                            <td className="break-words tabular text-left text-red-700">
                                                {row.credit > 0 ? formatMoney(row.credit) : '—'}
                                            </td>
                                            <td className="break-words tabular text-left font-bold text-navy-900">
                                                {formatMoney(row.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Mobile: each movement becomes a readable card, so no horizontal scrolling is needed. */}
                            <div className="space-y-1.5 md:hidden">
                                {data.rows.map((row) => (
                                    <article key={row.id} className="rounded-xl border border-navy-100 bg-white p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="break-words text-xs font-bold text-navy-800">{row.voucher_type}</p>
                                                <p className="mt-0.5 break-words text-[10px] font-bold text-brand-700">
                                                    {row.voucher_number}
                                                    {row.journal_code && ` · ${row.journal_code}`}
                                                </p>
                                            </div>
                                            <span className="tabular shrink-0 text-[10px] text-navy-500">
                                                {row.date ? formatDate(row.date) : '—'}
                                            </span>
                                        </div>

                                        <div className="mt-2 space-y-1.5 border-t border-navy-100 pt-2 text-xs">
                                            <p className="break-words">
                                                <span className="font-bold text-navy-500">البيان: </span>
                                                <span className="text-navy-800">{row.description}</span>
                                            </p>
                                            <p className="break-words">
                                                <span className="font-bold text-navy-500">المستلم / الدافع: </span>
                                                <span className="text-navy-800">{row.party ?? '—'}</span>
                                            </p>
                                            <p className="break-words">
                                                <span className="font-bold text-navy-500">الحساب المقابل: </span>
                                                <span className="text-navy-800">{row.account_name ?? 'بانتظار الترحيل'}</span>
                                                {row.account_type && <span className="text-navy-400"> · {row.account_type}</span>}
                                            </p>
                                        </div>

                                        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-navy-100 pt-2 text-center text-[10px]">
                                            <div>
                                                <span className="block text-navy-400">مدين</span>
                                                <span className="tabular font-bold text-emerald-700">
                                                    {row.debit > 0 ? formatMoney(row.debit) : '—'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-navy-400">دائن</span>
                                                <span className="tabular font-bold text-red-700">
                                                    {row.credit > 0 ? formatMoney(row.credit) : '—'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-navy-400">الرصيد</span>
                                                <span className="tabular font-bold text-navy-900">{formatMoney(row.balance)}</span>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
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
                        {tr('إلغاء')}
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
                        {tr('حفظ')}
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
                        {tr('الخزينة نشطة — أزل التحديد لإيقافها/أرشفتها')}
                    </label>
                )}
            </div>
        </Modal>
    )
}

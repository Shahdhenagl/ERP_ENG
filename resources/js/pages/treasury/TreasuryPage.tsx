import clsx from 'clsx'
import {
    ArrowLeftRight,
    Banknote,
    Landmark,
    Plus,
    TrendingDown,
    TrendingUp,
    Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker'
import { SectionTabs } from '@/components/SectionTabs'
import { MONEY_SECTIONS } from '@/lib/sections'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate, formatSmart } from '@/lib/format'
import {
    useCashBoxes,
    useCashMovements,
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

    const { range } = period
    const { data: summary, isLoading } = useTreasurySummary(range)
    const { data: boxes } = useCashBoxes()
    const { data: movements } = useCashMovements({ ...range, per_page: 40 })

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
                            className="card-interactive p-4 text-right"
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
                <h2 className="mb-3 font-bold text-navy-900">حركة الخزينة</h2>

                {!movements?.length ? (
                    <EmptyState icon={Banknote} title="لا توجد حركات في هذه الفترة" />
                ) : (
                    <div className="space-y-2">
                        {movements.map((movement) => (
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
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {dialog === 'box' ? (
                <CashBoxDialog onClose={() => setDialog(null)} />
            ) : dialog ? (
                <TreasuryDialog operation={dialog} onClose={() => setDialog(null)} />
            ) : null}

            {openBox && (
                <StatementDialog box={openBox} range={range} onClose={() => setOpenBox(null)} />
            )}
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
}: {
    box: CashBoxSummary
    range: { from?: string; to?: string }
    onClose: () => void
}) {
    const { data, isLoading } = useTreasuryStatement(box.id, range)

    return (
        <Modal open onClose={onClose} title={`كشف ${box.name}`} size="lg">
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
                                        <th className="w-24">التاريخ</th>
                                        <th>البيان</th>
                                        <th className="w-24 text-left">وارد</th>
                                        <th className="w-24 text-left">منصرف</th>
                                        <th className="w-28 text-left">الرصيد</th>
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

function CashBoxDialog({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSaveCashBox()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [name, setName] = useState('')
    const [type, setType] = useState('cash')
    const [accountNumber, setAccountNumber] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title="خزينة جديدة"
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
                                })
                                toast.success('تم فتح الخزينة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر فتح الخزينة.'))
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
            </div>
        </Modal>
    )
}

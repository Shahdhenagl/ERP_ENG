import clsx from 'clsx'
import { CalendarRange, FileText } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, Field, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useCashBoxes, useTreasuryStatement } from '@/lib/queries'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * A cashier's daybook. The presentation deliberately follows the familiar
 * paper-cashbook layout: a bold period band, compact ledger headings, and a
 * balance carried down every line.
 */
export function DaybookPage() {
    const { data: boxes } = useCashBoxes()
    const [boxId, setBoxId] = useState<number | null>(null)
    const [from, setFrom] = useState(today())
    const [to, setTo] = useState(today())

    const { data, isLoading } = useTreasuryStatement(boxId ?? undefined, { from, to })
    const periodTitle = from.slice(0, 4) === to.slice(0, 4)
        ? `حركة الخزينة لعام ${from.slice(0, 4)}`
        : `حركة الخزينة من ${from} إلى ${to}`

    return (
        <>
            <PageHeader title="حركة الخزينة اليومية" subtitle="دفتر حركة نقدية مربوط بالقيود اليومية والرصيد الجاري" />

            <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[2fr_1fr_1fr]">
                <Field label="الخزينة">
                    <Select
                        value={boxId ?? ''}
                        onChange={(e) => setBoxId(e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">اختر الخزينة…</option>
                        {boxes?.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} · {box.type_label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="من">
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field label="إلى">
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </Field>
            </div>

            {!boxId ? (
                <EmptyState
                    icon={CalendarRange}
                    title="اختر خزينة لعرض حركتها"
                    description="سيظهر كل ما دخل وخرج في الفترة مع الرصيد الجاري."
                />
            ) : isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
                    <div className="grid grid-cols-2 border-b border-slate-300 sm:grid-cols-4" dir="rtl">
                        <LedgerTotal label="رصيد أول المدة" value={formatMoney(data.opening_balance)} />
                        <LedgerTotal label="إجمالي المدين / الوارد" value={formatMoney(data.in_total)} tone="debit" />
                        <LedgerTotal label="إجمالي الدائن / المنصرف" value={formatMoney(data.out_total)} tone="credit" />
                        <LedgerTotal label="رصيد آخر المدة" value={formatMoney(data.closing_balance)} accent />
                    </div>

                    <div className="bg-slate-950 px-4 py-2 text-center text-sm font-extrabold tracking-wide text-white sm:text-base" dir="rtl">
                        {periodTitle}
                    </div>

                    {!data.rows.length ? (
                        <div className="p-6">
                            <EmptyState icon={FileText} title="لا توجد حركات في هذه الفترة" />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1390px] border-collapse text-xs" dir="rtl">
                                <thead className="bg-slate-700 text-white">
                                    <tr>
                                        <LedgerHead className="w-28">التاريخ</LedgerHead>
                                        <LedgerHead className="w-28">نوع الإيصال</LedgerHead>
                                        <LedgerHead className="w-28">الرقم No</LedgerHead>
                                        <LedgerHead className="min-w-80">البيان Description</LedgerHead>
                                        <LedgerHead className="w-48">اسم مستلم / دافع المبلغ</LedgerHead>
                                        <LedgerHead className="w-48">فرع / نوع الحساب</LedgerHead>
                                        <LedgerHead className="w-28" align="numeric">مدين</LedgerHead>
                                        <LedgerHead className="w-28" align="numeric">دائن</LedgerHead>
                                        <LedgerHead className="w-32" align="numeric">الرصيد</LedgerHead>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((row) => (
                                        <tr key={row.id} className="border-b border-slate-300 bg-white transition-colors even:bg-slate-50 hover:bg-amber-50/70">
                                            <LedgerCell className="font-semibold text-slate-700">
                                                {row.date ? formatDate(row.date) : '—'}
                                            </LedgerCell>
                                            <LedgerCell className="font-bold text-slate-800">{row.voucher_type}</LedgerCell>
                                            <LedgerCell className="font-bold text-blue-700">
                                                {row.voucher_number}
                                                {row.journal_code && (
                                                    <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                                                        {row.journal_code}
                                                    </span>
                                                )}
                                            </LedgerCell>
                                            <LedgerCell className="whitespace-normal text-slate-800">{row.description}</LedgerCell>
                                            <LedgerCell className="font-semibold text-slate-700">{row.party ?? '—'}</LedgerCell>
                                            <LedgerCell className="text-slate-800">
                                                {row.account_name ?? 'بانتظار الترحيل'}
                                                {row.account_type && (
                                                    <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                                                        {row.account_type}
                                                    </span>
                                                )}
                                            </LedgerCell>
                                            <LedgerCell align="numeric" className="font-extrabold text-emerald-700">
                                                {row.debit ? formatMoney(row.debit) : '—'}
                                            </LedgerCell>
                                            <LedgerCell align="numeric" className="font-extrabold text-red-700">
                                                {row.credit ? formatMoney(row.credit) : '—'}
                                            </LedgerCell>
                                            <LedgerCell
                                                align="numeric"
                                                className={clsx(
                                                    'font-extrabold',
                                                    row.balance < 0 ? 'text-red-800' : 'text-slate-950',
                                                )}
                                            >
                                                {formatMoney(row.balance)}
                                            </LedgerCell>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </>
    )
}

function LedgerHead({
    children,
    className,
    align = 'start',
}: {
    children: string
    className?: string
    align?: 'start' | 'numeric'
}) {
    return (
        <th
            className={clsx(
                'border-s border-slate-500 px-3 py-2.5 text-[11px] font-extrabold leading-tight',
                align === 'numeric' ? 'text-end' : 'text-start',
                className,
            )}
        >
            <span className="flex items-center justify-between gap-2">
                {children}
                <span aria-hidden="true" className="rounded-sm border border-slate-400/70 px-0.5 text-[8px] leading-3 text-slate-200">⌄</span>
            </span>
        </th>
    )
}

function LedgerCell({
    children,
    className,
    align = 'start',
}: {
    children: React.ReactNode
    className?: string
    align?: 'start' | 'numeric'
}) {
    return (
        <td
            className={clsx(
                'border-s border-slate-300 px-3 py-2 align-middle leading-snug',
                align === 'numeric' ? 'tabular text-end' : 'text-start',
                className,
            )}
        >
            {children}
        </td>
    )
}

function LedgerTotal({
    label,
    value,
    tone,
    accent,
}: {
    label: string
    value: string
    tone?: 'debit' | 'credit'
    accent?: boolean
}) {
    return (
        <div className="border-s border-slate-300 px-3 py-2.5 text-center first:border-s-0">
            <p className="text-[10px] font-extrabold text-slate-500">{label}</p>
            <p
                className={clsx(
                    'mt-0.5 tabular text-sm font-black',
                    accent
                        ? 'text-blue-800'
                        : tone === 'debit'
                          ? 'text-emerald-700'
                          : tone === 'credit'
                            ? 'text-red-700'
                            : 'text-slate-900',
                )}
            >
                {value}
            </p>
        </div>
    )
}

import clsx from 'clsx'
import { CalendarRange, FileText, Filter, Printer, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ExportButton } from '@/components/ExportButton'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useCashBoxes, useTreasuryStatement } from '@/lib/queries'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * A cashier's daybook. The presentation deliberately follows the familiar
 * paper-cashbook layout: compact ledger headings and a balance carried down
 * every line.
 */
export function DaybookPage() {
    const { data: boxes } = useCashBoxes()
    const [boxId, setBoxId] = useState<number | null>(null)
    const [from, setFrom] = useState(today())
    const [to, setTo] = useState(today())
    const [dateFilter, setDateFilter] = useState('')
    const [voucherTypeFilter, setVoucherTypeFilter] = useState('')
    const [numberFilter, setNumberFilter] = useState('')
    const [descriptionFilter, setDescriptionFilter] = useState('')
    const [partyFilter, setPartyFilter] = useState('')
    const [accountTypeFilter, setAccountTypeFilter] = useState('')

    const { data, isLoading } = useTreasuryStatement(boxId ?? undefined, { from, to })
    const voucherTypes = useMemo(
        () => [...new Set((data?.rows ?? []).map((row) => row.voucher_type).filter(Boolean))],
        [data?.rows],
    )
    const accountTypes = useMemo(
        () => [...new Set((data?.rows ?? []).map((row) => row.account_type).filter((type): type is string => Boolean(type)))],
        [data?.rows],
    )
    const activeFilterCount = [
        dateFilter,
        voucherTypeFilter,
        numberFilter,
        descriptionFilter,
        partyFilter,
        accountTypeFilter,
    ].filter(Boolean).length

    const clearTableFilters = () => {
        setDateFilter('')
        setVoucherTypeFilter('')
        setNumberFilter('')
        setDescriptionFilter('')
        setPartyFilter('')
        setAccountTypeFilter('')
    }

    const visibleRows = useMemo(() => {
        const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase()
        const numberTerm = normalize(numberFilter)
        const descriptionTerm = normalize(descriptionFilter)
        const partyTerm = normalize(partyFilter)

        return (data?.rows ?? []).filter((row) => {
            const rowDate = row.date ? String(row.date).slice(0, 10) : ''
            const rowNumber = normalize(row.voucher_number)
            const rowDescription = normalize(row.description)
            const rowParty = normalize(row.party)

            return (
                (!dateFilter || rowDate === dateFilter)
                && (!voucherTypeFilter || row.voucher_type === voucherTypeFilter)
                && (!numberTerm || rowNumber.includes(numberTerm))
                && (!descriptionTerm || rowDescription.includes(descriptionTerm))
                && (!partyTerm || rowParty.includes(partyTerm))
                && (!accountTypeFilter || row.account_type === accountTypeFilter)
            )
        })
    }, [accountTypeFilter, data?.rows, dateFilter, descriptionFilter, numberFilter, partyFilter, voucherTypeFilter])
    return (
        <div id="daybook-report" className="daybook-report">
            <PageHeader
                title="حركة الخزينة اليومية"
                subtitle="دفتر حركة نقدية مربوط بالقيود اليومية والرصيد الجاري"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <ExportButton
                            filename="treasury-daybook"
                            headers={[
                                'التاريخ',
                                'نوع الإيصال',
                                'الرقم No',
                                'كود القيد',
                                'البيان Description',
                                'اسم المستلم / الدافع',
                                                                    'الحساب / الفروع',

                                'مدين',
                                'دائن',
                                'الرصيد',
                            ]}
                            disabled={!visibleRows.length}
                            rows={async () =>
                                visibleRows.map((row) => [
                                    row.date ? formatDate(row.date) : '',
                                    row.voucher_type,
                                    row.voucher_number,
                                    row.journal_code ?? '',
                                    row.description,
                                    row.party ?? '',
                                    [
                                        [row.account_name, row.account_type].filter(Boolean).join(' / '),
                                        row.payment_method_label ? `الطريقة: ${row.payment_method_label}` : '',
                                        row.branches?.length ? `الفروع: ${row.branches.map((branch) => branch.label).join('، ')}` : '',
                                    ].filter(Boolean).join(' — '),
                                    row.debit || 0,
                                    row.credit || 0,
                                    row.balance,
                                ])
                            }
                        />
                        <Button
                            icon={Printer}
                            variant="secondary"
                            className="daybook-print-button"
                            onClick={() => window.print()}
                        >
                            طباعة الكشف
                        </Button>
                    </div>
                }
            />

            <section className="daybook-filters mb-5 rounded-2xl border border-navy-100 bg-surface p-4 shadow-[var(--shadow-card)]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 pb-3">
                    <div className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
                            <Filter className="size-4" />
                        </span>
                        <div>
                            <h2 className="text-xs font-extrabold text-navy-800">فلاتر الكشف</h2>
                            <p className="mt-0.5 text-[10px] text-navy-400">اختاري خزينة وفترة، ثم ضيّقي النتائج حسب بيانات السند.</p>
                        </div>
                        {activeFilterCount > 0 && (
                            <span className="badge bg-brand-50 text-brand-700">{activeFilterCount} فلاتر نشطة</span>
                        )}
                    </div>
                    {activeFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={clearTableFilters}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-navy-500 transition hover:bg-navy-50 hover:text-navy-800"
                        >
                            <RotateCcw className="size-3.5" />
                            مسح فلاتر البحث
                        </button>
                    )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="الخزينة" className="lg:col-span-2">
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
                    <Field label="تاريخ السند">
                        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                    </Field>
                    <Field label="نوع الإيصال">
                        <Select value={voucherTypeFilter} onChange={(e) => setVoucherTypeFilter(e.target.value)}>
                            <option value="">كل الأنواع</option>
                            {voucherTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </Select>
                    </Field>
                    <Field label="رقم السند">
                        <Input value={numberFilter} onChange={(e) => setNumberFilter(e.target.value)} placeholder="اكتب رقم السند" />
                    </Field>
                    <Field label="نوع الحساب">
                        <Select value={accountTypeFilter} onChange={(e) => setAccountTypeFilter(e.target.value)}>
                            <option value="">كل الحسابات</option>
                            {accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </Select>
                    </Field>
                    <Field label="البيان" className="lg:col-span-2">
                        <Input value={descriptionFilter} onChange={(e) => setDescriptionFilter(e.target.value)} placeholder="ابحث في البيان أو الوصف" />
                    </Field>
                    <Field label="المستلم / الدافع" className="lg:col-span-2">
                        <Input value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} placeholder="ابحث باسم المستلم أو الدافع" />
                    </Field>
                </div>
            </section>

            {!boxId ? (
                <EmptyState
                    icon={CalendarRange}
                    title="اختر خزينة لعرض حركتها"
                    description="سيظهر كل ما دخل وخرج في الفترة مع الرصيد الجاري."
                />
            ) : isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <section className="daybook-sheet overflow-hidden rounded-xl border border-navy-100 bg-surface shadow-[var(--shadow-card)]">
                    <div className="grid grid-cols-2 border-b border-navy-100 bg-white sm:grid-cols-4" dir="rtl">
                        <LedgerTotal label="رصيد أول المدة" value={formatMoney(data.opening_balance)} />
                        <LedgerTotal label="إجمالي المدين / الوارد" value={formatMoney(data.in_total)} tone="debit" />
                        <LedgerTotal label="إجمالي الدائن / المنصرف" value={formatMoney(data.out_total)} tone="credit" />
                        <LedgerTotal label="رصيد آخر المدة" value={formatMoney(data.closing_balance)} accent />
                    </div>

                    {!data.rows.length ? (
                        <div className="p-6">
                            <EmptyState icon={FileText} title="لا توجد حركات في هذه الفترة" />
                        </div>
                    ) : (
                        <div className="daybook-table-wrap">
                            <table className="daybook-table w-full table-fixed border-collapse text-[11px]" dir="rtl">
                                <thead className="bg-navy-50 text-navy-700">
                                    <tr>
                                        <LedgerHead className="w-[8%]">التاريخ</LedgerHead>
                                        <LedgerHead className="w-[10%]">نوع الإيصال</LedgerHead>
                                        <LedgerHead className="w-[10%]">الرقم No</LedgerHead>
                                        <LedgerHead className="w-[21%]">البيان Description</LedgerHead>
                                        <LedgerHead className="w-[14%]">اسم مستلم / دافع المبلغ</LedgerHead>
                                        <LedgerHead className="w-[14%]">الحساب / الفروع</LedgerHead>
                                        <LedgerHead className="w-[7%]" align="numeric">مدين</LedgerHead>
                                        <LedgerHead className="w-[7%]" align="numeric">دائن</LedgerHead>
                                        <LedgerHead className="w-[9%]" align="numeric">الرصيد</LedgerHead>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleRows.map((row) => (
                                        <tr key={row.id} className="border-b border-navy-100 bg-white transition-colors even:bg-navy-50/30 hover:bg-brand-50/60">
                                            <LedgerCell dataLabel="التاريخ" className="font-semibold text-navy-700">
                                                {row.date ? formatDate(row.date) : '—'}
                                            </LedgerCell>
                                            <LedgerCell dataLabel="نوع الإيصال" className="font-bold text-navy-900">{row.voucher_type}</LedgerCell>
                                            <LedgerCell dataLabel="الرقم" className="font-bold text-brand-700">
                                                {row.voucher_number}
                                                {row.journal_code && (
                                                    <span className="mt-0.5 block text-[10px] font-medium text-navy-400">
                                                        {row.journal_code}
                                                    </span>
                                                )}
                                            </LedgerCell>
                                            <LedgerCell dataLabel="البيان" className="whitespace-normal break-words text-navy-800">{row.description}</LedgerCell>
                                            <LedgerCell dataLabel="المستلم / الدافع" className="break-words font-semibold text-navy-700">{row.party ?? '—'}</LedgerCell>
                                            <LedgerCell dataLabel="الحساب / الفروع" className="break-words text-navy-800">
                                                {row.account_name ?? 'بانتظار الترحيل'}
                                                {row.account_type && (
                                                    <span className="mt-0.5 block text-[10px] font-medium text-navy-400">
                                                        {row.account_type}
                                                    </span>
                                                )}
                                                {row.payment_method_label && (
                                                    <span className="mt-0.5 block text-[10px] font-semibold text-navy-500">
                                                        الطريقة: {row.payment_method_label}
                                                    </span>
                                                )}
                                                {row.branches?.length ? (
                                                    <span
                                                        className="mt-0.5 block font-semibold text-brand-600"
                                                        title={row.branches.map((branch) => branch.label).join('، ')}
                                                    >
                                                        الفروع: {row.branches.map((branch) => branch.label).join('، ')}
                                                    </span>
                                                ) : null}
                                            </LedgerCell>
                                            <LedgerCell dataLabel="مدين" align="numeric" className="font-extrabold text-emerald-700">
                                                {row.debit ? formatMoney(row.debit) : '—'}
                                            </LedgerCell>
                                            <LedgerCell dataLabel="دائن" align="numeric" className="font-extrabold text-red-700">
                                                {row.credit ? formatMoney(row.credit) : '—'}
                                            </LedgerCell>
                                            <LedgerCell
                                                dataLabel="الرصيد"
                                                align="numeric"
                                                className={clsx(
                                                    'font-extrabold',
                                                    row.balance < 0 ? 'text-red-800' : 'text-navy-950',
                                                )}
                                            >
                                                {formatMoney(row.balance)}
                                            </LedgerCell>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!visibleRows.length && (
                                <div className="border-t border-navy-100 p-6">
                                    <EmptyState icon={FileText} title="لا توجد نتائج مطابقة للفلاتر" />
                                </div>
                            )}
                        </div>
                    )}
                </section>
            )}
        </div>
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
                'border-s border-navy-700 px-3 py-2.5 text-[11px] font-extrabold leading-tight',
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
    dataLabel,
}: {
    children: React.ReactNode
    className?: string
    align?: 'start' | 'numeric'
    dataLabel?: string
}) {
    return (
        <td
            data-label={dataLabel}
            className={clsx(
                'border-s border-navy-100 px-3 py-2 align-middle leading-snug',
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
        <div className="border-s border-navy-100 px-3 py-2.5 text-center first:border-s-0">
            <p className="text-[10px] font-extrabold text-navy-400">{label}</p>
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

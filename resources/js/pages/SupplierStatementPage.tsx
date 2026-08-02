import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { Building2, FileText, Printer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Field, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useSuppliers, useSupplierStatement } from '@/lib/queries'

/**
 * A supplier's account, mirroring the customer statement.
 *
 * Opening balance, every bill and payment in order, then the closing balance —
 * plus what has been received but not yet invoiced, since that is money owed
 * the ledger does not show until the supplier's invoice arrives.
 */
export function SupplierStatementPage() {
    const { data: suppliers } = useSuppliers()
    const { path } = useArea()

    const [supplierId, setSupplierId] = useState<number | null>(null)
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')

    const { data, isLoading } = useSupplierStatement(supplierId ?? undefined, {
        from: from || undefined,
        to: to || undefined,
    })

    return (
        <>
            <PageHeader
                title="كشف حساب المورد"
                subtitle="الفواتير والمدفوعات والرصيد الجاري"
                actions={
                    <Link
                        to={`${path('/print/supplier-statements')}/${supplierId ?? 0}?${new URLSearchParams(
                            {
                                ...(from ? { from } : {}),
                                ...(to ? { to } : {}),
                            },
                        ).toString()}`}
                        target="_blank"
                        className={clsx('btn-secondary', !supplierId && 'pointer-events-none opacity-40')}
                    >
                        <Printer className="size-4" />
                        {tr('طباعة')}
                    </Link>
                }
            />

            <div className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <Field label="المورد">
                    <Select
                        value={supplierId ?? ''}
                        onChange={(event) =>
                            setSupplierId(event.target.value ? Number(event.target.value) : null)
                        }
                    >
                        <option value="">اختر المورد…</option>
                        {suppliers?.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                                {supplier.company ? ` — ${supplier.company}` : ''}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="من تاريخ">
                    <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                </Field>
                <Field label="إلى تاريخ">
                    <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </Field>
            </div>

            {!supplierId ? (
                <EmptyState
                    icon={Building2}
                    title="اختر موردًا لعرض كشف حسابه"
                    description="سيظهر رصيد أول المدة وكل الفواتير والمدفوعات ورصيد آخر المدة."
                />
            ) : isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <>
                    <div className="mb-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <Tile label="رصيد أول المدة" value={formatMoney(data.opening_balance)} />
                        <Tile label="إجمالي الفواتير" value={formatMoney(data.total_credit)} />
                        <Tile label="إجمالي المدفوع" value={formatMoney(data.total_debit)} />
                        <Tile
                            label="رصيد آخر المدة"
                            value={formatMoney(data.closing_balance)}
                            tone={data.closing_balance > 0 ? 'due' : 'clear'}
                        />
                    </div>

                    {data.uninvoiced > 0 && (
                        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                            مستلَم بلا فاتورة بعد: {formatMoney(data.uninvoiced)}
                        </p>
                    )}

                    {!data.rows.length ? (
                        <EmptyState icon={FileText} title="لا توجد حركات في هذه الفترة" />
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-navy-100">
                            <table className="w-full min-w-[560px] text-sm">
                                <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                                    <tr>
                                        <Th>التاريخ</Th>
                                        <Th>النوع</Th>
                                        <Th>المستند</Th>
                                        <Th align="left">مدين</Th>
                                        <Th align="left">دائن</Th>
                                        <Th align="left">الرصيد</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((row, index) => (
                                        <tr
                                            key={`${row.code}-${index}`}
                                            className="border-t border-navy-100"
                                        >
                                            <td className="px-3 py-2.5 text-navy-500">
                                                {formatDate(row.date)}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className="text-navy-700">{row.type_label}</span>
                                                {row.note && (
                                                    <span className="block text-[11px] text-navy-400">
                                                        {row.note}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="tabular px-3 py-2.5 font-bold text-brand-600">
                                                {row.code}
                                            </td>
                                            <td className="tabular px-3 py-2.5 text-left text-navy-700">
                                                {row.debit ? formatMoney(row.debit) : '—'}
                                            </td>
                                            <td className="tabular px-3 py-2.5 text-left text-navy-700">
                                                {row.credit ? formatMoney(row.credit) : '—'}
                                            </td>
                                            <td className="tabular px-3 py-2.5 text-left font-extrabold text-navy-900">
                                                {formatMoney(row.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </>
    )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'due' | 'clear' }) {
    return (
        <div className="rounded-xl bg-navy-50 px-3 py-2">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p
                className={
                    'tabular text-sm font-extrabold ' +
                    (tone === 'due'
                        ? 'text-red-600'
                        : tone === 'clear'
                          ? 'text-emerald-600'
                          : 'text-navy-900')
                }
            >
                {value}
            </p>
        </div>
    )
}

function Th({ children, align }: { children: ReactNode; align?: 'left' }) {
    return (
        <th className={'px-3 py-2 ' + (align === 'left' ? 'text-left' : 'text-start')}>{children}</th>
    )
}

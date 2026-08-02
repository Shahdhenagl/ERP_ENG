import { FileText, Printer, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Field, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useCustomers, useStatement } from '@/lib/queries'

/**
 * A customer's account, read on screen instead of printed.
 *
 * Pick a customer and a date window, and every invoice and receipt lines up in
 * order with the balance carried down — the same page the print sheet builds,
 * here for a quick look before deciding whether to chase it. The print link
 * hands off to the sheet that gets sent.
 */
export function CustomerStatementPage() {
    const { path } = useArea()
    const { data: customerPage } = useCustomers({ per_page: 200 })
    const customers = customerPage?.data ?? []

    const [customerId, setCustomerId] = useState<number | null>(null)
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')

    const { data, isLoading } = useStatement(customerId ?? undefined, {
        from: from || undefined,
        to: to || undefined,
    })

    return (
        <>
            <PageHeader title="كشف حساب العميل" subtitle="الفواتير والتحصيلات والرصيد الجاري" />

            <div className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <Field label="العميل">
                    <Select
                        value={customerId ?? ''}
                        onChange={(event) =>
                            setCustomerId(event.target.value ? Number(event.target.value) : null)
                        }
                    >
                        <option value="">اختر العميل…</option>
                        {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                                {customer.name}
                                {customer.company ? ` — ${customer.company}` : ''}
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

            {!customerId ? (
                <EmptyState
                    icon={Users}
                    title="اختر عميلًا لعرض كشف حسابه"
                    description="سيظهر كل ما عليه وما دفعه مرتبًا بالتاريخ مع الرصيد الجاري."
                />
            ) : isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <Tile label="إجمالي المستحق" value={formatMoney(data.meta.total_invoiced)} />
                            <Tile label="إجمالي المحصّل" value={formatMoney(data.meta.total_collected)} />
                            <Tile
                                label="الرصيد"
                                value={formatMoney(data.meta.balance)}
                                tone={data.meta.balance > 0 ? 'due' : 'clear'}
                            />
                        </div>

                        <Link
                            to={path(
                                `/print/statements/${customerId}?${new URLSearchParams({
                                    ...(from ? { from } : {}),
                                    ...(to ? { to } : {}),
                                }).toString()}`,
                            )}
                            target="_blank"
                            className="btn-secondary text-xs"
                        >
                            <Printer className="size-4" />
                            طباعة
                        </Link>
                    </div>

                    {!data.data.length ? (
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
                                    {data.data.map((row, index) => (
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
                                            <td className="tabular px-3 py-2.5 text-left text-emerald-600">
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

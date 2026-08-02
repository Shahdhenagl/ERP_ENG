import clsx from 'clsx'
import { CalendarRange, FileText } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Th } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useCashBoxes, useTreasuryStatement } from '@/lib/queries'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The daily cashbook: one box, a date window, every movement in order with the
 * balance carried down and the day opened and closed. What a cashier reconciles
 * against at the end of the day.
 */
export function DaybookPage() {
    const { data: boxes } = useCashBoxes()
    const [boxId, setBoxId] = useState<number | null>(null)
    const [from, setFrom] = useState(today())
    const [to, setTo] = useState(today())

    const { data, isLoading } = useTreasuryStatement(boxId ?? undefined, { from, to })

    return (
        <>
            <PageHeader title="حركة الخزينة اليومية" subtitle="كشف يومي بالرصيد الافتتاحي والختامي" />

            <div className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
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
                <>
                    <div className="mb-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <Tile label="رصيد أول المدة" value={formatMoney(data.opening_balance)} />
                        <Tile label="الوارد" value={formatMoney(data.in_total)} tone="up" />
                        <Tile label="المنصرف" value={formatMoney(data.out_total)} tone="down" />
                        <Tile label="رصيد آخر المدة" value={formatMoney(data.closing_balance)} accent />
                    </div>

                    {!data.rows.length ? (
                        <EmptyState icon={FileText} title="لا توجد حركات في هذه الفترة" />
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-navy-100">
                            <table className="w-full min-w-[560px] text-sm">
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
                                            <td className="px-3 py-2 text-navy-500">{formatDate(row.date)}</td>
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
                </>
            )}
        </>
    )
}

function Tile({
    label,
    value,
    tone,
    accent,
}: {
    label: string
    value: string
    tone?: 'up' | 'down'
    accent?: boolean
}) {
    return (
        <div className="rounded-xl bg-navy-50 px-3 py-2">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular text-sm font-extrabold',
                    accent
                        ? 'text-brand-600'
                        : tone === 'up'
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

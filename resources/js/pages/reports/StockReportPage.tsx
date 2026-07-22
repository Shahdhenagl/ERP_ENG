import clsx from 'clsx'
import { useState } from 'react'
import { Field, Select, SkeletonCard } from '@/components/ui'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useStockReport } from '@/lib/queries'
import { Empty, Figure, Ranked, Section } from '@/pages/reports/parts'

const IDLE_OPTIONS = [30, 60, 90, 180, 365]

export function StockReportPage() {
    const [idleDays, setIdleDays] = useState(90)
    const { data, isLoading } = useStockReport(idleDays)

    if (isLoading || !data) return <SkeletonCard />

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="قيمة المخزون" value={formatMoney(data.total_value)} tone="brand" />
                <Figure label="عدد الأصناف" value={String(data.items_count)} />
                <Figure
                    label="تحت حد الطلب"
                    value={String(data.below_reorder.length)}
                    tone={data.below_reorder.length > 0 ? 'warn' : undefined}
                />
                <Figure
                    label="قيمة الراكد"
                    value={formatMoney(data.idle_value)}
                    tone={data.idle_value > 0 ? 'down' : undefined}
                    hint={`بلا حركة ${data.idle_days} يومًا`}
                />
            </div>

            <Section title="القيمة حسب المخزن" count={data.by_warehouse.length}>
                {data.by_warehouse.length === 0 ? (
                    <Empty>لا يوجد رصيد في أي مخزن.</Empty>
                ) : (
                    <Ranked
                        rows={data.by_warehouse.map((row) => ({
                            key: row.id,
                            label: row.name,
                            note: row.type_label,
                            value: row.value,
                        }))}
                    />
                )}
            </Section>

            <Section title="تحت حد الطلب" count={data.below_reorder.length}>
                {data.below_reorder.length === 0 ? (
                    <Empty>كل الأصناف فوق حد الطلب.</Empty>
                ) : (
                    <div className="space-y-2">
                        {data.below_reorder.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-navy-900">
                                        {item.name}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-500">
                                        المتاح {formatQty(item.qty)} {item.unit} · حد الطلب{' '}
                                        {formatQty(item.reorder_level)}
                                    </p>
                                </div>

                                <span className="tabular shrink-0 text-sm font-extrabold text-amber-700">
                                    ناقص {formatQty(item.shortfall)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <section className="card mt-4 p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-navy-800">مخزون راكد</h2>
                        <p className="mt-0.5 text-[11px] text-navy-400">
                            أصناف عليها رصيد ولم تتحرك — فلوس واقفة في الرف.
                        </p>
                    </div>

                    <Field label="بلا حركة منذ" className="w-40">
                        <Select
                            value={String(idleDays)}
                            onChange={(e) => setIdleDays(Number(e.target.value))}
                        >
                            {IDLE_OPTIONS.map((days) => (
                                <option key={days} value={days}>
                                    {days} يومًا
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                {data.idle.length === 0 ? (
                    <Empty>لا يوجد مخزون راكد بهذه المدة.</Empty>
                ) : (
                    <div className="space-y-2">
                        {data.idle.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-navy-900">
                                        {item.name}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {formatQty(item.qty)} {item.unit}
                                        {item.last_movement &&
                                            ` · آخر حركة ${formatDate(item.last_movement)}`}
                                    </p>
                                </div>

                                <span className={clsx('tabular shrink-0 font-extrabold text-navy-900')}>
                                    {formatMoney(item.value)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <Section title="أكثر القطع استهلاكًا" count={data.most_consumed.length}>
                {data.most_consumed.length === 0 ? (
                    <Empty>لم تُصرف أي قطع على المهام بعد.</Empty>
                ) : (
                    <Ranked
                        tone="down"
                        rows={data.most_consumed.map((row) => ({
                            key: row.id,
                            label: row.name,
                            note: `${formatQty(row.qty)} ${row.unit}`,
                            value: row.value,
                        }))}
                    />
                )}
            </Section>
        </>
    )
}

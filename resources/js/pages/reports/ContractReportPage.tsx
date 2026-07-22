import clsx from 'clsx'
import { useState } from 'react'
import { Field, Select, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useContractReport } from '@/lib/queries'
import { daysChip, Empty, Figure, Section } from '@/pages/reports/parts'
import type { ContractReportRow } from '@/types'

const WINDOWS = [30, 60, 90, 180]

export function ContractReportPage() {
    const [days, setDays] = useState(60)
    const { data, isLoading } = useContractReport(days)

    if (isLoading || !data) return <SkeletonCard />

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="عقود سارية" value={String(data.active)} tone="brand" />
                <Figure label="قيمة العقود" value={formatMoney(data.annual_value)} />
                <Figure
                    label="زيارات متأخرة"
                    value={String(data.visits_overdue)}
                    tone={data.visits_overdue > 0 ? 'warn' : undefined}
                />
                <Figure
                    label="تجاوزات SLA"
                    value={String(data.sla_breaches)}
                    tone={data.sla_breaches > 0 ? 'down' : undefined}
                />
            </div>

            <section className="card mt-4 p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-navy-800">عقود قاربت على الانتهاء</h2>
                        <p className="mt-0.5 text-[11px] text-navy-400">
                            التجديد يُباع قبل الانتهاء، لا بعده.
                        </p>
                    </div>

                    <Field label="خلال" className="w-36">
                        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
                            {WINDOWS.map((window) => (
                                <option key={window} value={window}>
                                    {window} يومًا
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                {data.expiring.length === 0 ? (
                    <Empty>لا توجد عقود تنتهي خلال {days} يومًا.</Empty>
                ) : (
                    <div className="space-y-2">
                        {data.expiring.map((row) => (
                            <ContractRow key={row.id} row={row} />
                        ))}
                    </div>
                )}
            </section>

            <Section title="الالتزام بخطة الزيارات" count={data.rows.length}>
                {data.rows.length === 0 ? (
                    <Empty>لا توجد عقود سارية.</Empty>
                ) : (
                    <div className="space-y-2">
                        {data.rows.map((row) => (
                            <div key={row.id} className="rounded-xl bg-navy-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-navy-900">
                                            {row.customer}
                                        </p>
                                        <p className="tabular text-[11px] text-navy-400">
                                            {row.code} · {row.visits_done} من {row.visits} زيارة
                                            {row.visits_overdue > 0 &&
                                                ` · ${row.visits_overdue} متأخرة`}
                                        </p>
                                    </div>

                                    <span
                                        className={clsx(
                                            'tabular shrink-0 text-sm font-extrabold',
                                            row.compliance_pct >= 75
                                                ? 'text-emerald-700'
                                                : row.compliance_pct >= 40
                                                  ? 'text-amber-600'
                                                  : 'text-red-700',
                                        )}
                                    >
                                        {row.compliance_pct}%
                                    </span>
                                </div>

                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                                    <div
                                        className={clsx(
                                            'h-full rounded-full',
                                            row.compliance_pct >= 75
                                                ? 'bg-emerald-500'
                                                : row.compliance_pct >= 40
                                                  ? 'bg-amber-500'
                                                  : 'bg-red-500',
                                        )}
                                        style={{ width: `${Math.min(row.compliance_pct, 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </>
    )
}

function ContractRow({ row }: { row: ContractReportRow }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3">
            <div className="min-w-0">
                <p className="truncate text-sm font-bold text-navy-900">{row.customer}</p>
                <p className="tabular text-[11px] text-navy-500">
                    {row.code} · ينتهي {formatDate(row.ends_on)}
                    {row.value > 0 && ` · ${formatMoney(row.value)}`}
                </p>
            </div>

            <span className={clsx('badge shrink-0', daysChip(row.days_remaining))}>
                {row.days_remaining >= 0
                    ? `باقٍ ${row.days_remaining} يوم`
                    : `انتهى منذ ${Math.abs(row.days_remaining)} يوم`}
            </span>
        </div>
    )
}

import clsx from 'clsx'
import { useState } from 'react'
import { Field, Select, SkeletonCard } from '@/components/ui'
import { CLAIM_STATUS, formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useWarrantyReport } from '@/lib/queries'
import { daysChip, Empty, Figure, Section } from '@/pages/reports/parts'
import type { ClaimStatus } from '@/types'

const WINDOWS = [30, 60, 90, 180]

export function WarrantyReportPage() {
    const [days, setDays] = useState(60)
    const { data, isLoading } = useWarrantyReport(days)

    if (isLoading || !data) return <SkeletonCard />

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="تغطية سارية" value={String(data.active_cover)} tone="brand" />
                <Figure
                    label="بلاغات مفتوحة"
                    value={String(data.claims_open)}
                    tone={data.claims_open > 0 ? 'warn' : undefined}
                    hint={`${data.claims_total} بلاغًا إجمالًا`}
                />
                <Figure
                    label="إصلاح واستبدال"
                    value={`${data.repairs} / ${data.replacements}`}
                />
                <Figure
                    label="تكلفة أعمال الضمان"
                    value={formatMoney(data.repair_cost)}
                    tone="down"
                    hint="قطع صُرفت ولم تُفوتر"
                />
            </div>

            <section className="card mt-4 p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-navy-800">ضمانات قاربت على الانتهاء</h2>
                        <p className="mt-0.5 text-[11px] text-navy-400">
                            فرصة بيع تمديد قبل أن يشعر العميل بأنه بلا تغطية.
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
                    <Empty>لا توجد ضمانات تنتهي خلال {days} يومًا.</Empty>
                ) : (
                    <div className="space-y-2">
                        {data.expiring.map((row) => (
                            <div
                                key={row.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-navy-900">
                                        {row.asset_code} · {row.asset}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-500">
                                        {row.customer} · {row.kind_label} · ينتهي{' '}
                                        {formatDate(row.ends_on)}
                                    </p>
                                </div>

                                <span className={clsx('badge shrink-0', daysChip(row.days_remaining))}>
                                    باقٍ {row.days_remaining} يوم
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <Section title="البلاغات حسب الحالة" count={data.claims_total}>
                {data.by_status.length === 0 ? (
                    <Empty>لا توجد بلاغات ضمان.</Empty>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {data.by_status.map((row) => (
                            <span
                                key={row.status}
                                className={clsx(
                                    'badge',
                                    CLAIM_STATUS[row.status as ClaimStatus]?.chip ??
                                        'bg-navy-100 text-navy-600',
                                )}
                            >
                                {row.label} · {row.count}
                            </span>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="الموديلات الأكثر تعطلًا" count={data.by_model.length}>
                {data.by_model.length === 0 ? (
                    <Empty>لا توجد بلاغات بعد.</Empty>
                ) : (
                    <div className="space-y-2">
                        {/* A model claimed against more than once is either a bad
                            batch or a bad fit for the site it was put in. */}
                        {data.by_model.map((row) => (
                            <div
                                key={row.model}
                                className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 p-3"
                            >
                                <span className="truncate text-sm font-semibold text-navy-800">
                                    {row.model}
                                </span>
                                <span
                                    className={clsx(
                                        'tabular shrink-0 text-sm font-extrabold',
                                        row.claims > 1 ? 'text-red-700' : 'text-navy-600',
                                    )}
                                >
                                    {row.claims} بلاغ
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </>
    )
}

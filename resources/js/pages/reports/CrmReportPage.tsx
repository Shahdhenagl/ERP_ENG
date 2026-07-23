import { SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { useCrmReport } from '@/lib/queries'
import { Empty, Figure, Ranked, Section } from '@/pages/reports/parts'
import { useReports } from '@/pages/reports/ReportsLayout'

/**
 * The pipeline as numbers: what is in play and worth, how deals closed over the
 * period, and which sources are worth the effort.
 *
 * The open pipeline is a snapshot — its value is whatever is live now. Won,
 * lost and the win rate are read through the period picker, because a
 * conversion rate only means anything across a stretch of time.
 */
export function CrmReportPage() {
    const { period } = useReports()
    const { data, isLoading } = useCrmReport(period.range)

    if (isLoading || !data) return <SkeletonCard />

    const decided = data.won + data.lost

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure
                    label="خط الأنابيب المفتوح"
                    value={formatMoney(data.open_value)}
                    tone="brand"
                    hint={`${data.open_count} عميل محتمل`}
                />
                <Figure
                    label="نسبة الكسب"
                    value={data.win_rate === null ? '—' : `${data.win_rate}%`}
                    tone={data.win_rate !== null && data.win_rate >= 50 ? 'up' : undefined}
                    hint={decided > 0 ? `من ${decided} صفقة محسومة` : 'لا صفقات محسومة بعد'}
                />
                <Figure
                    label="مكسوب في الفترة"
                    value={formatMoney(data.won_value)}
                    tone="up"
                    hint={`${data.won} مكسوب · ${data.lost} خاسر`}
                />
                <Figure
                    label="متابعات متأخّرة"
                    value={String(data.follow_ups_overdue)}
                    tone={data.follow_ups_overdue > 0 ? 'warn' : undefined}
                    hint={`${data.follow_ups_open} متابعة مفتوحة`}
                />
            </div>

            <Section title="خط الأنابيب حسب المرحلة" count={data.open_count}>
                {data.open_count === 0 ? (
                    <Empty>لا يوجد عملاء محتملون في خط الأنابيب.</Empty>
                ) : (
                    <Ranked
                        rows={data.pipeline.map((stage) => ({
                            key: stage.status,
                            label: stage.label,
                            note: `${stage.count} عميل`,
                            value: stage.value,
                        }))}
                    />
                )}
            </Section>

            <Section title="الفعالية حسب المصدر" count={data.by_source.length}>
                {data.by_source.length === 0 ? (
                    <Empty>لا توجد بيانات مصادر بعد.</Empty>
                ) : (
                    <div className="space-y-2">
                        {/* Sorted by volume, but the number that matters is the
                            conversion: a source with few leads that nearly all
                            convert is worth more than a flood that never does. */}
                        {data.by_source.map((row) => (
                            <div
                                key={row.source ?? 'other'}
                                className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-navy-800">
                                        {row.label ?? 'أخرى'}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {row.total} عميل · {row.won} مكسوب
                                    </p>
                                </div>
                                <span
                                    className={
                                        'tabular shrink-0 text-sm font-extrabold ' +
                                        (row.conversion_pct >= 50
                                            ? 'text-emerald-700'
                                            : row.conversion_pct > 0
                                              ? 'text-navy-700'
                                              : 'text-navy-400')
                                    }
                                >
                                    {row.conversion_pct}%
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </>
    )
}

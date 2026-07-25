import { SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { useMaintenanceReport } from '@/lib/queries'
import { Empty, Figure, Ranked, Section } from '@/pages/reports/parts'
import { useReports } from '@/pages/reports/ReportsLayout'

/**
 * The service side: work orders and how they close, the planned-maintenance
 * visits and whether they land on time, and what honouring the warranties cost.
 *
 * The warranty figures are read from the warranty report so the two can never
 * put a different number on the same repair.
 */
export function MaintenanceReportPage() {
    const { period } = useReports()
    const { data, isLoading } = useMaintenanceReport(period.range)

    if (isLoading || !data) return <SkeletonCard />

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="أوامر عمل مفتوحة" value={String(data.tasks.open)} tone="brand" />
                <Figure
                    label="متأخرة عن الوقت"
                    value={String(data.tasks.sla_breaches)}
                    tone={data.tasks.sla_breaches > 0 ? 'down' : 'up'}
                />
                <Figure label="أُنجزت بالفترة" value={String(data.tasks.completed_in_window)} tone="up" />
                <Figure
                    label="زيارات صيانة متأخرة"
                    value={String(data.ppm.visits_overdue)}
                    tone={data.ppm.visits_overdue > 0 ? 'warn' : 'up'}
                    hint={`${data.ppm.visits_upcoming} قادمة خلال ٣٠ يوم`}
                />
            </div>

            <Section title="أوامر العمل حسب الحالة" count={data.tasks.total}>
                {data.tasks.by_status.length ? (
                    <Ranked
                        rows={data.tasks.by_status.map((row) => ({
                            key: row.status,
                            label: row.label,
                            value: row.count,
                        }))}
                    />
                ) : (
                    <Empty>لا أوامر عمل بعد.</Empty>
                )}
            </Section>

            <Section title="الصيانة الوقائية (PPM)">
                <div className="grid grid-cols-3 gap-3 text-center">
                    <Tile label="تمت بالفترة" value={String(data.ppm.visits_done)} />
                    <Tile label="متأخرة" value={String(data.ppm.visits_overdue)} />
                    <Tile label="قادمة (٣٠ يوم)" value={String(data.ppm.visits_upcoming)} />
                </div>
            </Section>

            <Section title="الضمانات">
                <div className="grid grid-cols-2 gap-3 text-center lg:grid-cols-4">
                    <Tile label="مطالبات مفتوحة" value={String(data.warranty.claims_open)} />
                    <Tile label="إصلاحات" value={String(data.warranty.repairs)} />
                    <Tile label="استبدالات" value={String(data.warranty.replacements)} />
                    <Tile label="تكلفة الإصلاح" value={formatMoney(data.warranty.repair_cost)} />
                </div>

                {data.warranty.by_model.length > 0 && (
                    <div className="mt-4">
                        <p className="mb-2 text-[11px] font-bold text-navy-400">الأكثر تكرارًا في المطالبات</p>
                        <Ranked
                            tone="down"
                            rows={data.warranty.by_model.map((row) => ({
                                key: row.model,
                                label: row.model,
                                value: row.claims,
                            }))}
                        />
                    </div>
                )}
            </Section>
        </>
    )
}

function Tile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-navy-50 p-3">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p className="tabular mt-1 text-sm font-extrabold text-navy-900">{value}</p>
        </div>
    )
}

import { SkeletonCard } from '@/components/ui'
import { formatMoney, formatQty } from '@/lib/domain'
import { useCustodyReport } from '@/lib/queries'
import { Empty, Figure, Section } from '@/pages/reports/parts'

/**
 * What every technician is answerable for, in one place.
 *
 * The practical use is clearance: nobody leaves with an open figure on this
 * page, in any of the three kinds.
 */
export function CustodyReportPage() {
    const { data, isLoading } = useCustodyReport()

    if (isLoading || !data) return <SkeletonCard />

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="نقدية بعهدة الفنيين" value={formatMoney(data.cash_total)} tone="warn" />
                <Figure label="قيمة القطع" value={formatMoney(data.stock_total)} />
                <Figure label="أجهزة بالعهدة" value={String(data.devices_total)} />
                <Figure label="إجمالي العهد" value={formatMoney(data.total_value)} tone="brand" />
            </div>

            <Section title="حسب الفني" count={data.technicians.length}>
                {data.technicians.length === 0 ? (
                    <Empty>لا يوجد فنيون نشطون.</Empty>
                ) : (
                    <div className="space-y-3">
                        {data.technicians.map((row) => (
                            <div key={row.technician.id} className="rounded-xl bg-navy-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-navy-900">
                                            {row.technician.name}
                                        </p>
                                        {row.technician.job_title && (
                                            <p className="text-[11px] text-navy-400">
                                                {row.technician.job_title}
                                            </p>
                                        )}
                                    </div>

                                    <span className="tabular shrink-0 font-extrabold text-navy-900">
                                        {formatMoney(row.total_value)}
                                    </span>
                                </div>

                                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                    <span className="rounded-lg bg-white px-2.5 py-1 font-bold text-amber-700">
                                        نقدية {formatMoney(row.cash.balance)}
                                    </span>
                                    <span className="rounded-lg bg-white px-2.5 py-1 font-bold text-navy-600">
                                        قطع {formatMoney(row.stock.value)}
                                    </span>
                                    <span className="rounded-lg bg-white px-2.5 py-1 font-bold text-navy-600">
                                        {row.devices.length} جهاز
                                    </span>
                                </div>

                                {row.stock.lines.length > 0 && (
                                    <ul className="mt-2 space-y-0.5">
                                        {row.stock.lines.map((line) => (
                                            <li
                                                key={line.item_id}
                                                className="tabular text-[11px] text-navy-500"
                                            >
                                                {line.name} — {formatQty(line.qty)} {line.unit}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {row.devices.length > 0 && (
                                    <ul className="mt-2 space-y-0.5">
                                        {row.devices.map((device) => (
                                            <li key={device.id} className="text-[11px] text-navy-500">
                                                {device.asset}
                                                {device.serial && ` · ${device.serial}`} —{' '}
                                                {device.reason_label}
                                                {device.days_held > 0 &&
                                                    ` منذ ${device.days_held} يومًا`}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </>
    )
}

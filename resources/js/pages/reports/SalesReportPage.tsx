import { SkeletonCard } from '@/components/ui'
import { formatMoney, formatQty } from '@/lib/domain'
import { useSalesReport } from '@/lib/queries'
import { Empty, Figure, Ranked, Section } from '@/pages/reports/parts'
import { useReports } from '@/pages/reports/ReportsLayout'

export function SalesReportPage() {
    const { period } = useReports()
    const { data, isLoading } = useSalesReport(period.range)

    if (isLoading || !data) return <SkeletonCard />

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="إجمالي المبيعات" value={formatMoney(data.total)} tone="brand" />
                <Figure
                    label="عدد الفواتير"
                    value={String(data.invoices)}
                    hint={`متوسط الفاتورة ${formatMoney(data.average_invoice)}`}
                />
                <Figure label="المُحصَّل" value={formatMoney(data.collected)} tone="up" />
                <Figure
                    label="المتبقي على العملاء"
                    value={formatMoney(data.outstanding)}
                    tone={data.outstanding > 0 ? 'warn' : undefined}
                />
            </div>

            {(data.discount > 0 || data.tax > 0) && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                    <Figure
                        label="الخصومات الممنوحة"
                        value={formatMoney(data.discount)}
                        tone="down"
                    />
                    <Figure label="ضريبة القيمة المضافة" value={formatMoney(data.tax)} />
                </div>
            )}

            <Section title="أكبر العملاء" count={data.by_customer.length}>
                {data.by_customer.length === 0 ? (
                    <Empty>لا توجد فواتير صادرة في هذه الفترة.</Empty>
                ) : (
                    <Ranked
                        rows={data.by_customer.map((row) => ({
                            key: row.id,
                            label: row.name,
                            note: `${row.invoices} فاتورة`,
                            value: row.total,
                        }))}
                    />
                )}
            </Section>

            <Section title="أكثر البنود مبيعًا" count={data.by_item.length}>
                {data.by_item.length === 0 ? (
                    <Empty>لا توجد بنود في هذه الفترة.</Empty>
                ) : (
                    <Ranked
                        tone="up"
                        rows={data.by_item.map((row, index) => ({
                            key: row.item_id ?? `line-${index}`,
                            label: row.name,
                            note: formatQty(row.qty),
                            value: row.total,
                        }))}
                    />
                )}
            </Section>
        </>
    )
}

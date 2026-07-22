import { SkeletonCard } from '@/components/ui'
import { useIncomeStatement } from '@/lib/queries'
import { useAccounting } from '@/pages/accounting/AccountingLayout'
import { BottomLine, StatementBlock } from '@/pages/accounting/StatementBlock'

/**
 * Revenue, what it cost to deliver, and what running the place cost on top.
 *
 * Cost of sales is kept apart from operating expense so gross profit is a real
 * figure on the page rather than something the reader has to assemble.
 */
export function IncomeStatementPage() {
    const { period } = useAccounting()
    const { data, isLoading } = useIncomeStatement(period.range)

    if (isLoading && !data) return <SkeletonCard />
    if (!data) return null

    return (
        <div className="space-y-4">
            <StatementBlock
                title="الإيرادات"
                groups={data.revenue}
                total={data.revenue_total}
                tone="up"
            />

            <StatementBlock
                title="تكلفة المبيعات"
                groups={data.cost_of_sales}
                total={data.cost_of_sales_total}
                tone="down"
            />

            <BottomLine label="مجمل الربح" value={data.gross_profit} />

            <StatementBlock
                title="المصروفات التشغيلية"
                groups={data.expenses}
                total={data.expenses_total}
                tone="down"
            />

            <BottomLine
                label={data.net_profit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
                value={data.net_profit}
            />
        </div>
    )
}

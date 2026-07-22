import clsx from 'clsx'
import { SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useBalanceSheet } from '@/lib/queries'
import { useAccounting } from '@/pages/accounting/AccountingLayout'
import { StatementBlock } from '@/pages/accounting/StatementBlock'

/**
 * What the company owns and owes on a date.
 *
 * Read as at the end of the chosen period, not across it — a balance sheet is a
 * photograph, so only the closing date of the period applies. The year's profit
 * is folded into equity as it is earned rather than by a closing entry someone
 * has to remember to run.
 */
export function BalanceSheetPage() {
    const { period } = useAccounting()
    const { data, isLoading } = useBalanceSheet({ as_of: period.range.to })

    if (isLoading && !data) return <SkeletonCard />
    if (!data) return null

    const balanced = Math.abs(data.difference) < 0.005

    return (
        <div className="space-y-4">
            <div
                className={clsx(
                    'flex flex-wrap items-center justify-between gap-2 rounded-2xl p-4',
                    balanced
                        ? 'bg-emerald-50 ring-1 ring-emerald-200'
                        : 'bg-red-50 ring-1 ring-red-200',
                )}
            >
                <span className="text-sm font-bold text-navy-700">
                    {balanced ? 'الميزانية متوازنة' : 'الميزانية غير متوازنة'}
                    <span className="mr-2 text-[11px] font-semibold text-navy-400">
                        كما في {data.as_of ? formatDate(data.as_of) : 'اليوم'}
                    </span>
                </span>
                <span
                    className={clsx(
                        'tabular text-lg font-extrabold',
                        balanced ? 'text-emerald-700' : 'text-red-700',
                    )}
                >
                    {balanced
                        ? formatMoney(data.assets_total)
                        : `فرق ${formatMoney(data.difference)}`}
                </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <StatementBlock title="الأصول" groups={data.assets} total={data.assets_total} />

                <div className="space-y-4">
                    <StatementBlock
                        title="الخصوم"
                        groups={data.liabilities}
                        total={data.liabilities_total}
                    />

                    <StatementBlock
                        title="حقوق الملكية"
                        groups={data.equity}
                        total={data.equity_total - data.retained_earnings}
                    />

                    {/* Shown on its own line rather than merged into equity:
                        profit the year has earned and nobody has moved is
                        exactly the figure an owner looks for. */}
                    <div className="card flex items-center justify-between p-4">
                        <span className="text-[13px] font-bold text-navy-700">
                            أرباح الفترة غير الموزَّعة
                        </span>
                        <span
                            className={clsx(
                                'tabular text-sm font-extrabold',
                                data.retained_earnings < 0 ? 'text-red-700' : 'text-emerald-700',
                            )}
                        >
                            {formatMoney(data.retained_earnings)}
                        </span>
                    </div>

                    <div className="card flex items-center justify-between bg-navy-50/60 p-4">
                        <span className="text-[13px] font-extrabold text-navy-900">
                            إجمالي الخصوم وحقوق الملكية
                        </span>
                        <span className="tabular text-sm font-extrabold text-navy-900">
                            {formatMoney(data.liabilities_and_equity_total)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

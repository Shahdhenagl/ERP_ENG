import clsx from 'clsx'
import { formatMoney } from '@/lib/domain'
import type { StatementGroup } from '@/types'

/**
 * One block of a financial statement: a heading, the accounts under it, and
 * their total.
 *
 * Shared by the income statement and the balance sheet because they are the
 * same shape read at different angles — a section of the chart, summed. Keeping
 * one component means the two can never drift into disagreeing about how a
 * negative figure or an empty section should look.
 */
export function StatementBlock({
    title,
    groups,
    total,
    tone = 'neutral',
}: {
    title: string
    groups: StatementGroup[]
    total: number
    tone?: 'up' | 'down' | 'neutral'
}) {
    const totalColour = {
        up: 'text-emerald-700',
        down: 'text-red-700',
        neutral: 'text-navy-900',
    }[tone]

    return (
        <section className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-navy-100 bg-navy-50/60 px-4 py-3">
                <h2 className="text-sm font-extrabold text-navy-900">{title}</h2>
                <span className={clsx('tabular text-sm font-extrabold', totalColour)}>
                    {formatMoney(total)}
                </span>
            </header>

            {groups.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-navy-400">
                    لا توجد أرصدة في هذا القسم.
                </p>
            ) : (
                <div className="divide-y divide-navy-100">
                    {groups.map((group) => (
                        <div key={group.key} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="truncate text-[13px] font-bold text-navy-700">
                                    {group.name}
                                </span>
                                <span className="tabular shrink-0 text-[13px] font-bold text-navy-800">
                                    {formatMoney(group.total)}
                                </span>
                            </div>

                            {/* The accounts stay visible rather than collapsing:
                                the heading alone rarely answers the question
                                someone opened the statement to ask. */}
                            <div className="mt-1.5 space-y-1 border-r border-navy-100 pr-3">
                                {group.accounts.map((account) => (
                                    <div
                                        key={account.id}
                                        className="flex items-center justify-between gap-3 text-xs"
                                    >
                                        <span className="truncate text-navy-500">
                                            <span className="tabular ml-1.5 text-navy-300">
                                                {account.code}
                                            </span>
                                            {account.name}
                                        </span>
                                        <span
                                            className={clsx(
                                                'tabular shrink-0',
                                                account.total < 0
                                                    ? 'text-red-600'
                                                    : 'text-navy-700',
                                            )}
                                        >
                                            {formatMoney(account.total)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}

/** A statement's bottom line, stated rather than left to be worked out. */
export function BottomLine({
    label,
    value,
    good,
}: {
    label: string
    value: number
    good?: boolean
}) {
    const positive = good ?? value >= 0

    return (
        <div
            className={clsx(
                'flex items-center justify-between rounded-2xl p-4',
                positive ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-red-50 ring-1 ring-red-200',
            )}
        >
            <span className="text-sm font-bold text-navy-700">{label}</span>
            <span
                className={clsx(
                    'tabular text-xl font-extrabold',
                    positive ? 'text-emerald-700' : 'text-red-700',
                )}
            >
                {formatMoney(value)}
            </span>
        </div>
    )
}

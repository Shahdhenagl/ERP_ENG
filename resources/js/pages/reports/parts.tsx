import clsx from 'clsx'
import type { ReactNode } from 'react'
import { formatMoney } from '@/lib/domain'

/** The headline figures every report opens with. */
export function Figure({
    label,
    value,
    tone,
    hint,
}: {
    label: string
    value: string
    tone?: 'up' | 'down' | 'brand' | 'warn'
    hint?: string
}) {
    const colour = tone
        ? {
              up: 'text-emerald-700',
              down: 'text-red-700',
              brand: 'text-brand-700',
              warn: 'text-amber-600',
          }[tone]
        : 'text-navy-900'

    return (
        <div className="card p-4">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p className={clsx('tabular mt-1 text-lg font-extrabold', colour)}>{value}</p>
            {hint && <p className="mt-0.5 text-[10px] text-navy-400">{hint}</p>}
        </div>
    )
}

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
    return (
        <section className="card mt-4 p-4">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-navy-800">{title}</h2>
                {count !== undefined && (
                    <span className="tabular text-[11px] font-semibold text-navy-400">{count}</span>
                )}
            </div>
            {children}
        </section>
    )
}

export function Empty({ children }: { children: ReactNode }) {
    return <p className="rounded-xl bg-navy-50 p-4 text-center text-sm text-navy-400">{children}</p>
}

/**
 * A ranked list with a proportion bar — the shape most of these reports take.
 *
 * The bar is relative to the biggest row rather than to the total, because the
 * question being asked is "which of these is the big one", and shares of a
 * total render every row invisible once there are twenty of them.
 */
export function Ranked({
    rows,
    tone = 'brand',
}: {
    rows: Array<{ key: string | number; label: string; note?: string; value: number }>
    tone?: 'brand' | 'up' | 'down'
}) {
    const top = Math.max(...rows.map((row) => Math.abs(row.value)), 1)

    const bar = { brand: 'bg-brand-500', up: 'bg-emerald-500', down: 'bg-red-500' }[tone]

    return (
        <div className="space-y-2.5">
            {rows.map((row) => (
                <div key={row.key}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-navy-700">
                            {row.label}
                            {row.note && (
                                <span className="tabular mr-1.5 text-[11px] text-navy-400">
                                    {row.note}
                                </span>
                            )}
                        </span>
                        <span className="tabular shrink-0 font-bold text-navy-900">
                            {formatMoney(row.value)}
                        </span>
                    </div>

                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-navy-100">
                        <div
                            className={clsx('h-full rounded-full', bar)}
                            style={{ width: `${(Math.abs(row.value) / top) * 100}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}

/** Amber as a term runs down, red once it has gone. */
export function daysChip(days: number): string {
    if (days < 0) return 'bg-red-50 text-red-700 ring-1 ring-red-200'
    if (days <= 30) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'

    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
}

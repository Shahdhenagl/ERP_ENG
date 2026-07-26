import clsx from 'clsx'

const TONES = {
    brand: 'text-brand-700',
    up: 'text-emerald-700',
    down: 'text-red-700',
    warn: 'text-amber-600',
    slate: 'text-navy-800',
} as const

export interface StatItem {
    label: string
    value: number | string
    tone?: keyof typeof TONES
}

/**
 * A module's headline figures above its list — three or four numbers that say
 * how the module stands before you read a single row. Purely presentational;
 * the numbers come from the list endpoint's own summary.
 */
export function StatStrip({ items }: { items: StatItem[] }) {
    if (items.length === 0) return null

    return (
        <div className={clsx('mb-4 grid gap-3', GRID[items.length] ?? 'grid-cols-2 lg:grid-cols-4')}>
            {items.map((item) => (
                <div key={item.label} className="card px-4 py-3">
                    <p className="text-[11px] font-bold text-navy-400">{item.label}</p>
                    <p className={clsx('tabular mt-0.5 text-xl font-extrabold', TONES[item.tone ?? 'slate'])}>
                        {item.value}
                    </p>
                </div>
            ))}
        </div>
    )
}

const GRID: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
}

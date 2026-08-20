import clsx from 'clsx'
import { useT } from '@/lib/i18n'
import { LayoutGrid, Rows3 } from 'lucide-react'
import { useState } from 'react'

export type ViewMode = 'cards' | 'table'

/**
 * Cards or a table, remembered per list.
 *
 * The two answer different questions: a card carries enough of a record to
 * judge it on its own, a table is for scanning fifty at once and comparing one
 * column down the page. Which one a person wants depends on the list and on
 * the day, so it is a choice rather than a decision taken for them — and it is
 * kept, because re-picking it on every visit is the same as not offering it.
 *
 * `key` scopes the memory to one list: choosing a table for invoices should not
 * turn the customers into one.
 */
export function useViewMode(key: string, fallback: ViewMode = 'cards') {
    const storageKey = `view.${key}`

    const [view, setView] = useState<ViewMode>(
        () => (localStorage.getItem(storageKey) as ViewMode | null) ?? fallback,
    )

    return [
        view,
        (mode: ViewMode) => {
            localStorage.setItem(storageKey, mode)
            setView(mode)
        },
    ] as const
}

export function ViewToggle({
    view,
    onChange,
    className,
}: {
    view: ViewMode
    onChange: (mode: ViewMode) => void
    className?: string
}) {
    return (
        <div className={clsx('flex items-center gap-1 rounded-xl bg-navy-100 p-1', className)}>
            {(
                [
                    ['cards', 'كروت', LayoutGrid],
                    ['table', 'جدول', Rows3],
                ] as Array<[ViewMode, string, typeof LayoutGrid]>
            ).map(([mode, label, Icon]) => (
                <button
                    key={mode}
                    type="button"
                    onClick={() => onChange(mode)}
                    className={clsx(
                        'tap flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition',
                        view === mode ? 'bg-surface text-navy-900 shadow-sm' : 'text-navy-500',
                    )}
                >
                    <Icon className="size-3.5" />
                    {label}
                </button>
            ))}
        </div>
    )
}

/**
 * The frame every table view sits in: scrolls inside itself so eight columns
 * never widen the page and take the sidebar with them.
 */
export function DataTable({
    headers,
    minWidth = '52rem',
    children,
    lead,
    className,
    tableClassName,
}: {
    headers: Array<string | { label: string; className?: string }>
    minWidth?: string
    children: React.ReactNode
    /** Rendered as a first column — the select-all box, when a list has one. */
    lead?: React.ReactNode
    className?: string
    tableClassName?: string
}) {
    const t = useT()

    return (
        <div className={clsx('card overflow-x-auto', className)}>
            <table className={clsx('w-full text-start text-sm', tableClassName)} style={{ minWidth }}>
                <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                    <tr>
                        {lead !== undefined && <th className="w-10 px-3 py-2.5">{lead}</th>}
                        {headers.map((header, index) => {
                            const isText = typeof header === 'string'

                            return (
                                <th
                                    key={isText ? header : (header.label || String(index))}
                                    className={clsx('px-3 py-2.5', !isText && header.className)}
                                >
                                    {t(isText ? header : header.label)}
                                </th>
                            )
                        })}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    )
}

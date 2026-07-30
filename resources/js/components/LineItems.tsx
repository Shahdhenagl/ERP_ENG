import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The lines of a document, as the table they are.
 *
 * They were a run of loose inputs: a select, a box, a box, a box, repeated
 * down the page with nothing saying which was which. Six lines in, the only
 * way to know that the third box is the unit price is to count. A header row
 * costs one row and answers it for every line at once.
 *
 * It scrolls inside itself rather than widening the dialog, and each line may
 * hang a full-width detail row beneath it — the device's nameplate, the stock
 * on the shelf — through `<LineDetailRow>`.
 */
export function LineItems({
    columns,
    children,
    onAdd,
    addLabel = 'إضافة بند',
    error,
}: {
    /** Header cells, in order. A width class keeps a column from collapsing. */
    columns: Array<{ label: string; className?: string }>
    children: ReactNode
    onAdd: () => void
    addLabel?: string
    error?: string
}) {
    return (
        <div className="space-y-1.5">
            <div className="overflow-x-auto rounded-2xl border border-navy-200">
                <table className="w-full min-w-[44rem] text-right text-sm">
                    <thead className="bg-navy-600 text-[11px] font-bold text-white">
                        <tr>
                            {columns.map((column) => (
                                <th key={column.label} className={`px-3 py-2.5 ${column.className ?? ''}`}>
                                    {column.label}
                                </th>
                            ))}
                            <th className="w-10 px-2 py-2.5" />
                        </tr>
                    </thead>

                    <tbody>{children}</tbody>

                    <tfoot>
                        <tr>
                            <td colSpan={columns.length + 1} className="border-t border-navy-100 p-1.5">
                                <button
                                    type="button"
                                    onClick={onAdd}
                                    className="tap flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-brand-600 transition hover:bg-brand-50"
                                >
                                    <Plus className="size-4" />
                                    {addLabel}
                                </button>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>
    )
}

/** One line's cells. */
export function LineRow({ children }: { children: ReactNode }) {
    return <tr className="border-t border-navy-100 align-top">{children}</tr>
}

/** A cell in a line. */
export function LineCell({
    children,
    className,
}: {
    children: ReactNode
    className?: string
}) {
    return <td className={`px-2 py-2 ${className ?? ''}`}>{children}</td>
}

/**
 * What the line is, under the line: the nameplate, the stock, the warning that
 * the shelf cannot cover it. Spans the table so it reads as belonging to the
 * row above rather than to a column.
 */
export function LineDetailRow({ span, children }: { span: number; children: ReactNode }) {
    return (
        <tr className="border-t border-dashed border-navy-100">
            <td colSpan={span + 1} className="bg-navy-50/50 px-3 pt-1.5 pb-2.5">
                {children}
            </td>
        </tr>
    )
}

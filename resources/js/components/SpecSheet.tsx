import clsx from 'clsx'
import type { SpecRow } from '@/lib/specs'

/**
 * A nameplate, laid out the same wherever a device is chosen or printed.
 *
 * Picking a UPS off a list means picking a rating — 10kVA three-phase is not
 * interchangeable with 10kVA single-phase — so the ratings belong beside the
 * name at the moment of choosing, not one screen away in the catalogue.
 */
export function SpecSheet({
    rows,
    title,
    subtitle,
    serial,
    empty = 'لا توجد مواصفات مسجّلة.',
    tone = 'screen',
    className,
}: {
    rows: SpecRow[]
    /** The device's name — omit when the surrounding card already says it. */
    title?: string
    subtitle?: string | null
    serial?: string | null
    empty?: string | null
    /** `print` drops the fill and tightens the type for paper. */
    tone?: 'screen' | 'print'
    className?: string
}) {
    const printed = tone === 'print'

    if (rows.length === 0 && !title && !empty) return null

    return (
        <div
            className={clsx(
                printed
                    ? 'doc-keep rounded-lg border border-navy-200 p-3'
                    : 'rounded-xl bg-navy-50 p-2.5',
                className,
            )}
        >
            {(title || serial) && (
                <div
                    className={clsx(
                        'flex flex-wrap items-baseline justify-between gap-2',
                        printed && 'border-b border-navy-100 pb-2',
                    )}
                >
                    <span className={clsx('font-bold text-navy-800', printed ? 'text-[13px]' : 'text-xs')}>
                        {title}
                        {subtitle && (
                            <span className="mr-1.5 text-[11px] font-normal text-navy-500">
                                {subtitle}
                            </span>
                        )}
                    </span>
                    {serial && (
                        <span className="tabular text-[11px] text-navy-500">{serial}</span>
                    )}
                </div>
            )}

            {rows.length > 0 ? (
                <div
                    className={clsx(
                        'grid gap-x-5 gap-y-1',
                        title || serial ? 'mt-2' : '',
                        printed ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2',
                    )}
                >
                    {rows.map(([label, value]) => (
                        <div
                            key={label}
                            className={clsx(
                                'flex justify-between gap-2',
                                printed ? 'text-[12px]' : 'text-[11px]',
                            )}
                        >
                            <span className="text-navy-400">{label}</span>
                            <span className="tabular font-semibold text-navy-700">{value}</span>
                        </div>
                    ))}
                </div>
            ) : (
                empty && (
                    <p className={clsx('text-[11px] text-navy-400', (title || serial) && 'mt-1.5')}>
                        {empty}
                    </p>
                )
            )}
        </div>
    )
}

/**
 * The nameplate under a line on a document.
 *
 * A grid rather than a wrapped run of text: ratings read as pairs, and pairs
 * that reflow mid-line stop being scannable at exactly the moment there are
 * enough of them to need scanning.
 */
export function SpecRowList({ rows }: { rows: SpecRow[] }) {
    if (rows.length === 0) return null

    return (
        <span className="doc-specs" aria-label="المواصفات الفنية">
            <span className="doc-specs-title">المواصفات الفنية</span>
            {rows.map(([label, value]) => (
                <span key={label} className="doc-spec">
                    <span className="doc-spec-label">{label}</span>
                    <span className="doc-spec-value tabular">{value}</span>
                </span>
            ))}
        </span>
    )
}

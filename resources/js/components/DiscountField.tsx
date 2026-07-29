import clsx from 'clsx'
import { Field, Input } from '@/components/ui'

/**
 * A discount stated either way: a flat amount, or a rate on the subtotal.
 *
 * The two are not interchangeable once the lines change. "500 off" stays 500
 * when a line is added; "10% off" does not — and which of those was agreed is
 * a fact about the deal, not a display preference, so it is stored rather than
 * converted at entry.
 */
export function DiscountField({
    amount,
    percent,
    subtotal,
    onChange,
    error,
}: {
    amount: string
    /** Empty means the discount was entered as an amount. */
    percent: string
    subtotal: number
    onChange: (next: { amount: string; percent: string }) => void
    error?: string
}) {
    const byRate = percent !== ''
    const resolved = byRate
        ? Math.min(Math.round(subtotal * (Number(percent) || 0)) / 100, subtotal)
        : Number(amount) || 0

    return (
        <Field label="الخصم" error={error}>
            <div className="flex gap-2">
                <div className="flex shrink-0 rounded-xl bg-navy-100 p-1">
                    {(
                        [
                            ['amount', 'قيمة'],
                            ['percent', 'نسبة %'],
                        ] as Array<[string, string]>
                    ).map(([mode, label]) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() =>
                                onChange(
                                    mode === 'percent'
                                        ? { amount: '0', percent: percent || '0' }
                                        : { amount: amount || '0', percent: '' },
                                )
                            }
                            className={clsx(
                                'tap rounded-lg px-3 py-1.5 text-xs font-bold transition',
                                (mode === 'percent') === byRate
                                    ? 'bg-white text-navy-900 shadow-sm'
                                    : 'text-navy-500',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <Input
                    type="number"
                    min={0}
                    max={byRate ? 100 : undefined}
                    step="0.01"
                    value={byRate ? percent : amount}
                    onChange={(event) =>
                        onChange(
                            byRate
                                ? { amount: '0', percent: event.target.value }
                                : { amount: event.target.value, percent: '' },
                        )
                    }
                    dir="ltr"
                    className="min-w-0 flex-1 text-left"
                />
            </div>

            {/* What the rate actually comes to, so the number being agreed is
                on screen rather than worked out after saving. */}
            {byRate && Number(percent) > 0 && (
                <p className="tabular mt-1 text-[11px] text-navy-500">
                    يعادل {resolved.toFixed(2)} ج من {subtotal.toFixed(2)} ج
                </p>
            )}
        </Field>
    )
}

import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { Button, Field, Input } from '@/components/ui'

/**
 * The window a financial screen is read through.
 *
 * Presets first, dates underneath: «this month» is the question nine times in
 * ten and should not cost two date pickers to ask. A typed date wins over the
 * preset — otherwise choosing a preset would silently overwrite what was just
 * entered — and an open end is left off entirely rather than sent blank, which
 * the API's `date` rule rejects.
 */

export type Preset = 'today' | 'month' | 'quarter' | 'year' | 'all'

/**
 * A type alias rather than an interface on purpose: only an alias gets an
 * implicit index signature, and every query hook takes its params as
 * `Record<string, unknown>`.
 */
export type Range = {
    from?: string
    to?: string
}

const LABELS: Record<Preset, string> = {
    today: 'اليوم',
    month: 'هذا الشهر',
    quarter: 'هذا الربع',
    year: 'هذه السنة',
    all: 'الكل',
}

/** Built from local parts; `toISOString` shifts to UTC and can land a day out. */
function iso(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
    ).padStart(2, '0')}`
}

export function rangeFor(preset: Preset): Range {
    const now = new Date()

    switch (preset) {
        case 'today':
            return { from: iso(now), to: iso(now) }
        case 'month':
            return {
                from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
                to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
            }
        case 'quarter': {
            const firstMonth = Math.floor(now.getMonth() / 3) * 3
            return {
                from: iso(new Date(now.getFullYear(), firstMonth, 1)),
                to: iso(new Date(now.getFullYear(), firstMonth + 3, 0)),
            }
        }
        case 'year':
            return {
                from: iso(new Date(now.getFullYear(), 0, 1)),
                to: iso(new Date(now.getFullYear(), 11, 31)),
            }
        default:
            return {}
    }
}

export interface PeriodState {
    range: Range
    preset: Preset
    usingCustom: boolean
    setPreset: (preset: Preset) => void
    custom: { from: string; to: string }
    setCustom: (custom: { from: string; to: string }) => void
}

export function usePeriod(initial: Preset = 'month'): PeriodState {
    const [preset, setPresetState] = useState<Preset>(initial)
    const [custom, setCustom] = useState({ from: '', to: '' })

    const usingCustom = Boolean(custom.from || custom.to)

    const range = useMemo<Range>(
        () =>
            usingCustom
                ? { ...(custom.from && { from: custom.from }), ...(custom.to && { to: custom.to }) }
                : rangeFor(preset),
        [usingCustom, custom.from, custom.to, preset],
    )

    return {
        range,
        preset,
        usingCustom,
        custom,
        setCustom,
        setPreset: (next: Preset) => {
            setPresetState(next)
            setCustom({ from: '', to: '' })
        },
    }
}

export function PeriodPicker({
    period,
    presets = ['today', 'month', 'year', 'all'],
}: {
    period: PeriodState
    presets?: Preset[]
}) {
    const { preset, usingCustom, custom, setCustom, setPreset } = period

    return (
        <div className="mb-4 space-y-2">
            <div className="flex gap-1 rounded-xl bg-navy-100 p-1">
                {presets.map((value) => (
                    <button
                        key={value}
                        onClick={() => setPreset(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                            !usingCustom && preset === value
                                ? 'bg-white text-navy-900 shadow-sm'
                                : 'text-navy-500',
                        )}
                    >
                        {LABELS[value]}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-end gap-2">
                <Field label="من" className="min-w-36 flex-1">
                    <Input
                        type="date"
                        value={custom.from}
                        onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                    />
                </Field>
                <Field label="إلى" className="min-w-36 flex-1">
                    <Input
                        type="date"
                        value={custom.to}
                        onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                    />
                </Field>
                {usingCustom && (
                    <Button
                        variant="ghost"
                        className="mb-0.5 text-xs"
                        onClick={() => setCustom({ from: '', to: '' })}
                    >
                        إلغاء التحديد
                    </Button>
                )}
            </div>
        </div>
    )
}

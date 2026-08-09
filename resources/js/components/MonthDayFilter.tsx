import { X } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { Input } from '@/components/ui'

/** A hand-picked span, which beats both the month and the day when set. */
export interface DateRange {
    from: string
    to: string
}

export const EMPTY_RANGE: DateRange = { from: '', to: '' }

/**
 * The API date range a month/day/custom triple means.
 *
 * Most specific wins: a hand-picked span first, then a single day, then the
 * month it sits in, then no date filter at all. Half a span counts — "from
 * March onwards" is a question worth asking — so either end alone takes
 * precedence.
 */
export function monthDayRange(
    month: string,
    day: string,
    range: DateRange = EMPTY_RANGE,
): { from?: string; to?: string } {
    if (range.from || range.to) {
        return {
            ...(range.from ? { from: range.from } : {}),
            ...(range.to ? { to: range.to } : {}),
        }
    }

    if (day) return { from: day, to: day }

    if (month) {
        const [year, m] = month.split('-').map(Number)
        const last = new Date(year, m, 0).getDate()

        return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
    }

    return {}
}

/** A month, a day, and a from–to span — whichever the question needs. */
export function MonthDayFilter({
    month,
    day,
    range = EMPTY_RANGE,
    onMonth,
    onDay,
    onRange,
}: {
    month: string
    day: string
    range?: DateRange
    onMonth: (value: string) => void
    onDay: (value: string) => void
    /** Omit to leave this filter as month and day only. */
    onRange?: (value: DateRange) => void
}) {
    const dirty = Boolean(month || day || range.from || range.to)

    return (
        <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-navy-400">الشهر</span>
                <Input
                    type="month"
                    value={month}
                    onChange={(e) => onMonth(e.target.value)}
                    className="w-auto"
                />
            </label>

            <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-navy-400">اليوم</span>
                <Input
                    type="date"
                    value={day}
                    onChange={(e) => onDay(e.target.value)}
                    className="w-auto"
                />
            </label>

            {onRange && (
                <>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-navy-400">من</span>
                        <Input
                            type="date"
                            value={range.from}
                            onChange={(e) => onRange({ ...range, from: e.target.value })}
                            className="w-auto"
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-navy-400">إلى</span>
                        <Input
                            type="date"
                            value={range.to}
                            onChange={(e) => onRange({ ...range, to: e.target.value })}
                            className="w-auto"
                        />
                    </label>
                </>
            )}

            {dirty && (
                <button
                    onClick={() => {
                        onMonth('')
                        onDay('')
                        onRange?.(EMPTY_RANGE)
                    }}
                    className="tap mb-0.5 flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-navy-500 ring-1 ring-navy-200 transition hover:bg-navy-50"
                >
                    <X className="size-3.5" />
                    {tr('مسح')}
                </button>
            )}
        </div>
    )
}

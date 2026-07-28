import { X } from 'lucide-react'
import { Input } from '@/components/ui'

/**
 * The API date range a month/day pair means: a single day narrows to itself; a
 * month otherwise spans its whole length; neither means no date filter.
 */
export function monthDayRange(
    month: string,
    day: string,
): { from?: string; to?: string } {
    if (day) return { from: day, to: day }
    if (month) {
        const [year, m] = month.split('-').map(Number)
        const last = new Date(year, m, 0).getDate()
        return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
    }
    return {}
}

/** A month picker and a day picker side by side — the day wins over the month. */
export function MonthDayFilter({
    month,
    day,
    onMonth,
    onDay,
}: {
    month: string
    day: string
    onMonth: (value: string) => void
    onDay: (value: string) => void
}) {
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
            {(month || day) && (
                <button
                    onClick={() => {
                        onMonth('')
                        onDay('')
                    }}
                    className="tap mb-0.5 flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-navy-500 ring-1 ring-navy-200 transition hover:bg-navy-50"
                >
                    <X className="size-3.5" />
                    مسح
                </button>
            )}
        </div>
    )
}

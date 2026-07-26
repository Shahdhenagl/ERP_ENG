import { CalendarOff, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Input, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useAddHoliday, useDeleteHoliday, useHolidays } from '@/lib/queries'

/**
 * The official-holiday calendar. Dates marked here are days the office is
 * closed, and the maintenance planner steps its periodic visits over them the
 * same way it steps over the weekend.
 */
export function HolidaysEditor() {
    const toast = useToast()
    const { data: holidays, isLoading } = useHolidays()
    const add = useAddHoliday()
    const remove = useDeleteHoliday()

    const [date, setDate] = useState('')
    const [name, setName] = useState('')

    const submit = async () => {
        if (!date) return
        try {
            await add.mutateAsync({ date, name: name || null })
            setDate('')
            setName('')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر إضافة الإجازة.'))
        }
    }

    return (
        <section className="card p-5">
            <div className="mb-1 flex items-center gap-2">
                <CalendarOff className="size-4 text-navy-400" />
                <h2 className="text-sm font-bold text-navy-800">الإجازات الرسمية</h2>
            </div>
            <p className="mb-4 text-[11px] text-navy-400">
                لا تُجدول زيارات الصيانة الدورية في هذه الأيام (بالإضافة للجمعة والسبت).
            </p>

            {isLoading ? (
                <SkeletonCard />
            ) : (
                <>
                    <div className="space-y-2">
                        {holidays?.length ? (
                            holidays.map((holiday) => (
                                <div
                                    key={holiday.id}
                                    className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 px-3 py-2"
                                >
                                    <span className="min-w-0 text-sm font-semibold text-navy-700">
                                        <span className="tabular">{formatDate(holiday.date)}</span>
                                        {holiday.name && (
                                            <span className="mr-2 text-navy-400">— {holiday.name}</span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await remove.mutateAsync(holiday.id)
                                            } catch (caught) {
                                                toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                                            }
                                        }}
                                        className="tap grid shrink-0 place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="rounded-xl bg-navy-50 px-3 py-3 text-center text-xs text-navy-400">
                                لا توجد إجازات مسجّلة.
                            </p>
                        )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-40"
                        />
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="المناسبة (اختياري)"
                            className="flex-1"
                        />
                        <Button icon={Plus} loading={add.isPending} onClick={submit} disabled={!date}>
                            إضافة
                        </Button>
                    </div>
                </>
            )}
        </section>
    )
}

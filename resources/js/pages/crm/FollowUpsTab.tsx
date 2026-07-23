import clsx from 'clsx'
import { CalendarClock, Check } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { EmptyState, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useCompleteFollowUp, useFollowUps } from '@/lib/queries'
import { FOLLOWUP_STATUS } from '@/pages/crm/LeadFollowUps'

/** Every open follow-up across the pipeline — the day's chase list. */
export function FollowUpsTab() {
    const toast = useToast()
    const complete = useCompleteFollowUp()
    const [dueOnly, setDueOnly] = useState(false)

    const { data, isLoading } = useFollowUps({
        open: 1,
        due: dueOnly ? 1 : undefined,
        per_page: 80,
    })

    const done = async (id: number) => {
        const outcome = window.prompt('نتيجة المتابعة؟') ?? ''
        try {
            await complete.mutateAsync({ id, outcome })
            toast.success('تم إغلاق المتابعة.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر الإغلاق.'))
        }
    }

    return (
        <>
            <div className="mb-4 flex justify-start">
                <button
                    onClick={() => setDueOnly((v) => !v)}
                    className={clsx(
                        'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                        dueOnly
                            ? 'bg-red-50 text-red-700 ring-red-200'
                            : 'bg-white text-navy-500 ring-navy-200',
                    )}
                >
                    المتأخّرة فقط
                    {data?.meta.overdue ? ` (${data.meta.overdue})` : ''}
                </button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={CalendarClock}
                    title={dueOnly ? 'لا متابعات متأخّرة' : 'لا متابعات مفتوحة'}
                    description="احجز متابعة من صفحة العميل المحتمل لتظهر هنا."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((followUp) => (
                        <div
                            key={followUp.id}
                            className="card flex items-start justify-between gap-3 p-4"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-bold text-navy-900">
                                        {followUp.subject ?? '—'}
                                    </span>
                                    <span className={clsx('badge', FOLLOWUP_STATUS[followUp.status])}>
                                        {followUp.status_label}
                                    </span>
                                    <span className="badge bg-navy-100 text-navy-500">
                                        {followUp.type_label}
                                    </span>
                                </div>
                                <p className="tabular text-[11px] text-navy-400">
                                    {followUp.subject_code && `${followUp.subject_code} · `}
                                    {followUp.due_at ? formatDateTime(followUp.due_at) : ''}
                                    {followUp.owner && ` · ${followUp.owner}`}
                                </p>
                                {followUp.note && (
                                    <p className="mt-1 text-sm text-navy-600">{followUp.note}</p>
                                )}
                            </div>
                            <button
                                onClick={() => done(followUp.id)}
                                className="tap grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"
                                title="إغلاق"
                            >
                                <Check className="size-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

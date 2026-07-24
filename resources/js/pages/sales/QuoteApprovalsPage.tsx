import { BadgeCheck, ClipboardCheck, ThumbsDown } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useQuotationAction, useQuotations } from '@/lib/queries'

/**
 * The manager's sign-off queue: quotes a salesperson submitted, waiting to be
 * approved before they go to the customer. Approve clears them to send; reject
 * hands them back with a note.
 */
export function QuoteApprovalsPage() {
    const toast = useToast()
    const action = useQuotationAction()
    const { data, isLoading } = useQuotations({ pending_approval: 1, per_page: 80 })

    const decide = async (id: number, approve: boolean) => {
        if (!approve) {
            const note = window.prompt('سبب إعادة العرض للتعديل؟')
            if (!note) return
            try {
                await action.mutateAsync({ id, action: 'reject-approval', payload: { note } })
                toast.success('أُعيد العرض للتعديل.')
            } catch (caught) {
                toast.error(errorMessage(caught, 'تعذّر التنفيذ.'))
            }
            return
        }

        try {
            await action.mutateAsync({ id, action: 'approve' })
            toast.success('تم اعتماد العرض.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر الاعتماد.'))
        }
    }

    return (
        <>
            <PageHeader
                title="اعتماد عروض الأسعار"
                subtitle="قائمة انتظار الاعتماد — راجع واعتمد قبل الإرسال للعميل"
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.length ? (
                <EmptyState
                    icon={ClipboardCheck}
                    title="لا توجد عروض بانتظار الاعتماد"
                    description="العروض المقدَّمة للاعتماد من صفحة عروض الأسعار تظهر هنا."
                />
            ) : (
                <div className="space-y-2">
                    {data.map((quote) => (
                        <div key={quote.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {quote.code}
                                        </span>
                                        <span className="badge bg-amber-50 text-amber-700">
                                            بانتظار الاعتماد
                                        </span>
                                    </div>
                                    <p className="mt-1 truncate font-bold text-navy-900">
                                        {quote.customer}
                                    </p>
                                    {quote.title && (
                                        <p className="truncate text-xs text-navy-400">{quote.title}</p>
                                    )}
                                    {quote.submitted_at && (
                                        <p className="tabular text-[11px] text-navy-400">
                                            قُدّم {formatDate(quote.submitted_at)}
                                        </p>
                                    )}
                                </div>
                                <p className="tabular shrink-0 font-extrabold text-navy-900">
                                    {formatMoney(quote.total)}
                                </p>
                            </div>

                            <div className="mt-3 flex gap-2 border-t border-navy-100 pt-3">
                                <Button
                                    icon={BadgeCheck}
                                    className="text-xs"
                                    loading={action.isPending}
                                    onClick={() => decide(quote.id, true)}
                                >
                                    اعتماد
                                </Button>
                                <Button
                                    variant="secondary"
                                    icon={ThumbsDown}
                                    className="text-xs text-red-600"
                                    onClick={() => decide(quote.id, false)}
                                >
                                    إعادة للتعديل
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

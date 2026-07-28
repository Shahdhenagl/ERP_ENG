import clsx from 'clsx'
import { BadgeCheck, ClipboardCheck, Eye, ThumbsDown } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useQuotationAction, useQuotations } from '@/lib/queries'

/**
 * The manager's sign-off queue: quotes a salesperson submitted, waiting to be
 * approved before they go to the customer. Approve clears them to send; reject
 * hands them back with a note.
 */
export function QuoteApprovalsPage() {
    const toast = useToast()
    const { path } = useArea()
    const action = useQuotationAction()
    const { data, isLoading } = useQuotations({ pending_approval: 1, per_page: 80 })

    // Deep-linked from a notification: scroll to and highlight the named quote.
    const [params] = useSearchParams()
    const focusId = params.get('quote') ? Number(params.get('quote')) : null

    useEffect(() => {
        if (!focusId || !data?.length) return
        const el = document.getElementById(`quote-${focusId}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, [focusId, data])

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
                        <div
                            key={quote.id}
                            id={`quote-${quote.id}`}
                            className={clsx(
                                'card p-4 transition',
                                focusId === quote.id && 'ring-2 ring-brand-400',
                            )}
                        >
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

                            <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
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
                                <Link
                                    to={path(`/print/quotations/${quote.id}`)}
                                    target="_blank"
                                    className="btn-secondary text-xs"
                                >
                                    <Eye className="size-3.5" />
                                    معاينة العرض
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

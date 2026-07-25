import { FileClock, ScrollText } from 'lucide-react'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { formatSmart } from '@/lib/format'
import { useContractActivity } from '@/lib/queries'

/**
 * The amendment trail: what happened to every contract — created, activated,
 * planned, renewed, cancelled — and who did it, newest first. The audit log
 * narrowed to contracts and opened to whoever manages them.
 */
export function ContractHistoryPage() {
    const { data, isLoading } = useContractActivity()

    return (
        <>
            <PageHeader title="سجل تعديلات العقد" subtitle="من غيّر وماذا ومتى — عبر كل العقود" />

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.length ? (
                <EmptyState icon={ScrollText} title="لا يوجد سجل بعد" />
            ) : (
                <div className="relative space-y-2 before:absolute before:top-2 before:bottom-2 before:right-[19px] before:w-px before:bg-navy-100">
                    {data.map((entry) => (
                        <div key={entry.id} className="relative flex gap-3">
                            <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600 ring-4 ring-navy-50">
                                <FileClock className="size-4.5" />
                            </span>
                            <div className="card mb-1 flex-1 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-bold text-navy-900">
                                        {entry.verb_label}
                                    </span>
                                    {entry.contract_id && (
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            #{entry.contract_id}
                                        </span>
                                    )}
                                </div>
                                {entry.description && (
                                    <p className="mt-0.5 text-xs text-navy-600">{entry.description}</p>
                                )}
                                <p className="mt-1 text-[11px] text-navy-400">
                                    {entry.user ?? 'النظام'} · {formatSmart(entry.created_at)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

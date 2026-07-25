import clsx from 'clsx'
import { ExternalLink, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { CLAIM_STATUS } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useWarrantyClaims } from '@/lib/queries'

/**
 * The repair orders warranty claims produced — the work raised once a claim was
 * approved, with a link straight to each job. Distinct from the claims list,
 * which carries the ones still under review and the refused ones too.
 */
export function RepairOrdersPage() {
    const { path } = useArea()
    const { data, isLoading } = useWarrantyClaims({ has_repair: 1, per_page: 60 })

    return (
        <>
            <PageHeader title="أوامر الإصلاح" subtitle="أوامر العمل الناتجة عن مطالبات الضمان" />

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Wrench}
                    title="لا توجد أوامر إصلاح"
                    description="عند اعتماد مطالبة ضمان وإصدار أمر إصلاح لها، يظهر هنا."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((claim) => {
                        const state = CLAIM_STATUS[claim.status]

                        return (
                            <div key={claim.id} className="card p-3.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular text-[11px] font-bold text-brand-600">
                                                {claim.code}
                                            </span>
                                            <span className={clsx('badge', state.chip)}>
                                                {claim.status_label}
                                            </span>
                                            {claim.task_status && (
                                                <span className="badge bg-navy-100 text-navy-600">
                                                    {claim.task_status}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 truncate font-bold text-navy-900">
                                            {claim.customer ?? '—'}
                                        </p>
                                        <p className="tabular text-[11px] text-navy-400">
                                            {claim.asset_code} · {claim.asset}
                                            {claim.reported_on && ` · بلاغ ${formatDate(claim.reported_on)}`}
                                        </p>
                                        {claim.fault && (
                                            <p className="mt-0.5 truncate text-xs text-navy-500">
                                                {claim.fault}
                                            </p>
                                        )}
                                    </div>

                                    {claim.task_id && (
                                        <Link
                                            to={path(`/tasks/${claim.task_id}`)}
                                            className="tap inline-flex shrink-0 items-center gap-1 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-700"
                                        >
                                            <ExternalLink className="size-3.5" />
                                            {claim.task_code}
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </>
    )
}

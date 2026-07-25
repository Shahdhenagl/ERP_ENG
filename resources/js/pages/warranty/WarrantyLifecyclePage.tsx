import { CalendarPlus, RefreshCcw, Repeat } from 'lucide-react'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { useWarranties, useWarrantyClaims } from '@/lib/queries'

/**
 * The cover-lifecycle log: the extensions sold and the units replaced under
 * warranty, read as history. Extending and swapping happen where the warranty
 * and the claim live; this is the record of what has happened, in one place.
 */
export function WarrantyLifecyclePage() {
    const { data: extensions, isLoading: loadingExt } = useWarranties({ kind: 'extension', per_page: 50 })
    const { data: replacements, isLoading: loadingRep } = useWarrantyClaims({ status: 'replaced', per_page: 50 })

    return (
        <>
            <PageHeader title="الاستبدال والتمديد" subtitle="سجل تمديدات الضمان واستبدال الأجهزة" />

            <section className="mb-6">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-navy-400">
                    <CalendarPlus className="size-3.5" />
                    تمديدات الضمان
                </p>

                {loadingExt ? (
                    <SkeletonCard />
                ) : !extensions?.data.length ? (
                    <EmptyState icon={Repeat} title="لا توجد تمديدات" />
                ) : (
                    <div className="space-y-2">
                        {extensions.data.map((w) => (
                            <div key={w.id} className="card flex items-center gap-3 p-3.5">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600">
                                    <CalendarPlus className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-bold text-navy-900">
                                        <span className="tabular text-brand-600">{w.code}</span>
                                        {w.parent_code && (
                                            <span className="tabular mr-1.5 text-[11px] text-navy-400">
                                                تمديد لـ {w.parent_code}
                                            </span>
                                        )}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {w.asset_code} · {w.customer} · حتى {formatDate(w.ends_on)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-navy-400">
                    <RefreshCcw className="size-3.5" />
                    استبدال الأجهزة
                </p>

                {loadingRep ? (
                    <SkeletonCard />
                ) : !replacements?.data.length ? (
                    <EmptyState icon={RefreshCcw} title="لا توجد استبدالات" />
                ) : (
                    <div className="space-y-2">
                        {replacements.data.map((claim) => (
                            <div key={claim.id} className="card flex items-center gap-3 p-3.5">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-600">
                                    <RefreshCcw className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-bold text-navy-900">
                                        <span className="tabular text-brand-600">{claim.code}</span>
                                        <span className="text-navy-500"> · {claim.customer}</span>
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {claim.asset_code}
                                        {claim.replacement && (
                                            <span className="font-bold text-cyan-700"> ← {claim.replacement}</span>
                                        )}
                                        {claim.reported_on && ` · ${formatDate(claim.reported_on)}`}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </>
    )
}

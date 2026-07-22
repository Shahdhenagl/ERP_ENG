import clsx from 'clsx'
import { FileWarning, Printer, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CLAIM_STATUS, WARRANTY_STATUS } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useDeviceHistory } from '@/lib/queries'
import type { Asset } from '@/types'

/**
 * «تاريخ الجهاز» — the cover on one unit and everything claimed against it.
 *
 * Sits on the asset page rather than in the warranty module because this is
 * the question asked while standing in front of the machine: is it covered,
 * and what has already gone wrong with it.
 */
export function DeviceWarrantyBlock({ asset }: { asset: Asset }) {
    const { path } = useArea()
    const { data } = useDeviceHistory(asset.id)

    const warranties = data?.warranties ?? []
    const claims = data?.claims ?? []

    return (
        <>
            <div className="card mt-4 p-5">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-navy-400" />
                    <h2 className="text-sm font-bold text-navy-900">الضمان</h2>

                    {data?.cover ? (
                        <span
                            className={clsx(
                                'badge mr-auto',
                                WARRANTY_STATUS[data.cover.effective_status].chip,
                            )}
                        >
                            {WARRANTY_STATUS[data.cover.effective_status].label} · باقٍ{' '}
                            {data.cover.days_remaining} يوم
                        </span>
                    ) : (
                        <span className="badge mr-auto bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                            بدون تغطية سارية
                        </span>
                    )}
                </div>

                {warranties.length === 0 ? (
                    <p className="mt-3 text-sm text-navy-500">
                        {asset.warranty_ends_at
                            ? `لا توجد شهادة ضمان مسجّلة. التغطية محسوبة من تاريخ البيع حتى ${formatDate(asset.warranty_ends_at)}.`
                            : 'لا توجد شهادة ضمان مسجّلة لهذا الجهاز.'}
                    </p>
                ) : (
                    <div className="mt-4 space-y-2">
                        {warranties.map((warranty) => {
                            const state = WARRANTY_STATUS[warranty.effective_status]

                            return (
                                <div
                                    key={warranty.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-navy-50 p-3"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular text-sm font-bold text-navy-900">
                                                {warranty.code}
                                            </span>
                                            <span className={clsx('badge', state.chip)}>
                                                {state.label}
                                            </span>
                                        </div>
                                        <p className="tabular mt-0.5 text-[11px] text-navy-400">
                                            {formatDate(warranty.starts_on)} —{' '}
                                            {formatDate(warranty.ends_on)} · {warranty.kind_label} ·{' '}
                                            {warranty.covers_label}
                                        </p>
                                    </div>

                                    <Link
                                        to={path(`/print/warranty/${warranty.id}`)}
                                        target="_blank"
                                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-navy-700"
                                    >
                                        <Printer className="size-3.5" />
                                        شهادة
                                    </Link>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {claims.length > 0 && (
                <div className="card mt-4 p-5">
                    <div className="flex items-center gap-2">
                        <FileWarning className="size-4 text-navy-400" />
                        <h2 className="text-sm font-bold text-navy-900">مطالبات الضمان</h2>
                        <span className="mr-auto text-[11px] font-semibold text-navy-400">
                            {data?.summary.repairs} إصلاح · {data?.summary.replacements} استبدال
                        </span>
                    </div>

                    <div className="mt-4 space-y-2">
                        {claims.map((claim) => (
                            <div key={claim.id} className="rounded-xl bg-navy-50 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="tabular text-sm font-bold text-navy-900">
                                        {claim.code}
                                    </span>
                                    <span className={clsx('badge', CLAIM_STATUS[claim.status].chip)}>
                                        {CLAIM_STATUS[claim.status].label}
                                    </span>
                                    <span className="tabular text-[11px] text-navy-400">
                                        {formatDate(claim.reported_on)}
                                    </span>

                                    {claim.task_code && (
                                        <Link
                                            to={path(`/tasks/${claim.task_id}`)}
                                            className="tap mr-auto rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700"
                                        >
                                            {claim.task_code}
                                        </Link>
                                    )}
                                </div>

                                <p className="mt-1.5 text-sm text-navy-600">{claim.fault}</p>

                                {claim.decision_note && (
                                    <p className="mt-1 text-[11px] text-navy-400">
                                        {claim.decision_note}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

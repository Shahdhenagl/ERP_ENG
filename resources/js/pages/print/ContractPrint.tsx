import { useParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentTotals } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { assetSpecRows } from '@/lib/specs'
import { formatDate } from '@/lib/format'
import { useContract } from '@/lib/queries'
import type { Asset } from '@/types'

/** One covered unit and its nameplate — printed flat, or under its branch. */
function DeviceCard({ asset }: { asset: Asset }) {
    const specs = assetSpecRows(asset)

    return (
        <div className="doc-keep rounded-lg border border-navy-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-navy-100 pb-2">
                <span className="text-[13px] font-bold text-navy-800">
                    {asset.label}
                    {(asset.brand || asset.model) && (
                        <span className="mr-1.5 text-[11px] font-normal text-navy-500">
                            {[asset.brand, asset.model].filter(Boolean).join(' ')}
                        </span>
                    )}
                </span>
                <span className="tabular text-[11px] text-navy-500">
                    {asset.code}
                    {asset.serial && ` · ${asset.serial}`}
                </span>
            </div>

            {specs.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                    {specs.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-2 text-[12px]">
                            <span className="text-navy-400">{label}</span>
                            <span className="tabular font-semibold text-navy-700">{value}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-1.5 text-[11px] text-navy-400">
                    لا توجد مواصفات مسجّلة لهذا الجهاز.
                </p>
            )}
        </div>
    )
}

/**
 * The maintenance contract as a sheet: its term and coverage, the devices it
 * protects with their nameplates, the visit count, and the instalment plan —
 * what the customer signs and keeps.
 */
export function ContractPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: contract, isLoading, isError, refetch } = useContract(id)

    if (isError) return <ErrorState message="تعذّر تحميل العقد." onRetry={() => void refetch()} />
    if (isLoading || !contract) return <PageLoader />

    const assets = contract.assets ?? []
    const payments = contract.payments ?? []
    const branches = contract.branches ?? []

    // A round visits every branch, so the schedule is read site by site. Units
    // with no branch on file sit under the head office rather than vanish.
    const HEAD_OFFICE = 'المقر الرئيسي'
    const bySite = new Map<string, typeof assets>()

    for (const branch of branches) bySite.set(branch.name, [])

    for (const asset of assets) {
        const site = asset.branch ?? HEAD_OFFICE
        bySite.set(site, [...(bySite.get(site) ?? []), asset])
    }

    // Only worth splitting when there is more than one site to split across.
    const perSite = branches.length > 0

    return (
        <DocumentShell
            title={`عقد صيانة ${contract.code}`}
            subtitle={`${formatDate(contract.starts_on)} — ${formatDate(contract.ends_on)}`}
        >
            <DocumentParty
                heading="العميل"
                rows={[
                    ['الاسم', contract.customer?.name],
                    ['الكود', contract.customer?.code],
                    ['الهاتف', contract.customer?.phone],
                    ['العنوان', contract.customer?.address],
                ]}
            />

            {/* When the contract carries a written body, that is the agreement —
                printed as-is. Otherwise fall back to the structured summary. The
                device schedule and payment plan follow either way, since the
                written text rarely enumerates the covered units in full. */}
            {contract.terms ? (
                <div className="doc-body mt-5 text-[13px] leading-8 whitespace-pre-line text-navy-800">
                    {contract.terms}
                </div>
            ) : (
            <>
            <table className="doc-table mt-5">
                <tbody>
                    <tr>
                        <th className="w-40">اسم العقد</th>
                        <td>{contract.title ?? '—'}</td>
                    </tr>
                    <tr>
                        <th>عدد الزيارات</th>
                        <td>{contract.visits_per_year} زيارة سنويًا</td>
                    </tr>
                    <tr>
                        <th>طريقة التحصيل</th>
                        <td>{contract.billing_frequency_label}</td>
                    </tr>
                    <tr>
                        <th>قيمة العقد</th>
                        <td className="tabular">
                            {contract.value ? formatMoney(Number(contract.value)) : '—'}
                        </td>
                    </tr>
                    {contract.sla_response_hours && (
                        <tr>
                            <th>زمن الاستجابة</th>
                            <td>{contract.sla_response_hours} ساعة</td>
                        </tr>
                    )}
                    {contract.sla_resolution_hours && (
                        <tr>
                            <th>زمن الإنجاز</th>
                            <td>{contract.sla_resolution_hours} ساعة</td>
                        </tr>
                    )}
                </tbody>
            </table>
            </>
            )}

            {/* ── Covered sites ──────────────────────────── */}
            {perSite && (
                <>
                    <h3 className="doc-keep mt-6 mb-2 text-[13px] font-bold text-navy-700">
                        الفروع المشمولة
                    </h3>
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th className="w-10">#</th>
                                <th>الفرع</th>
                                <th>العنوان</th>
                                <th className="w-20">الأجهزة</th>
                                <th className="w-24">الزيارات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {branches.map((branch, index) => (
                                <tr key={branch.id}>
                                    <td className="tabular text-navy-500">{index + 1}</td>
                                    <td className="font-semibold text-navy-800">{branch.name}</td>
                                    <td className="text-navy-600">{branch.address ?? '—'}</td>
                                    <td className="tabular text-navy-600">
                                        {bySite.get(branch.name)?.length ?? 0}
                                    </td>
                                    <td className="tabular text-navy-600">
                                        {contract.visits_per_year} سنويًا
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="mt-2 text-[11px] text-navy-500">
                        كل زيارة دورية جولة على الفروع أعلاه — بإجمالي{' '}
                        <strong className="tabular text-navy-700">
                            {contract.jobs_per_year ?? branches.length * contract.visits_per_year}
                        </strong>{' '}
                        زيارة في السنة.
                    </p>
                </>
            )}

            {/* ── Covered devices, with the full nameplate ─── */}
            <h3 className="doc-keep mt-6 mb-2 text-[13px] font-bold text-navy-700">الأجهزة المغطاة</h3>
            {assets.length === 0 ? (
                <p className="rounded-lg bg-navy-50 p-3 text-[13px] text-navy-500">
                    يغطي العقد كل أجهزة العميل، بما فيها ما يُضاف لاحقًا.
                </p>
            ) : perSite ? (
                <div className="space-y-4">
                    {[...bySite.entries()].map(([site, units]) => (
                        <div key={site}>
                            <p className="doc-keep mb-1.5 border-r-2 border-navy-300 pr-2 text-[12px] font-bold text-navy-600">
                                {site}
                                <span className="tabular mr-1.5 font-normal text-navy-400">
                                    {units.length} جهاز
                                </span>
                            </p>

                            {units.length === 0 ? (
                                <p className="rounded-lg bg-navy-50 p-2 text-[11px] text-navy-400">
                                    لا توجد أجهزة مسجّلة على هذا الفرع.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {units.map((asset) => (
                                        <DeviceCard key={asset.id} asset={asset} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {assets.map((asset) => (
                        <DeviceCard key={asset.id} asset={asset} />
                    ))}
                </div>
            )}

            {/* ── Payment schedule ────────────────────────── */}
            {payments.length > 0 && (
                <>
                    <h3 className="doc-keep mt-6 mb-2 text-[13px] font-bold text-navy-700">
                        جدول الدفعات
                    </h3>
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th className="w-16">#</th>
                                <th>الاستحقاق</th>
                                <th className="w-28 text-left">القيمة</th>
                                <th className="w-24">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payments.map((payment) => (
                                <tr key={payment.id}>
                                    <td className="tabular text-navy-500">{payment.sequence}</td>
                                    <td className="text-navy-700">
                                        {payment.is_upfront
                                            ? 'مع اعتماد العقد'
                                            : `عند الزيارة ${payment.due_visit_sequence}`}
                                    </td>
                                    <td className="tabular text-left">{formatMoney(payment.amount)}</td>
                                    <td className="text-navy-600">{payment.status_label}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            <DocumentTotals
                rows={[
                    ['عدد الأجهزة المغطاة', String(assets.length)],
                    ...(perSite
                        ? ([
                              ['عدد الفروع المشمولة', String(branches.length)],
                              [
                                  'إجمالي الزيارات سنويًا',
                                  String(
                                      contract.jobs_per_year ??
                                          branches.length * contract.visits_per_year,
                                  ),
                              ],
                          ] as [string, string][])
                        : []),
                    ['عدد الزيارات', `${contract.visits_per_year} سنويًا`],
                ]}
                total={contract.value ? formatMoney(Number(contract.value)) : '—'}
                totalLabel="قيمة العقد"
            />
        </DocumentShell>
    )
}

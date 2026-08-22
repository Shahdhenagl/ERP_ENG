import {
    CheckCircle2,
    Clock3,
    FileSpreadsheet,
    MapPin,
    Printer,
    Search,
    X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, EmptyState, Input, SkeletonCard } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import {
    downloadPeriodicMaintenanceReport,
    useBranches,
    usePeriodicMaintenanceReport,
} from '@/lib/queries'
import type { Branch, PeriodicMaintenancePeriod, PeriodicMaintenanceRow } from '@/types'

function monthValue(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
    const date = new Date(`${month}-01T12:00:00`)

    return Number.isNaN(date.getTime())
        ? month
        : new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(date)
}

function periodTone(period: PeriodicMaintenancePeriod): string {
    if (period.status === 'completed') return 'bg-emerald-50 text-emerald-700'
    if (period.status === 'not_scheduled') return 'bg-navy-50 text-navy-500'
    if (period.status === 'postponed') return 'bg-amber-50 text-amber-700'

    return 'bg-red-50 text-red-700'
}

function PeriodCell({ period }: { period: PeriodicMaintenancePeriod }) {
    return (
        <div className="min-w-28">
            <span className={`badge whitespace-nowrap ${periodTone(period)}`}>{period.status_label}</span>
            <p className="mt-1 text-[10px] font-semibold text-navy-500">
                {period.tasks_total > 0
                    ? `${period.completed} من ${period.tasks_total} مكتملة`
                    : 'لا توجد زيارة مسجلة'}
            </p>
        </div>
    )
}

function SummaryTile({ label, value, tone = 'navy' }: { label: string; value: number; tone?: string }) {
    return (
        <div className="rounded-xl border border-navy-100 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p className={`tabular mt-1 text-xl font-extrabold ${tone}`}>{value}</p>
        </div>
    )
}

export function PeriodicMaintenanceReportPage() {
    const toast = useToast()
    const [month, setMonth] = useState(() => monthValue(new Date()))
    const [selectedIds, setSelectedIds] = useState<number[]>([])
    const [branchSearch, setBranchSearch] = useState('')
    const [exporting, setExporting] = useState(false)
    const { data: branches, isLoading: branchesLoading } = useBranches({ active_only: 1 })
    const { data, isLoading, isFetching } = usePeriodicMaintenanceReport(month, selectedIds)

    const visibleBranches = useMemo(() => {
        const term = branchSearch.trim().toLocaleLowerCase()

        if (!term) return branches ?? []

        return (branches ?? []).filter((branch) =>
            [branch.name, branch.customer, branch.city, branch.governorate, branch.address]
                .filter(Boolean)
                .some((value) => value!.toLocaleLowerCase().includes(term)),
        )
    }, [branchSearch, branches])

    const allVisibleSelected =
        visibleBranches.length > 0 && visibleBranches.every((branch) => selectedIds.includes(branch.id))

    const toggleBranch = (id: number) => {
        setSelectedIds((current) =>
            current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id],
        )
    }

    const toggleVisibleBranches = () => {
        setSelectedIds((current) => {
            if (allVisibleSelected) {
                const visibleIds = new Set(visibleBranches.map((branch) => branch.id))
                return current.filter((id) => !visibleIds.has(id))
            }

            return Array.from(new Set([...current, ...visibleBranches.map((branch) => branch.id)]))
        })
    }

    const exportReport = async () => {
        setExporting(true)

        try {
            await downloadPeriodicMaintenanceReport(month, selectedIds)
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تصدير تقرير الصيانة الدورية.'))
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="periodic-maintenance-report">
            <section className="card print:hidden">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-navy-100 p-4">
                    <div>
                        <h2 className="text-sm font-extrabold text-navy-900">تقرير متابعة الصيانات الدورية</h2>
                        <p className="mt-1 text-[11px] text-navy-400">
                            اختاري الفروع المطلوبة ليظهر تقرير واحد يوضح المنفذ والمتبقي لكل شهر.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-navy-400">شهر التقرير</span>
                            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                        </label>
                        <Button
                            variant="secondary"
                            icon={Printer}
                            disabled={!data}
                            onClick={() => window.print()}
                        >
                            طباعة
                        </Button>
                        <Button
                            variant="secondary"
                            icon={FileSpreadsheet}
                            loading={exporting}
                            disabled={!selectedIds.length}
                            onClick={() => void exportReport()}
                        >
                            تصدير Excel
                        </Button>
                    </div>
                </div>

                <div className="p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold text-navy-700">
                            اختيار الفروع <span className="text-brand-600">({selectedIds.length})</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="text-[11px] font-bold text-brand-600 hover:underline"
                                onClick={toggleVisibleBranches}
                                disabled={!visibleBranches.length}
                            >
                                {allVisibleSelected ? 'إلغاء اختيار الظاهر' : 'اختيار الفروع الظاهرة'}
                            </button>
                            {selectedIds.length > 0 && (
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:underline"
                                    onClick={() => setSelectedIds([])}
                                >
                                    <X className="size-3" />
                                    مسح الاختيار
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="relative mb-3">
                        <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-navy-300" />
                        <Input
                            value={branchSearch}
                            onChange={(event) => setBranchSearch(event.target.value)}
                            placeholder="ابحث باسم الفرع أو العميل أو المكان…"
                            className="pr-10"
                        />
                    </div>

                    {branchesLoading ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </div>
                    ) : !visibleBranches.length ? (
                        <p className="rounded-xl bg-navy-50 p-4 text-center text-xs text-navy-400">
                            لا توجد فروع مطابقة للبحث.
                        </p>
                    ) : (
                        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                            {visibleBranches.map((branch) => (
                                <BranchOption
                                    key={branch.id}
                                    branch={branch}
                                    checked={selectedIds.includes(branch.id)}
                                    onChange={() => toggleBranch(branch.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {!selectedIds.length ? (
                <EmptyState
                    icon={MapPin}
                    title="اختاري فرعًا أو أكثر"
                    description="بعد الاختيار سيظهر تقرير موحد لكل الفروع المحددة، مع مقارنة الشهر السابق بالشهر الحالي."
                />
            ) : isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <section className="mt-4" aria-busy={isFetching}>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-extrabold text-navy-900">الصيانات الدورية للفروع المختارة</h2>
                            <p className="mt-1 text-xs text-navy-400">
                                السابق: {monthLabel(data.previous_month)} · الحالي: {monthLabel(data.month)} ·{' '}
                                {data.selected_branches} فروع
                            </p>
                        </div>
                        {isFetching && <span className="text-[10px] font-bold text-brand-600">جاري تحديث التقرير…</span>}
                    </div>

                    <div className="print-summary mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                        <SummaryTile label="فروع مختارة" value={data.selected_branches} tone="text-brand-600" />
                        <SummaryTile label="زيارات الشهر الحالي" value={data.summary.current_tasks} />
                        <SummaryTile label="تمت حاليًا" value={data.summary.current_completed} tone="text-emerald-600" />
                        <SummaryTile label="لم تكتمل حاليًا" value={data.summary.current_pending} tone="text-amber-600" />
                        <SummaryTile label="تقارير مستلمة" value={data.summary.current_reports_received} tone="text-violet-600" />
                        <SummaryTile label="تمت الشهر السابق" value={data.summary.previous_completed} tone="text-navy-500" />
                    </div>

                    <div className="card print-table-card overflow-hidden">
                        <div className="overflow-x-auto print-table-wrap">
                            <table className="w-full min-w-[980px] table-fixed text-right text-xs">
                                <thead className="bg-navy-50 text-[10px] font-extrabold text-navy-600">
                                    <tr>
                                        <th className="w-10 px-2 py-3">م</th>
                                        <th className="w-[17%] px-2 py-3">الفرع والعميل</th>
                                        <th className="w-[18%] px-2 py-3">المكان</th>
                                        <th className="w-[17%] px-2 py-3">{monthLabel(data.previous_month)}</th>
                                        <th className="w-[17%] px-2 py-3">{monthLabel(data.month)}</th>
                                        <th className="w-[12%] px-2 py-3">موقف الصيانة</th>
                                        <th className="w-[10%] px-2 py-3">استلام التقرير</th>
                                        <th className="w-[12%] px-2 py-3">الموعد والمهندس</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-navy-100">
                                    {data.rows.map((row, index) => (
                                        <MaintenanceRow key={row.branch_id} row={row} index={index} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}
        </div>
    )
}

function BranchOption({
    branch,
    checked,
    onChange,
}: {
    branch: Branch
    checked: boolean
    onChange: () => void
}) {
    return (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-navy-100 bg-white p-2.5 transition hover:border-brand-300 hover:bg-brand-50/30">
            <input
                type="checkbox"
                checked={checked}
                onChange={onChange}
                className="mt-0.5 size-4 accent-brand-600"
            />
            <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-navy-800">{branch.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-navy-400">
                    {branch.customer ?? '—'}{branch.city ? ` · ${branch.city}` : ''}
                </span>
            </span>
        </label>
    )
}

function MaintenanceRow({ row, index }: { row: PeriodicMaintenanceRow; index: number }) {
    const current = row.current
    const technician = current.technicians.length ? current.technicians.join('، ') : '—'

    return (
        <tr className="align-top transition hover:bg-navy-50/40">
            <td className="px-2 py-3 font-bold text-navy-400">{index + 1}</td>
            <td className="px-2 py-3">
                <p className="truncate font-extrabold text-navy-900" title={row.branch}>
                    {row.branch}
                </p>
                <p className="mt-1 truncate text-[10px] text-navy-400" title={row.customer ?? undefined}>
                    {row.customer ?? '—'}
                </p>
            </td>
            <td className="px-2 py-3">
                <p className="line-clamp-2 text-[11px] font-semibold text-navy-700" title={row.location ?? undefined}>
                    {row.location ?? '—'}
                </p>
            </td>
            <td className="px-2 py-3">
                <PeriodCell period={row.previous} />
            </td>
            <td className="px-2 py-3">
                <PeriodCell period={current} />
            </td>
            <td className="px-2 py-3">
                <span className={`badge whitespace-nowrap ${periodTone(current)}`}>{current.status_label}</span>
            </td>
            <td className="px-2 py-3">
                <div className="flex items-center gap-1 font-bold text-navy-700">
                    {current.reports_received === current.tasks_total && current.tasks_total > 0 ? (
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                    ) : (
                        <Clock3 className="size-3.5 text-amber-600" />
                    )}
                    {current.tasks_total > 0 ? `${current.reports_received}/${current.tasks_total}` : '—'}
                </div>
            </td>
            <td className="px-2 py-3">
                <p className="tabular text-[10px] font-bold text-navy-700">{formatDate(current.visit_date)}</p>
                <p className="mt-1 line-clamp-2 text-[10px] text-navy-400" title={technician}>
                    {technician}
                </p>
            </td>
        </tr>
    )
}

export default PeriodicMaintenanceReportPage

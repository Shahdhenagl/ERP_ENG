import { Building2, CalendarDays, CheckCircle2, Filter, MapPin, Plus, RotateCcw, Search, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { Button, EmptyState, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useBranches } from '@/lib/queries'
import type { Branch } from '@/types'

function currentMonth(): string {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

type VisitFilter = '' | 'visited' | 'not_visited'

export function BranchesPage() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const { path } = useArea()
    const [month, setMonth] = useState(params.get('month') || currentMonth())
    const [visitStatus, setVisitStatus] = useState<VisitFilter>((params.get('visit_status') as VisitFilter) || '')
    const [activeOnly, setActiveOnly] = useState('1')
    const [search, setSearch] = useState('')
    const [view, setView] = useViewMode('branches-module')
    const { data: branches, isLoading } = useBranches({
        month,
        visit_status: visitStatus || undefined,
        active_only: activeOnly === '1' ? 1 : undefined,
        search: search || undefined,
    })

    return (
        <>
            <PageHeader
                title="الفروع والمواقع"
                subtitle="اعرف فروع كل عميل وموقف الصيانة والزيارات الشهرية"
            />

            <div className="mb-5 overflow-hidden rounded-3xl border border-navy-100 bg-surface shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 bg-navy-50/40 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                            <Filter className="size-5" />
                        </span>
                        <div>
                            <p className="text-sm font-extrabold text-navy-900">فلترة الفروع</p>
                            <p className="mt-0.5 text-[11px] text-navy-500">حدد الشهر والحالة للوصول للفروع المطلوبة بسرعة.</p>
                        </div>
                    </div>
                    {(month !== currentMonth() || visitStatus || activeOnly !== '1' || search) && (
                        <button
                            type="button"
                            onClick={() => {
                                setMonth(currentMonth())
                                setVisitStatus('')
                                setActiveOnly('1')
                                setSearch('')
                            }}
                            className="tap inline-flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 py-2 text-xs font-bold text-navy-600 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                        >
                            <RotateCcw className="size-3.5" />
                            مسح الفلاتر
                        </button>
                    )}
                </div>

                <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="field-label gap-1.5">
                        <span className="text-[11px] font-extrabold text-navy-600">الشهر</span>
                        <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                    </label>
                    <label className="field-label gap-1.5">
                        <span className="text-[11px] font-extrabold text-navy-600">حالة الزيارة</span>
                        <Select value={visitStatus} onChange={(event) => setVisitStatus(event.target.value as VisitFilter)} aria-label="حالة الزيارة">
                            <option value="">كل الفروع</option>
                            <option value="visited">تمت زيارتها</option>
                            <option value="not_visited">لم تتم زيارتها</option>
                        </Select>
                    </label>
                    <label className="field-label gap-1.5">
                        <span className="text-[11px] font-extrabold text-navy-600">حالة الفرع</span>
                        <Select value={activeOnly} onChange={(event) => setActiveOnly(event.target.value)} aria-label="حالة الفرع">
                            <option value="1">الفروع النشطة</option>
                            <option value="0">كل الحالات</option>
                        </Select>
                    </label>
                    <label className="field-label gap-1.5">
                        <span className="text-[11px] font-extrabold text-navy-600">بحث بالاسم أو الكود</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-navy-300" />
                            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اسم الفرع أو العميل" className="pr-9" />
                        </div>
                    </label>
                </div>
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-navy-500">
                    {branches ? `${branches.length} فرع · ${month}` : 'جاري التحميل…'}
                </p>
                <ViewToggle view={view} onChange={setView} />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !branches?.length ? (
                <EmptyState icon={Building2} title="لا توجد فروع مطابقة" description="جرّب تغيير الشهر أو حالة الزيارة." />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="66rem"
                    headers={[
                        { label: 'الفرع', className: 'w-36' },
                        { label: 'العميل', className: 'w-36' },
                        { label: 'الحالة', className: 'w-24' },
                        { label: 'الصيانة', className: 'w-28' },
                        { label: 'المطلوب شهريًا', className: 'w-28' },
                        { label: 'زيارات الشهر', className: 'w-24' },
                        { label: 'آخر زيارة', className: 'w-28' },
                        { label: 'الموقع', className: 'w-20' },
                    ]}
                >
                    {branches.map((branch) => <BranchRow key={branch.id} branch={branch} onOpenCustomer={() => navigate(path(`/customers/${branch.customer_id}`))} onAddTask={() => navigate(path(`/tasks/new?customer_id=${branch.customer_id}&branch_id=${branch.id}`))} />)}
                </DataTable>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {branches.map((branch) => <BranchCard key={branch.id} branch={branch} onOpenCustomer={() => navigate(path(`/customers/${branch.customer_id}`))} onAddTask={() => navigate(path(`/tasks/new?customer_id=${branch.customer_id}&branch_id=${branch.id}`))} />)}
                </div>
            )}
        </>
    )
}

function BranchRow({ branch, onOpenCustomer, onAddTask }: { branch: Branch; onOpenCustomer: () => void; onAddTask: () => void }) {
    return (
        <tr className="cursor-pointer border-t border-navy-100 transition hover:bg-brand-50/40" onClick={onOpenCustomer}>
            <td className="px-3 py-2.5 font-bold text-navy-900">
                {branch.name}
                <span className="mt-0.5 block tabular text-[10px] font-normal text-navy-400">{branch.code}</span>
            </td>
            <td className="px-3 py-2.5 font-semibold text-navy-700">{branch.customer ?? '—'}</td>
            <td className="px-3 py-2.5"><StatusBadge active={branch.is_active} visited={branch.visited} /></td>
            <td className="px-3 py-2.5">{branch.maintenance_subscribed ? <span className="badge bg-emerald-50 text-emerald-700">مشترك</span> : <span className="badge bg-navy-50 text-navy-400">غير مشترك</span>}</td>
            <td className="tabular px-3 py-2.5 text-navy-700">{branch.visits_per_month || '—'}</td>
            <td className="tabular px-3 py-2.5 font-bold text-navy-800">{branch.month_visits_count ?? 0}</td>
            <td className="tabular px-3 py-2.5 text-navy-500">{branch.last_visit_completed_at ? formatDate(branch.last_visit_completed_at) : '—'}</td>
            <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center gap-2">
                    {!branch.visited && <AddTaskButton onClick={onAddTask} />}
                    {branch.maps_url ? <a href={branch.maps_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline"><MapPin className="mx-auto size-4" /></a> : '—'}
                </div>
            </td>
        </tr>
    )
}

function BranchCard({ branch, onOpenCustomer, onAddTask }: { branch: Branch; onOpenCustomer: () => void; onAddTask: () => void }) {
    return (
        <div className="card cursor-pointer p-4 transition hover:-translate-y-0.5 hover:shadow-md" onClick={onOpenCustomer} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpenCustomer() }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate font-bold text-navy-900">{branch.name}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-navy-500">{branch.customer ?? 'بدون عميل'}</p>
                    <p className="tabular mt-0.5 text-[11px] text-navy-400">{branch.code}</p>
                </div>
                <StatusBadge active={branch.is_active} visited={branch.visited} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <Info label="الصيانة" value={branch.maintenance_subscribed ? 'مشترك' : 'غير مشترك'} />
                <Info label="المطلوب شهريًا" value={branch.visits_per_month ? `${branch.visits_per_month} زيارة` : '—'} />
                <Info label="زيارات الشهر" value={String(branch.month_visits_count ?? 0)} />
                <Info label="آخر زيارة" value={branch.last_visit_completed_at ? formatDate(branch.last_visit_completed_at) : 'لم يزر'} />
            </div>
            {branch.address && <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-navy-500"><MapPin className="size-3.5 shrink-0" />{branch.address}</p>}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-navy-100 pt-3" onClick={(event) => event.stopPropagation()}>
                <span className="text-[11px] text-navy-400">اضغط لفتح ملف العميل وفروعه</span>
                {!branch.visited && <AddTaskButton onClick={onAddTask} />}
            </div>
        </div>
    )
}

function AddTaskButton({ onClick }: { onClick: () => void }) {
    return <Button type="button" variant="secondary" icon={Plus} className="py-1.5 text-[11px]" onClick={onClick}>إضافة مهمة</Button>
}

function StatusBadge({ active, visited }: { active: boolean; visited?: boolean }) {
    if (!active) return <span className="badge bg-slate-100 text-slate-500"><XCircle className="size-3" />غير نشط</span>
    return visited
        ? <span className="badge bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-3" />تمت الزيارة</span>
        : <span className="badge bg-red-50 text-red-700"><CalendarDays className="size-3" />لم تتم</span>
}

function Info({ label, value }: { label: string; value: string }) {
    return <div className="rounded-xl bg-navy-50 px-2 py-2"><p className="text-[10px] font-bold text-navy-400">{label}</p><p className="mt-0.5 text-xs font-extrabold text-navy-800">{value}</p></div>
}

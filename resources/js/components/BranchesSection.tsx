import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { ArrowLeft, CalendarClock, ChevronDown, ClipboardList, HardDrive, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BranchForm } from '@/components/BranchForm'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useAssets, useCustomerBranches, useDeleteBranch, useTasks } from '@/lib/queries'
import type { Asset, Branch, Task } from '@/types'

const TASK_STATUS_CHIP: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    accepted: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    on_the_way: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    cancelled: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

/**
 * A customer's sites across the country. Devices sit at one, jobs are sent to
 * one — so a bank is one account with a branch in Maadi and another in Aswan,
 * each with its own address, contact and working hours.
 */
export function BranchesSection({ customerId }: { customerId: number }) {
    const { data: branches, isLoading } = useCustomerBranches(customerId)
    const [editing, setEditing] = useState<Branch | null>(null)
    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState<Branch | null>(null)

    const remove = useDeleteBranch()
    const toast = useToast()

    return (
        <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-navy-400" />
                    <h2 className="text-sm font-bold text-navy-800">المواقع والفروع</h2>
                    <span className="tabular text-[11px] font-semibold text-navy-400">
                        {branches?.length ?? 0}
                    </span>
                </div>
                <Button icon={Plus} className="text-xs" onClick={() => setCreating(true)}>
                    {tr('أضف فرعًا')}
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !branches?.length ? (
                <EmptyState
                    icon={MapPin}
                    title="لا توجد فروع"
                    description="أضف مواقع العميل في أنحاء مصر ليُسند إليها العمل ويظهر خط سيرها للفني."
                />
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {branches.map((branch) => (
                        <div key={branch.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {branch.code}
                                        </span>
                                        {!branch.is_active && (
                                            <span className="badge bg-navy-100 text-navy-500">موقوف</span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 truncate text-sm font-bold text-navy-900">
                                        {branch.name}
                                        {branch.customer_ref && (
                                            <span className="tabular mr-1.5 text-[11px] font-normal text-navy-400">
                                                {branch.customer_ref}
                                            </span>
                                        )}
                                    </p>
                                    {branch.address && (
                                        <p className="mt-0.5 flex items-start gap-1 text-[11px] text-navy-500">
                                            <MapPin className="mt-0.5 size-3 shrink-0 text-navy-300" />
                                            <span className="truncate">{branch.address}</span>
                                        </p>
                                    )}
                                    {branch.contact_phone && (
                                        <p className="tabular mt-0.5 flex items-center gap-1 text-[11px] text-navy-400">
                                            <Phone className="size-3 text-navy-300" />
                                            {branch.contact_phone}
                                            {branch.contact_name && ` · ${branch.contact_name}`}
                                        </p>
                                    )}
                                    <p className="tabular mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-navy-500">
                                        <span className="inline-flex items-center gap-1">
                                            <CalendarClock className="size-3 text-navy-300" />
                                            آخر زيارة: {branch.last_visit_completed_at ? formatDate(branch.last_visit_completed_at) : 'لا توجد'}
                                        </span>
                                        {typeof branch.days_since_last_visit === 'number' && (
                                            <span>منذ {branch.days_since_last_visit} يوم</span>
                                        )}
                                        {branch.next_visit_available_at && (
                                            <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                                                التالي بعد {formatDate(branch.next_visit_available_at)}
                                            </span>
                                        )}
                                    </p>
                                </div>

                                <div className="flex shrink-0 gap-0.5">
                                    <button
                                        onClick={() => setEditing(branch)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="تعديل"
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(branch)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            </div>

                            <BranchVisits branch={branch} />
                            <BranchAssets branchId={branch.id} />
                        </div>
                    ))}
                </div>
            )}

            {(creating || editing) && (
                <BranchForm
                    open
                    customerId={customerId}
                    branch={editing ?? undefined}
                    onClose={() => {
                        setCreating(false)
                        setEditing(null)
                    }}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                onConfirm={async () => {
                    if (!deleting) return
                    try {
                        await remove.mutateAsync(deleting.id)
                        toast.success('تم حذف الفرع.')
                        setDeleting(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر حذف الفرع.'))
                    }
                }}
                title="حذف الفرع"
                message={`سيتم حذف «${deleting?.name}». الأجهزة والمهام المرتبطة به تبقى دون فرع.`}
                confirmLabel="حذف"
                danger
                loading={remove.isPending}
            />
        </section>
    )
}

function BranchVisits({ branch }: { branch: Branch }) {
    const [open, setOpen] = useState(false)
    const lastVisit = branch.last_visit_completed_at ? formatDate(branch.last_visit_completed_at) : 'لا توجد زيارات'
    const days = typeof branch.days_since_last_visit === 'number'
        ? `${branch.days_since_last_visit} يوم من آخر زيارة`
        : 'لم يتم تسجيل زيارة مكتملة'

    return (
        <div className="mt-3 border-t border-navy-100 pt-2">
            <button
                type="button"
                onClick={() => setOpen((was) => !was)}
                aria-expanded={open}
                className="tap flex w-full items-center gap-1.5 text-[11px] font-bold text-navy-600 transition hover:text-navy-900"
            >
                <ClipboardList className="size-3.5 text-navy-300" />
                بروفايل الفرع وزياراته
                <span className="tabular rounded-lg bg-navy-50 px-2 py-0.5 text-navy-500">
                    آخر زيارة: {lastVisit}
                </span>
                <span className="tabular rounded-lg bg-brand-50 px-2 py-0.5 text-brand-700">
                    {days}
                </span>
                <ChevronDown className={clsx('mr-auto size-3.5 transition', open && 'rotate-180')} />
            </button>

            {open && <BranchVisitList branch={branch} />}
        </div>
    )
}

function BranchVisitList({ branch }: { branch: Branch }) {
    const { path } = useArea()
    const { data, isLoading } = useTasks({ branch_id: branch.id, per_page: 10 })
    const tasks = data?.data ?? []

    if (isLoading) {
        return <p className="py-2 text-center text-[11px] text-navy-400">جارٍ تحميل زيارات الفرع...</p>
    }

    if (!tasks.length) {
        return <p className="py-2 text-[11px] text-navy-400">لا توجد زيارات مسجلة على هذا الفرع.</p>
    }

    return (
        <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <BranchVisitStat label="آخر زيارة" value={branch.last_visit_completed_at ? formatDate(branch.last_visit_completed_at) : 'لا توجد'} />
                <BranchVisitStat
                    label="عدد الأيام بعدها"
                    value={typeof branch.days_since_last_visit === 'number' ? `${branch.days_since_last_visit} يوم` : '—'}
                />
            </div>

            <ul className="space-y-1.5">
                {tasks.map((task) => (
                    <BranchVisitLine key={task.id} task={task} href={path(`/tasks/${task.id}`)} />
                ))}
            </ul>
        </div>
    )
}

function BranchVisitStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-navy-50 px-3 py-2">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p className="tabular mt-0.5 text-xs font-extrabold text-navy-900">{value}</p>
        </div>
    )
}

function BranchVisitLine({ task, href }: { task: Task; href: string }) {
    const visitDate = task.completed_at ?? task.scheduled_at ?? task.created_at

    return (
        <li className="rounded-xl bg-surface px-3 py-2 ring-1 ring-navy-100">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular text-[10px] font-bold text-brand-600">{task.code}</span>
                        <span className={clsx('badge', TASK_STATUS_CHIP[task.status] ?? 'bg-navy-100 text-navy-500')}>
                            {task.status_label}
                        </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-bold text-navy-800">{task.title}</p>
                    <p className="tabular text-[11px] text-navy-400">
                        {formatDateTime(visitDate)}
                        {task.technicians?.length ? ` · ${task.technicians.map(t => t.name).join('، ')}` : ''}
                    </p>
                </div>
                <Link
                    to={href}
                    className="tap grid size-8 shrink-0 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-brand-700"
                    aria-label={`فتح ${task.code}`}
                >
                    <ArrowLeft className="size-4" />
                </Link>
            </div>
        </li>
    )
}

function BranchAssets({ branchId }: { branchId: number }) {
    const [open, setOpen] = useState(false)

    return (
        <div className="mt-3 border-t border-navy-100 pt-2">
            <button
                type="button"
                onClick={() => setOpen((was) => !was)}
                aria-expanded={open}
                className="tap flex w-full items-center gap-1.5 text-[11px] font-bold text-navy-500 transition hover:text-navy-800"
            >
                <HardDrive className="size-3.5 text-navy-300" />
                {tr('أجهزة الفرع')}
                <ChevronDown
                    className={clsx('mr-auto size-3.5 transition', open && 'rotate-180')}
                />
            </button>

            {/* Mounted only once opened, so the fetch belongs to the drawer
                rather than firing for every branch on the page. */}
            {open && <BranchAssetList branchId={branchId} />}
        </div>
    )
}

function BranchAssetList({ branchId }: { branchId: number }) {
    const { data, isLoading } = useAssets({ branch_id: branchId, per_page: 100 })
    const assets = data?.data ?? []

    if (isLoading) {
        return <p className="py-2 text-center text-[11px] text-navy-400">جارٍ التحميل…</p>
    }

    if (assets.length === 0) {
        return <p className="py-2 text-[11px] text-navy-400">لا توجد أجهزة مسجّلة على هذا الفرع.</p>
    }

    return (
        <ul className="mt-2 space-y-2">
            {assets.map((asset) => (
                <AssetLine key={asset.id} asset={asset} />
            ))}
        </ul>
    )
}

function AssetLine({ asset }: { asset: Asset }) {
    const specs: Array<[string, string | null]> = [
        [tr('القدرة'), asset.capacity],
        [tr('النوع'), asset.ups_type],
        [tr('الأوجه'), asset.phase],
        [tr('جهد الدخل'), asset.input_voltage],
        [tr('جهد الخرج'), asset.output_voltage],
        [tr('البطاريات'), asset.battery_count != null ? `${asset.battery_count} × ${asset.battery_voltage ?? '—'}` : null],
        [tr('زمن التغذية'), asset.backup_minutes != null ? `${asset.backup_minutes} دقيقة` : null],
    ]
    const shown = specs.filter((row): row is [string, string] => Boolean(row[1]))

    return (
        <li className="rounded-xl bg-navy-50 p-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-navy-800">
                    {asset.label}
                    {(asset.brand || asset.model) && (
                        <span className="mr-1.5 font-normal text-navy-500">
                            {[asset.brand, asset.model].filter(Boolean).join(' ')}
                        </span>
                    )}
                </span>
                <span className="tabular text-[11px] text-navy-500">
                    {asset.code}
                    {asset.serial && ` · ${asset.serial}`}
                </span>
            </div>

            {shown.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {shown.map(([label, value]) => (
                        <span key={label} className="tabular text-[11px] text-navy-500">
                            {label}: <strong className="font-semibold text-navy-700">{value}</strong>
                        </span>
                    ))}
                </div>
            )}

            {/* How it has behaved, not just what it is: warranty standing, how
                much work it has pulled, and when it went in. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="badge bg-surface text-navy-600 ring-1 ring-navy-200">
                    {asset.status_label}
                </span>
                <span className="badge bg-surface text-navy-600 ring-1 ring-navy-200">
                    {asset.warranty_label}
                </span>
                {typeof asset.tasks_count === 'number' && (
                    <span className="badge bg-surface text-navy-600 ring-1 ring-navy-200">
                        {asset.tasks_count} زيارة
                    </span>
                )}
                {asset.installed_at && (
                    <span className="text-[11px] text-navy-400">
                        رُكِّب {formatDate(asset.installed_at)}
                    </span>
                )}
            </div>
        </li>
    )
}

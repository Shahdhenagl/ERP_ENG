import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { ChevronDown, HardDrive, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BranchForm } from '@/components/BranchForm'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useAssets, useCustomerBranches, useDeleteBranch } from '@/lib/queries'
import type { Asset, Branch } from '@/types'

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

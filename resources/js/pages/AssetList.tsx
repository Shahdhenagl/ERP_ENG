import clsx from 'clsx'
import { HardDrive, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssetForm } from '@/components/AssetForm'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { ASSET_STATUS, warrantyChip } from '@/lib/domain'
import { useArea } from '@/lib/nav'
import { useAssets, useDeleteAsset } from '@/lib/queries'
import type { Asset } from '@/types'

export function AssetList() {
    const toast = useToast()
    const { path } = useArea()

    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [warrantyOnly, setWarrantyOnly] = useState(false)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<Asset | undefined>()
    const [deleting, setDeleting] = useState<Asset | undefined>()

    const { data, isLoading, isError, refetch } = useAssets({
        search,
        status: status || undefined,
        under_warranty: warrantyOnly ? 1 : undefined,
        per_page: 40,
    })
    const remove = useDeleteAsset()

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    const openNew = () => {
        setEditing(undefined)
        setFormOpen(true)
    }

    const handleDelete = async () => {
        if (!deleting) return

        try {
            await remove.mutateAsync(deleting.id)
            toast.success('تم حذف الجهاز.')
            setDeleting(undefined)
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر حذف الجهاز.'))
        }
    }

    return (
        <>
            <PageHeader
                title="الأجهزة"
                subtitle={data ? `${data.meta.total} جهاز مسجّل` : undefined}
                actions={
                    <Button icon={Plus} onClick={openNew}>
                        جهاز جديد
                    </Button>
                }
            />

            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={search}
                        onChange={(event) => debounced(event.target.value)}
                        placeholder="ابحث بالرقم التسلسلي أو الماركة أو الموديل…"
                        className="pr-10"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="w-auto"
                    >
                        <option value="">كل الحالات</option>
                        {Object.entries(ASSET_STATUS).map(([value, meta]) => (
                            <option key={value} value={value}>
                                {meta.label}
                            </option>
                        ))}
                    </Select>

                    <button
                        onClick={() => setWarrantyOnly((current) => !current)}
                        className={clsx(
                            'tap flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                            warrantyOnly
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        <ShieldCheck className="size-3.5" />
                        داخل الضمان فقط
                    </button>
                </div>
            </div>

            {isError ? (
                <ErrorState message="تعذّر تحميل الأجهزة." onRetry={() => void refetch()} />
            ) : isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonCard key={index} />
                    ))}
                </div>
            ) : !data?.data.length ? (
                <EmptyState
                    icon={HardDrive}
                    title="لا توجد أجهزة"
                    description="سجّل أول جهاز ليصبح لكل زيارة صيانة سجل مرتبط به."
                    action={
                        <Button icon={Plus} onClick={openNew}>
                            تسجيل جهاز
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {data.data.map((asset) => (
                        <div key={asset.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <Link to={path(`/assets/${asset.id}`)} className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {asset.code}
                                        </span>
                                        <span className={clsx('badge', ASSET_STATUS[asset.status].chip)}>
                                            {asset.status_label}
                                        </span>
                                        <span className={clsx('badge', warrantyChip(asset.under_warranty))}>
                                            ضمان: {asset.warranty_label}
                                        </span>
                                    </div>

                                    <p className="mt-1.5 truncate font-bold text-navy-900">{asset.label}</p>

                                    {asset.serial && (
                                        <p className="tabular mt-0.5 truncate text-left text-xs text-navy-400" dir="ltr">
                                            {asset.serial}
                                        </p>
                                    )}

                                    <p className="mt-1 truncate text-xs text-navy-500">
                                        {asset.customer?.name}
                                        {asset.capacity && ` · ${asset.capacity}`}
                                    </p>

                                    {(asset.tasks_count ?? 0) > 0 && (
                                        <p className="mt-1.5 text-[11px] font-semibold text-navy-400">
                                            {asset.tasks_count} زيارة صيانة
                                        </p>
                                    )}
                                </Link>

                                <div className="flex shrink-0 gap-1">
                                    <button
                                        onClick={() => {
                                            setEditing(asset)
                                            setFormOpen(true)
                                        }}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="تعديل"
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(asset)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {formOpen && (
                <AssetForm
                    // Remounting on the edited id resets the form state between
                    // opening two different devices in a row.
                    key={editing?.id ?? 'new'}
                    open={formOpen}
                    onClose={() => setFormOpen(false)}
                    asset={editing}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(undefined)}
                onConfirm={handleDelete}
                title="حذف الجهاز"
                message={`سيتم حذف ${deleting?.code ?? ''} نهائيًا. الأجهزة التي لها سجل صيانة لا يمكن حذفها.`}
                confirmLabel="حذف"
                loading={remove.isPending}
                danger
            />
        </>
    )
}

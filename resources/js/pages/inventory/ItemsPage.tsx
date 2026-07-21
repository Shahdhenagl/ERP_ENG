import clsx from 'clsx'
import { AlertTriangle, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, ErrorState, Input, Select, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatQty, ITEM_CATEGORY } from '@/lib/domain'
import { useDeleteItem, useItems } from '@/lib/queries'
import { useInventory } from '@/pages/inventory/InventoryLayout'
import type { Item } from '@/types'

export function ItemsPage() {
    const toast = useToast()
    const { openItemForm } = useInventory()

    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [lowOnly, setLowOnly] = useState(false)
    const [deleting, setDeleting] = useState<Item | undefined>()

    const { data, isLoading, isError, refetch } = useItems({
        search,
        category: category || undefined,
        below_reorder: lowOnly ? 1 : undefined,
        per_page: 50,
    })
    const remove = useDeleteItem()

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    const handleDelete = async () => {
        if (!deleting) return

        try {
            await remove.mutateAsync(deleting.id)
            toast.success('تم حذف الصنف.')
            setDeleting(undefined)
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر حذف الصنف.'))
        }
    }

    return (
        <>
            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={search}
                        onChange={(event) => debounced(event.target.value)}
                        placeholder="ابحث بالاسم أو الكود…"
                        className="pr-10"
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    <Select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="w-auto"
                    >
                        <option value="">كل التصنيفات</option>
                        {Object.entries(ITEM_CATEGORY).map(([value, meta]) => (
                            <option key={value} value={value}>
                                {meta.label}
                            </option>
                        ))}
                    </Select>

                    <button
                        onClick={() => setLowOnly((current) => !current)}
                        className={clsx(
                            'tap flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                            lowOnly
                                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        <AlertTriangle className="size-3.5" />
                        تحت حد الطلب
                    </button>
                </div>
            </div>

            {isError ? (
                <ErrorState message="تعذّر تحميل الأصناف." onRetry={() => void refetch()} />
            ) : isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonCard key={index} />
                    ))}
                </div>
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Package}
                    title="لا توجد أصناف"
                    description="أضف البطاريات وقطع الغيار التي تتعامل بها لتبدأ تتبّع الأرصدة."
                    action={
                        <Button icon={Plus} onClick={() => openItemForm()}>
                            صنف جديد
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-3">
                    {data.data.map((item) => (
                        <div key={item.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {item.code}
                                        </span>
                                        <span className={clsx('badge', ITEM_CATEGORY[item.category].chip)}>
                                            {item.category_label}
                                        </span>
                                        {item.below_reorder_level && (
                                            <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                                                <AlertTriangle className="size-3" />
                                                تحت حد الطلب
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-1.5 font-bold text-navy-900">{item.name}</p>

                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-500">
                                        <span>
                                            الرصيد:{' '}
                                            <strong className="tabular text-navy-800">
                                                {formatQty(item.total_qty)}
                                            </strong>{' '}
                                            {item.unit}
                                        </span>
                                        <span>متوسط التكلفة: {formatMoney(item.avg_cost)}</span>
                                        <span>القيمة: {formatMoney(item.stock_value)}</span>
                                    </div>

                                    {/* Where it physically is — the store plus any van holding some. */}
                                    {item.levels && item.levels.filter((l) => l.qty > 0).length > 1 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {item.levels
                                                .filter((level) => level.qty > 0)
                                                .map((level) => (
                                                    <span
                                                        key={level.warehouse_id}
                                                        className="rounded-lg bg-navy-50 px-2 py-0.5 text-[11px] text-navy-600"
                                                    >
                                                        {level.warehouse}: {formatQty(level.qty)}
                                                    </span>
                                                ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex shrink-0 gap-1">
                                    <button
                                        onClick={() => openItemForm(item)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="تعديل"
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(item)}
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

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(undefined)}
                onConfirm={handleDelete}
                title="حذف الصنف"
                message={`سيتم حذف ${deleting?.name ?? ''}. الأصناف التي لها حركة مخزنية لا يمكن حذفها.`}
                confirmLabel="حذف"
                loading={remove.isPending}
                danger
            />
        </>
    )
}

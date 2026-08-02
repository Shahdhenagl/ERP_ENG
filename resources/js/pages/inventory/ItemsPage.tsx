import clsx from 'clsx'
import {
    AlertTriangle,
    MapPin,
    Package,
    Pencil,
    Plus,
    Search,
    Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AssetForm } from '@/components/AssetForm'
import { BatteryForm } from '@/components/BatteryForm'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, ErrorState, Input, SkeletonCard, Th } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatQty, ITEM_CATEGORY } from '@/lib/domain'
import { useDeleteItem, useItemGroups, useItems } from '@/lib/queries'
import { useViewMode, ViewToggle } from '@/components/ViewToggle'
import { useInventory } from '@/pages/inventory/InventoryLayout'
import type { Item } from '@/types'


/** A one-line nameplate summary for a UPS or battery row. */
function specSummary(item: Item): string | null {
    const s = item.specs
    if (!s) return null

    const parts =
        item.category === 'ups'
            ? [s.brand, s.model, s.capacity, s.phase && (s.phase === 'three' ? '3 phase' : '1 phase')]
            : [s.brand, s.model, s.capacity_ah && `${s.capacity_ah}Ah`, s.voltage && `${s.voltage}V`]

    const text = parts.filter(Boolean).join(' · ')
    return text || null
}

export function ItemsPage() {
    const toast = useToast()
    const { openItemForm } = useInventory()

    const [search, setSearch] = useState('')
    // Filtering is by the group the store manages, not by the fixed kind — a
    // group they add or rename has to show up here.
    const [groupId, setGroupId] = useState<number | ''>('')
    const [lowOnly, setLowOnly] = useState(false)
    const [view, setViewMode] = useViewMode('items')
    const [deleting, setDeleting] = useState<Item | undefined>()
    // The UPS/battery being installed at a customer — drawn off the shelf on save.
    const [installing, setInstalling] = useState<Item | undefined>()

    const { data: groupList } = useItemGroups()
    const groups = (groupList ?? []).filter((group) => group.is_active)

    const { data, isLoading, isError, refetch } = useItems({
        search,
        item_category_id: groupId || undefined,
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

    const counts = data?.counts
    const tabs: Array<{ value: number | ''; label: string; count?: number }> = [
        { value: '', label: 'الكل', count: counts?.all },
        ...groups.map((group) => ({
            value: group.id,
            label: group.name,
            count: counts?.by_group?.[group.id],
        })),
    ]

    const items = data?.data ?? []

    return (
        <>
            {/* Group tabs — one per category, each showing how many it holds. */}
            <div className="mb-4 flex flex-wrap gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.value || 'all'}
                        onClick={() => setGroupId(tab.value)}
                        className={clsx(
                            'tap flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold ring-1 transition',
                            groupId === tab.value
                                ? 'bg-brand-600 text-white ring-brand-600'
                                : 'bg-surface text-navy-500 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        {tab.label}
                        {typeof tab.count === 'number' && (
                            <span
                                className={clsx(
                                    'tabular rounded-md px-1.5 py-0.5 text-[10px]',
                                    groupId === tab.value ? 'bg-white/20' : 'bg-navy-100 text-navy-500',
                                )}
                            >
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

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

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setLowOnly((current) => !current)}
                        className={clsx(
                            'tap flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                            lowOnly
                                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                : 'bg-surface text-navy-500 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        <AlertTriangle className="size-3.5" />
                        تحت حد الطلب
                    </button>

                    {/* Table for scanning many at a glance, cards for the detail. */}
                    <ViewToggle view={view} onChange={setViewMode} className="mr-auto" />

                    {/* Adding while a group is selected files the item straight into it. */}
                    {groupId !== '' && (
                        <Button
                            icon={Plus}
                            className="text-xs"
                            onClick={() => openItemForm(undefined, undefined, groupId)}
                        >
                            {groups.find((group) => group.id === groupId)?.name} — صنف جديد
                        </Button>
                    )}
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
            ) : !items.length ? (
                <EmptyState
                    icon={Package}
                    title="لا توجد أصناف"
                    description="أضف الأجهزة والبطاريات وقطع الغيار التي تتعامل بها لتبدأ تتبّع الأرصدة."
                    action={
                        <Button
                            icon={Plus}
                            onClick={() => openItemForm(undefined, undefined, groupId || undefined)}
                        >
                            صنف جديد
                        </Button>
                    }
                />
            ) : view === 'table' ? (
                <ItemsTable
                    items={items}
                    onEdit={(item) => openItemForm(item)}
                    onDelete={setDeleting}
                    onInstall={setInstalling}
                />
            ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                    {items.map((item) => {
                        const summary = specSummary(item)

                        return (
                            <div key={item.id} className="card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular text-[11px] font-bold text-brand-600">
                                                {item.code}
                                            </span>
                                            <span
                                                className={clsx(
                                                    'badge',
                                                    item.group_chip ?? ITEM_CATEGORY[item.category].chip,
                                                )}
                                            >
                                                {item.group ?? item.category_label}
                                            </span>
                                            {item.below_reorder_level && (
                                                <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                                                    <AlertTriangle className="size-3" />
                                                    تحت حد الطلب
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1.5 font-bold text-navy-900">{item.name}</p>

                                        {summary && (
                                            <p className="tabular mt-0.5 text-[11px] text-navy-400">{summary}</p>
                                        )}

                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-500">
                                            <span>
                                                الرصيد:{' '}
                                                <strong className="tabular text-navy-800">
                                                    {formatQty(item.total_qty)}
                                                </strong>{' '}
                                                {item.unit}
                                            </span>
                                            <span>متوسط التكلفة: {formatMoney(item.avg_cost)}</span>
                                            {item.sell_price !== null && (
                                                <span>سعر البيع: {formatMoney(item.sell_price)}</span>
                                            )}
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

                                {/* A UPS or battery on the shelf can be installed at a
                                    customer — which draws it out of stock. */}
                                {(item.category === 'ups' || item.category === 'battery') &&
                                    item.total_qty > 0 && (
                                        <div className="mt-3 border-t border-navy-100 pt-3">
                                            <button
                                                onClick={() => setInstalling(item)}
                                                className="tap inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100"
                                            >
                                                <MapPin className="size-3.5" />
                                                تركيب عند عميل
                                            </button>
                                        </div>
                                    )}
                            </div>
                        )
                    })}
                </div>
            )}

            {installing?.category === 'ups' && (
                <AssetForm
                    open
                    stockItem={installing}
                    onClose={() => setInstalling(undefined)}
                />
            )}
            {installing?.category === 'battery' && (
                <BatteryForm stockItem={installing} onClose={() => setInstalling(undefined)} />
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


/**
 * The dense view: every column the counter asks for on one row — name, group,
 * barcode, what is on the shelf, what it cost on average, and what we sell it
 * at — so a whole catalogue can be scanned without opening a card each time.
 */
function ItemsTable({
    items,
    onEdit,
    onDelete,
    onInstall,
}: {
    items: Item[]
    onEdit: (item: Item) => void
    onDelete: (item: Item) => void
    onInstall: (item: Item) => void
}) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-navy-100">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-navy-100 bg-navy-50 text-start text-[11px] font-bold text-navy-500">
                        <Th className="p-3">الصنف</Th>
                        <Th className="p-3">الفئة</Th>
                        <Th className="p-3">السيريال</Th>
                        <Th className="p-3 text-left">المتاح</Th>
                        <Th className="p-3 text-left">متوسط الشراء</Th>
                        <Th className="p-3 text-left">سعر البيع</Th>
                        <Th className="w-20 p-3" />
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => {
                        const summary = specSummary(item)

                        return (
                            <tr
                                key={item.id}
                                className="border-b border-navy-100 bg-surface transition last:border-0 hover:bg-navy-50"
                            >
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <span className="tabular text-[10px] font-bold text-brand-600">
                                            {item.code}
                                        </span>
                                        {item.below_reorder_level && (
                                            <AlertTriangle className="size-3.5 text-amber-500" />
                                        )}
                                    </div>
                                    <p className="font-bold text-navy-900">{item.name}</p>
                                    {summary && (
                                        <p className="tabular text-[11px] text-navy-400">{summary}</p>
                                    )}
                                </td>
                                <td className="p-3">
                                    <span
                                        className={clsx(
                                            'badge',
                                            item.group_chip ?? ITEM_CATEGORY[item.category].chip,
                                        )}
                                    >
                                        {item.group ?? item.category_label}
                                    </span>
                                </td>
                                <td className="tabular p-3 text-navy-600" dir="ltr">
                                    <span className="block text-start">{item.barcode || '—'}</span>
                                </td>
                                <td className="tabular p-3 text-left">
                                    <span
                                        className={clsx(
                                            'font-bold',
                                            item.below_reorder_level ? 'text-amber-600' : 'text-navy-900',
                                        )}
                                    >
                                        {formatQty(item.total_qty)}
                                    </span>{' '}
                                    <span className="text-[11px] text-navy-400">{item.unit}</span>
                                </td>
                                <td className="tabular p-3 text-left text-navy-700">
                                    {formatMoney(item.avg_cost)}
                                </td>
                                <td className="tabular p-3 text-left text-navy-700">
                                    {item.sell_price !== null ? formatMoney(item.sell_price) : '—'}
                                </td>
                                <td className="p-3">
                                    <div className="flex items-center justify-end gap-0.5">
                                        {(item.category === 'ups' || item.category === 'battery') &&
                                            item.total_qty > 0 && (
                                                <button
                                                    onClick={() => onInstall(item)}
                                                    className="tap grid place-items-center rounded-lg p-2 text-brand-500 transition hover:bg-brand-50 hover:text-brand-700"
                                                    aria-label="تركيب عند عميل"
                                                    title="تركيب عند عميل"
                                                >
                                                    <MapPin className="size-4" />
                                                </button>
                                            )}
                                        <button
                                            onClick={() => onEdit(item)}
                                            className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                            aria-label="تعديل"
                                        >
                                            <Pencil className="size-4" />
                                        </button>
                                        <button
                                            onClick={() => onDelete(item)}
                                            className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                            aria-label="حذف"
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

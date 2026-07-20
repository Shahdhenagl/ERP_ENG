import clsx from 'clsx'
import {
    AlertTriangle,
    ArrowLeftRight,
    ClipboardList,
    Package,
    PackagePlus,
    Pencil,
    Plus,
    Search,
    Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/Modal'
import { ItemForm } from '@/components/ItemForm'
import { StockOperationForm } from '@/components/StockOperationForm'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatQty, ITEM_CATEGORY, MOVEMENT_TYPE } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useDeleteItem, useItems, useMovements, useStockSummary, useWarehouses } from '@/lib/queries'
import type { Item } from '@/types'

type Tab = 'items' | 'warehouses' | 'movements'

export function Inventory() {
    const toast = useToast()
    const [tab, setTab] = useState<Tab>('items')

    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [lowOnly, setLowOnly] = useState(false)

    const [itemForm, setItemForm] = useState(false)
    const [editing, setEditing] = useState<Item | undefined>()
    const [deleting, setDeleting] = useState<Item | undefined>()
    const [operation, setOperation] = useState<'receive' | 'transfer' | 'adjust' | null>(null)

    const { data: summary } = useStockSummary()
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
            <PageHeader
                title="المخزون"
                subtitle={summary ? `${summary.items_count} صنف · ${formatMoney(summary.stock_value)}` : undefined}
                actions={
                    <Button icon={PackagePlus} onClick={() => setOperation('receive')}>
                        تسجيل وارد
                    </Button>
                }
            />

            {/* ══ Headline numbers ══════════════════════════════ */}
            {summary && (
                <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="قيمة المخزون" value={formatMoney(summary.stock_value)} />
                    <Stat label="عدد الأصناف" value={String(summary.items_count)} />
                    <Stat
                        label="تحت حد الطلب"
                        value={String(summary.below_reorder)}
                        tone={summary.below_reorder > 0 ? 'warn' : undefined}
                    />
                    <Stat label="عهد الفنيين" value={String(summary.vans)} />
                </div>
            )}

            {/* ══ Actions ═══════════════════════════════════════ */}
            <div className="mb-5 flex flex-wrap gap-2">
                <Button variant="secondary" icon={Plus} onClick={() => { setEditing(undefined); setItemForm(true) }}>
                    صنف جديد
                </Button>
                <Button variant="secondary" icon={ArrowLeftRight} onClick={() => setOperation('transfer')}>
                    تسليم عهدة
                </Button>
                <Button variant="secondary" icon={ClipboardList} onClick={() => setOperation('adjust')}>
                    تسوية جرد
                </Button>
            </div>

            {/* ══ Tabs ══════════════════════════════════════════ */}
            <div className="mb-4 flex gap-1 rounded-xl bg-navy-100 p-1">
                {([
                    ['items', 'الأصناف'],
                    ['warehouses', 'المخازن والعهد'],
                    ['movements', 'سجل الحركة'],
                ] as Array<[Tab, string]>).map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => setTab(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                            tab === value ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'items' && (
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
                                <Button icon={Plus} onClick={() => setItemForm(true)}>
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
                                                onClick={() => { setEditing(item); setItemForm(true) }}
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
                </>
            )}

            {tab === 'warehouses' && <WarehousesTab />}
            {tab === 'movements' && <MovementsTab />}

            {itemForm && (
                <ItemForm
                    key={editing?.id ?? 'new'}
                    open={itemForm}
                    onClose={() => setItemForm(false)}
                    item={editing}
                />
            )}

            {operation && (
                <StockOperationForm
                    open={Boolean(operation)}
                    onClose={() => setOperation(null)}
                    operation={operation}
                />
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
    return (
        <div className="card p-4">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular mt-1 text-lg font-extrabold',
                    tone === 'warn' ? 'text-amber-600' : 'text-navy-900',
                )}
            >
                {value}
            </p>
        </div>
    )
}

/* ── Where the stock physically sits ─────────────────────── */

function WarehousesTab() {
    const { data: warehouses, isLoading } = useWarehouses()

    if (isLoading) return <SkeletonCard />

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {warehouses?.map((warehouse) => (
                <div key={warehouse.id} className="card p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate font-bold text-navy-900">{warehouse.name}</p>
                            <p className="text-xs text-navy-400">
                                {warehouse.type_label}
                                {warehouse.holder && ` · ${warehouse.holder}`}
                            </p>
                        </div>
                        <p className="tabular shrink-0 text-lg font-extrabold text-brand-600">
                            {formatQty(warehouse.total_qty)}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    )
}

/* ── The audit trail ─────────────────────────────────────── */

function MovementsTab() {
    const { data, isLoading } = useMovements({ per_page: 50 })

    if (isLoading) return <SkeletonCard />

    if (!data?.data.length) {
        return <EmptyState icon={ClipboardList} title="لا توجد حركات بعد" />
    }

    return (
        <div className="space-y-2">
            {data.data.map((movement) => {
                const meta = MOVEMENT_TYPE[movement.type]

                return (
                    <div key={movement.id} className="card p-3.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={clsx('badge', meta.chip)}>{movement.type_label}</span>
                                    {movement.task_code && (
                                        <span className="tabular text-[11px] font-bold text-navy-400">
                                            {movement.task_code}
                                        </span>
                                    )}
                                </div>

                                <p className="mt-1 truncate text-sm font-bold text-navy-900">
                                    {movement.item?.name}
                                </p>

                                <p className="mt-0.5 text-xs text-navy-500">
                                    {movement.from && `من ${movement.from}`}
                                    {movement.from && movement.to && ' ← '}
                                    {movement.to && `إلى ${movement.to}`}
                                    {movement.supplier && ` · ${movement.supplier}`}
                                </p>

                                <p className="mt-1 text-[11px] text-navy-400">
                                    {movement.actor} · {formatSmart(movement.created_at)}
                                </p>
                            </div>

                            <div className="shrink-0 text-left">
                                <p className="tabular font-extrabold text-navy-900">
                                    {meta.sign}
                                    {formatQty(movement.qty)}
                                </p>
                                <p className="tabular text-[11px] text-navy-400">
                                    {formatMoney(movement.value)}
                                </p>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

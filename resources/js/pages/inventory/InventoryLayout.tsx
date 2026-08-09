import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { ItemForm } from '@/components/ItemForm'
import { SectionTabs } from '@/components/SectionTabs'
import { Button, PageHeader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { useStockSummary } from '@/lib/queries'
import type { Item, ItemCategory } from '@/types'

/**
 * The shell every inventory section sits in: headline numbers and a sub-nav.
 *
 * Receiving and stocktaking used to sit here as buttons, on every section. They
 * have screens of their own in the sidebar, and a shortcut to them above the
 * items list only made the page ask "what am I looking at" twice.
 *
 * The sections are routes rather than tabs so the sidebar can link straight
 * into one — a manager who wants custody should not land on items first.
 */

interface InventoryContext {
    openItemForm: (item?: Item, category?: ItemCategory, groupId?: number) => void
}

/** Lets a child open the item dialog the layout owns. */
export function useInventory(): InventoryContext {
    return useOutletContext<InventoryContext>()
}

const SECTIONS = [
    ['/inventory/items', 'الأصناف'],
    ['/inventory/warehouses', 'المخازن'],
    ['/inventory/stocktake', 'الجرد'],
    ['/inventory/movements', 'سجل الحركة'],
] as const

/**
 * Each section names itself, and says whether the stock headline belongs above
 * it.
 *
 * "المخزون" over a list of warehouses answers a question nobody asked there,
 * and the value of all stock is not a fact about the stocktake screen. Only the
 * items list is about the stock as a whole, so only it carries the figures and
 * the button that adds to them.
 */
const SECTION_META: Record<string, { title: string; stock: boolean }> = {
    items: { title: tr('الأصناف'), stock: true },
    warehouses: { title: tr('المخازن'), stock: false },
    movements: { title: tr('إذن استلام'), stock: false },
    stocktake: { title: tr('الجرد والتسويات'), stock: false },
}

export function InventoryLayout() {
    const { data: summary } = useStockSummary()
    const { pathname } = useLocation()

    const section = pathname.split('/').filter(Boolean).pop() ?? 'items'
    const meta = SECTION_META[section] ?? SECTION_META.items

    const [itemForm, setItemForm] = useState(false)
    const [editing, setEditing] = useState<Item | undefined>()
    const [newCategory, setNewCategory] = useState<ItemCategory | undefined>()
    const [newGroupId, setNewGroupId] = useState<number | undefined>()

    const openItemForm = (item?: Item, category?: ItemCategory, groupId?: number) => {
        setEditing(item)
        setNewCategory(category)
        setNewGroupId(groupId)
        setItemForm(true)
    }

    return (
        <>
            <PageHeader
                title={meta.title}
                subtitle={
                    meta.stock && summary
                        ? `${summary.items_count} ${tr('صنف')} · ${formatMoney(summary.stock_value)}`
                        : undefined
                }
                actions={
                    meta.stock ? (
                        <Button icon={Plus} onClick={() => openItemForm()}>
                            {tr('صنف جديد')}
                        </Button>
                    ) : undefined
                }
            />

            {meta.stock && summary && (
                <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label={tr('قيمة المخزون')} value={formatMoney(summary.stock_value)} />
                    <Stat label={tr('عدد الأصناف')} value={String(summary.items_count)} />
                    <Stat
                        label={tr('تحت حد الطلب')}
                        value={String(summary.below_reorder)}
                        tone={summary.below_reorder > 0 ? 'warn' : undefined}
                    />
                    <Stat label={tr('عهد الفنيين')} value={String(summary.vans)} />
                </div>
            )}

            <SectionTabs sections={SECTIONS} />

            <Outlet context={{ openItemForm } satisfies InventoryContext} />

            {itemForm && (
                <ItemForm
                    key={editing?.id ?? `new-${newGroupId ?? newCategory ?? 'any'}`}
                    open={itemForm}
                    onClose={() => setItemForm(false)}
                    item={editing}
                    defaultCategory={newCategory}
                    defaultGroupId={newGroupId}
                />
            )}
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

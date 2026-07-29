import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
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

export function InventoryLayout() {
    const { data: summary } = useStockSummary()

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
                title="المخزون"
                subtitle={
                    summary
                        ? `${summary.items_count} صنف · ${formatMoney(summary.stock_value)}`
                        : undefined
                }
                actions={
                    <Button icon={Plus} onClick={() => openItemForm()}>
                        صنف جديد
                    </Button>
                }
            />

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

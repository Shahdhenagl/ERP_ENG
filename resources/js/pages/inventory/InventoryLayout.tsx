import clsx from 'clsx'
import { ArrowLeftRight, ClipboardList, PackagePlus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { ItemForm } from '@/components/ItemForm'
import { SectionTabs } from '@/components/SectionTabs'
import { StockOperationForm } from '@/components/StockOperationForm'
import { Button, PageHeader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { useStockSummary } from '@/lib/queries'
import type { Item } from '@/types'

/**
 * The shell every inventory section sits in: headline numbers, the actions
 * that move stock, and a sub-nav.
 *
 * The sections are routes rather than tabs so the sidebar can link straight
 * into one — a manager who wants custody should not land on items first.
 */

interface InventoryContext {
    openItemForm: (item?: Item) => void
}

/** Lets a child open the item dialog the layout owns. */
export function useInventory(): InventoryContext {
    return useOutletContext<InventoryContext>()
}

const SECTIONS = [
    ['/inventory/items', 'الأصناف'],
    ['/inventory/warehouses', 'المخازن'],
    ['/inventory/custody', 'العهد'],
    ['/inventory/movements', 'سجل الحركة'],
] as const

export function InventoryLayout() {
    const { data: summary } = useStockSummary()

    const [itemForm, setItemForm] = useState(false)
    const [editing, setEditing] = useState<Item | undefined>()
    const [operation, setOperation] = useState<'receive' | 'transfer' | 'adjust' | null>(null)

    const openItemForm = (item?: Item) => {
        setEditing(item)
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
                    <Button icon={PackagePlus} onClick={() => setOperation('receive')}>
                        تسجيل وارد
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

            <div className="mb-5 flex flex-wrap gap-2">
                <Button variant="secondary" icon={Plus} onClick={() => openItemForm()}>
                    صنف جديد
                </Button>
                <Button
                    variant="secondary"
                    icon={ArrowLeftRight}
                    onClick={() => setOperation('transfer')}
                >
                    تسليم عهدة
                </Button>
                <Button
                    variant="secondary"
                    icon={ClipboardList}
                    onClick={() => setOperation('adjust')}
                >
                    تسوية جرد
                </Button>
            </div>

            <SectionTabs sections={SECTIONS} />

            <Outlet context={{ openItemForm } satisfies InventoryContext} />

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

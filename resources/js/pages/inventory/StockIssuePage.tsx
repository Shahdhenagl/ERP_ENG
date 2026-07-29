import { PackageMinus, Plus } from 'lucide-react'
import { useState } from 'react'
import { EMPTY_RANGE, MonthDayFilter, monthDayRange } from '@/components/MonthDayFilter'
import type { DateRange } from '@/components/MonthDayFilter'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
    Button,
    EmptyState,
    Field,
    Input,
    PageHeader,
    Select,
    SkeletonCard,
    Textarea,
} from '@/components/ui'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useItems, useMovements, useStockOperation, useWarehouses } from '@/lib/queries'

/**
 * What has been issued out of the store, and a way to issue more.
 *
 * The screen used to be the form alone, which answered "how do I record one"
 * and nothing at all about the ones already recorded. The register is the page
 * now and writing a new note is a button on it — the shape every other document
 * screen here has.
 */
export function StockIssuePage() {
    const [creating, setCreating] = useState(false)
    const [month, setMonth] = useState('')
    const [day, setDay] = useState('')
    const [range, setRange] = useState<DateRange>(EMPTY_RANGE)
    const [view, setView] = useViewMode('stock-issues')

    const { data, isLoading } = useMovements({
        type: 'issue',
        per_page: 50,
        ...monthDayRange(month, day, range),
    })

    const rows = data?.data ?? []

    return (
        <>
            <PageHeader
                title="إذن صرف"
                subtitle="صرف الأصناف من المخزن بسبب — استهلاك أو تلف أو عيّنة"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        إذن صرف جديد
                    </Button>
                }
            />

            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <MonthDayFilter
                    month={month}
                    day={day}
                    range={range}
                    onMonth={setMonth}
                    onDay={setDay}
                    onRange={setRange}
                />
                <ViewToggle view={view} onChange={setView} className="mb-0.5" />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={PackageMinus}
                    title="لا توجد أذون صرف في هذه الفترة"
                    description="سجّل صرفًا من المخزن ليظهر هنا بسببه والكمية التي خرجت."
                    action={
                        <Button icon={Plus} onClick={() => setCreating(true)}>
                            إذن صرف جديد
                        </Button>
                    }
                />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="48rem"
                    headers={[
                        'الصنف',
                        'من مخزن',
                        { label: 'الكمية', className: 'w-24' },
                        { label: 'القيمة', className: 'w-28' },
                        'السبب',
                        { label: 'التاريخ', className: 'w-36' },
                    ]}
                >
                    {rows.map((movement) => (
                        <tr key={movement.id} className="border-t border-navy-100 hover:bg-navy-50/60">
                            <td className="px-3 py-2.5 font-semibold text-navy-800">
                                {movement.item?.name ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-navy-600">{movement.from ?? '—'}</td>
                            <td className="tabular px-3 py-2.5 font-bold text-navy-800">
                                −{formatQty(movement.qty)}
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600">
                                {formatMoney(movement.value)}
                            </td>
                            <td className="px-3 py-2.5 text-navy-600">{movement.note ?? '—'}</td>
                            <td className="tabular px-3 py-2.5 text-[11px] text-navy-500">
                                {formatSmart(movement.created_at)}
                                <span className="block text-navy-400">{movement.actor}</span>
                            </td>
                        </tr>
                    ))}
                </DataTable>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((movement) => (
                        <div key={movement.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-navy-900">
                                        {movement.item?.name}
                                    </p>
                                    {movement.from && (
                                        <p className="mt-0.5 text-xs text-navy-500">
                                            من {movement.from}
                                        </p>
                                    )}
                                    {movement.note && (
                                        <p className="mt-1 text-[11px] text-navy-500">{movement.note}</p>
                                    )}
                                    <p className="mt-1 text-[11px] text-navy-400">
                                        {movement.actor} · {formatSmart(movement.created_at)}
                                    </p>
                                </div>

                                <div className="shrink-0 text-left">
                                    <p className="tabular font-extrabold text-navy-900">
                                        −{formatQty(movement.qty)}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {formatMoney(movement.value)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {creating && <IssueDialog onClose={() => setCreating(false)} />}
        </>
    )
}

/** A plain stock-out — consumption, damage, a sample — with a reason behind it. */
function IssueDialog({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const issue = useStockOperation('issue')
    const { data: items } = useItems({ per_page: 500 })
    const { data: warehouses } = useWarehouses()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({ item_id: '', warehouse_id: '', qty: '', note: '' })
    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title="إذن صرف جديد"
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={issue.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        icon={PackageMinus}
                        loading={issue.isPending}
                        disabled={!form.item_id || !form.warehouse_id || !form.qty}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await issue.mutateAsync({
                                    item_id: Number(form.item_id),
                                    warehouse_id: Number(form.warehouse_id),
                                    qty: Number(form.qty),
                                    note: form.note || null,
                                })
                                toast.success('تم تسجيل الصرف.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر الصرف.'))
                            }
                        }}
                    >
                        تسجيل الصرف
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الصنف" required error={errors.item_id}>
                    <Select value={form.item_id} onChange={(e) => set('item_id')(e.target.value)}>
                        <option value="">— اختر —</option>
                        {items?.data.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="المخزن" required error={errors.warehouse_id}>
                        <Select
                            value={form.warehouse_id}
                            onChange={(e) => set('warehouse_id')(e.target.value)}
                        >
                            <option value="">— اختر —</option>
                            {(warehouses ?? [])
                                .filter((w) => w.type === 'store')
                                .map((w) => (
                                    <option key={w.id} value={w.id}>
                                        {w.name}
                                    </option>
                                ))}
                        </Select>
                    </Field>

                    <Field label="الكمية" required error={errors.qty}>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={form.qty}
                            onChange={(e) => set('qty')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <Field label="السبب / ملاحظة" required error={errors.note}>
                    <Textarea
                        value={form.note}
                        onChange={(e) => set('note')(e.target.value)}
                        placeholder="تالف بالمخزن، عيّنة لعميل…"
                    />
                </Field>
            </div>
        </Modal>
    )
}

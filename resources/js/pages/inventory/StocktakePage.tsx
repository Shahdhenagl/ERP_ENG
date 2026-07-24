import clsx from 'clsx'
import { ClipboardCheck, Save, Search, Warehouse as WarehouseIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
    Button,
    EmptyState,
    Field,
    Input,
    Select,
    SkeletonCard,
    Textarea,
} from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatQty } from '@/lib/domain'
import { useStocktakeCommit, useStocktakeSheet, useWarehouses } from '@/lib/queries'
import type { StocktakeSheetLine, StocktakeSummary } from '@/types'

/**
 * The whole shelf, counted at once.
 *
 * Pick a warehouse, and the book quantity for every active item is laid out
 * with a box for what the count actually found. Only the lines someone typed a
 * number into are submitted — an untouched line is not "counted zero", it is
 * "not counted", and the API leaves it alone. What comes back is the gap: the
 * surplus, the shortage, and the shrinkage the shortage cost.
 */
export function StocktakePage() {
    const toast = useToast()
    const { data: warehouses, isLoading: loadingWarehouses } = useWarehouses()

    const [warehouseId, setWarehouseId] = useState<number | null>(null)
    const [search, setSearch] = useState('')
    const [note, setNote] = useState('')
    // item_id → the raw string the user typed, so an empty box stays "uncounted".
    const [counts, setCounts] = useState<Record<number, string>>({})
    const [result, setResult] = useState<StocktakeSummary | null>(null)

    const { data: sheet, isLoading: loadingSheet } = useStocktakeSheet(warehouseId)
    const commit = useStocktakeCommit()

    const chooseWarehouse = (id: number | null) => {
        setWarehouseId(id)
        // A fresh sheet starts fresh: last warehouse's counts do not carry over.
        setCounts({})
        setNote('')
    }

    const lines = useMemo(() => {
        const term = search.trim().toLowerCase()
        const items = sheet?.items ?? []

        if (!term) return items

        return items.filter(
            (line) =>
                line.name.toLowerCase().includes(term) ||
                (line.sku ?? '').toLowerCase().includes(term),
        )
    }, [sheet, search])

    // Only counted lines count. A blank box is skipped entirely.
    const counted = useMemo(
        () =>
            (sheet?.items ?? [])
                .map((line) => {
                    const raw = counts[line.item_id]
                    if (raw === undefined || raw.trim() === '') return null

                    const qty = Number(raw)
                    if (!Number.isFinite(qty) || qty < 0) return null

                    return { line, qty }
                })
                .filter((entry): entry is { line: StocktakeSheetLine; qty: number } =>
                    entry !== null,
                ),
        [sheet, counts],
    )

    // A running preview of the gap, so the count is not a leap of faith.
    const preview = useMemo(() => {
        let surplus = 0
        let shortage = 0

        for (const { line, qty } of counted) {
            const diff = qty - line.book_qty
            const value = Math.abs(diff) * line.unit_cost
            if (diff > 0) surplus += value
            else if (diff < 0) shortage += value
        }

        return { lines: counted.length, surplus, shortage, net: surplus - shortage }
    }, [counted])

    const submit = async () => {
        if (!warehouseId || !counted.length) return

        try {
            const summary = await commit.mutateAsync({
                warehouse_id: warehouseId,
                note: note.trim() || undefined,
                counts: counted.map(({ line, qty }) => ({ item_id: line.item_id, counted_qty: qty })),
            })
            setResult(summary)
            setCounts({})
            setNote('')
            toast.success('تم اعتماد الجرد.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر اعتماد الجرد.'))
        }
    }

    return (
        <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <Field label="المخزن">
                    <Select
                        value={warehouseId ?? ''}
                        onChange={(event) =>
                            chooseWarehouse(event.target.value ? Number(event.target.value) : null)
                        }
                        disabled={loadingWarehouses}
                    >
                        <option value="">اختر المخزن للجرد…</option>
                        {warehouses?.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                                {warehouse.holder ? ` — ${warehouse.holder}` : ''}
                            </option>
                        ))}
                    </Select>
                </Field>

                {warehouseId && (
                    <Field label="بحث">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="ابحث بالاسم أو الكود…"
                                className="pr-10"
                            />
                        </div>
                    </Field>
                )}
            </div>

            {!warehouseId ? (
                <EmptyState
                    icon={WarehouseIcon}
                    title="اختر مخزنًا لبدء الجرد"
                    description="سيظهر لك كل صنف مع رصيد الدفاتر، وتُدخل الكمية الفعلية على الرف."
                />
            ) : loadingSheet ? (
                <SkeletonCard />
            ) : !lines.length ? (
                <EmptyState icon={ClipboardCheck} title="لا توجد أصناف مطابقة" />
            ) : (
                <>
                    {/* Header row — hidden on phones, where each card labels itself. */}
                    <div className="hidden px-4 pb-2 text-[11px] font-bold text-navy-400 sm:grid sm:grid-cols-[1fr_auto_auto_auto] sm:gap-4">
                        <span>الصنف</span>
                        <span className="w-24 text-center">رصيد الدفاتر</span>
                        <span className="w-28 text-center">الفعلي</span>
                        <span className="w-24 text-left">الفرق</span>
                    </div>

                    <div className="space-y-2">
                        {lines.map((line) => {
                            const raw = counts[line.item_id] ?? ''
                            const hasCount = raw.trim() !== ''
                            const qty = Number(raw)
                            const valid = hasCount && Number.isFinite(qty) && qty >= 0
                            const diff = valid ? qty - line.book_qty : 0

                            return (
                                <div
                                    key={line.item_id}
                                    className="card grid grid-cols-2 items-center gap-3 p-3.5 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-4"
                                >
                                    <div className="col-span-2 min-w-0 sm:col-span-1">
                                        <p className="truncate text-sm font-bold text-navy-900">
                                            {line.name}
                                        </p>
                                        <p className="tabular text-[11px] text-navy-400">
                                            {line.sku ?? '—'}
                                            {line.unit ? ` · ${line.unit}` : ''}
                                            {` · ${formatMoney(line.unit_cost)}`}
                                        </p>
                                    </div>

                                    <div className="tabular text-center text-sm text-navy-500 sm:w-24">
                                        <span className="text-[10px] text-navy-400 sm:hidden">دفتري: </span>
                                        {formatQty(line.book_qty)}
                                    </div>

                                    <div className="sm:w-28">
                                        <Input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            step="any"
                                            value={raw}
                                            onChange={(event) =>
                                                setCounts((current) => ({
                                                    ...current,
                                                    [line.item_id]: event.target.value,
                                                }))
                                            }
                                            placeholder="—"
                                            className="text-center"
                                        />
                                    </div>

                                    <div className="tabular text-left text-sm font-bold sm:w-24">
                                        {valid && diff !== 0 ? (
                                            <span
                                                className={clsx(
                                                    diff > 0 ? 'text-emerald-600' : 'text-red-600',
                                                )}
                                            >
                                                {diff > 0 ? '+' : ''}
                                                {formatQty(diff)}
                                            </span>
                                        ) : (
                                            <span className="text-navy-300">—</span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Commit bar — sticks to the bottom so the count is one reach away
                        however far the sheet scrolls. */}
                    <div className="sticky bottom-24 z-10 mt-4 lg:bottom-6">
                        <div className="card flex flex-wrap items-center gap-3 p-3.5 shadow-lg ring-1 ring-navy-100">
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-navy-400">
                                    {preview.lines
                                        ? `${preview.lines} صنف مجرود · صافي الفرق`
                                        : 'لم تُدخل أي كمية بعد'}
                                </p>
                                {Boolean(preview.lines) && (
                                    <p
                                        className={clsx(
                                            'tabular text-sm font-extrabold',
                                            preview.net > 0
                                                ? 'text-emerald-600'
                                                : preview.net < 0
                                                  ? 'text-red-600'
                                                  : 'text-navy-900',
                                        )}
                                    >
                                        {preview.net > 0 ? '+' : ''}
                                        {formatMoney(preview.net)}
                                    </p>
                                )}
                            </div>

                            <Button
                                icon={Save}
                                disabled={!preview.lines}
                                loading={commit.isPending}
                                onClick={submit}
                            >
                                اعتماد الجرد
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4">
                        <Field label="ملاحظة (اختياري)" hint="تُحفظ مع كل تسوية نتجت عن هذا الجرد">
                            <Textarea
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                rows={2}
                                placeholder="سبب الفروق، اسم لجنة الجرد…"
                            />
                        </Field>
                    </div>
                </>
            )}

            {result && <ResultModal summary={result} onClose={() => setResult(null)} />}
        </>
    )
}

function ResultModal({ summary, onClose }: { summary: StocktakeSummary; onClose: () => void }) {
    return (
        <Modal open onClose={onClose} title="نتيجة الجرد" size="sm">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Cell label="أصناف مجرودة" value={String(summary.counted)} />
                    <Cell label="بنود سُوّيت" value={String(summary.adjusted)} />
                    <Cell
                        label="زيادة"
                        value={`+${formatQty(summary.surplus_qty)}`}
                        sub={formatMoney(summary.surplus_value)}
                        tone="up"
                    />
                    <Cell
                        label="عجز (هالك)"
                        value={`-${formatQty(summary.shortage_qty)}`}
                        sub={formatMoney(summary.shrinkage_value)}
                        tone="down"
                    />
                </div>

                <div className="rounded-2xl bg-navy-50 p-4 text-center">
                    <p className="text-[11px] font-bold text-navy-400">صافي أثر الجرد</p>
                    <p
                        className={clsx(
                            'tabular mt-1 text-xl font-extrabold',
                            summary.net_value > 0
                                ? 'text-emerald-600'
                                : summary.net_value < 0
                                  ? 'text-red-600'
                                  : 'text-navy-900',
                        )}
                    >
                        {summary.net_value > 0 ? '+' : ''}
                        {formatMoney(summary.net_value)}
                    </p>
                </div>

                <Button className="w-full" onClick={onClose}>
                    تم
                </Button>
            </div>
        </Modal>
    )
}

function Cell({
    label,
    value,
    sub,
    tone,
}: {
    label: string
    value: string
    sub?: string
    tone?: 'up' | 'down'
}) {
    return (
        <div className="rounded-2xl border border-navy-100 p-3">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular mt-0.5 text-lg font-extrabold',
                    tone === 'up'
                        ? 'text-emerald-600'
                        : tone === 'down'
                          ? 'text-red-600'
                          : 'text-navy-900',
                )}
            >
                {value}
            </p>
            {sub && <p className="tabular text-[11px] text-navy-400">{sub}</p>}
        </div>
    )
}

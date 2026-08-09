import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { ClipboardList, PackageSearch, Printer, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EMPTY_RANGE, MonthDayFilter, monthDayRange } from '@/components/MonthDayFilter'
import type { DateRange } from '@/components/MonthDayFilter'
import { EmptyState, SkeletonCard } from '@/components/ui'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { formatMoney, formatQty, MOVEMENT_TYPE, MOVEMENT_TYPE_FALLBACK } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useMovements } from '@/lib/queries'

/** The audit trail: every movement, newest first. */
export function MovementsPage() {
    const { path } = useArea()
    const [searchParams] = useSearchParams()
    const itemId = searchParams.get('item_id') ?? ''
    const [month, setMonth] = useState('')
    const [day, setDay] = useState('')
    const [range, setRange] = useState<DateRange>(EMPTY_RANGE)
    const [view, setView] = useViewMode('movements')

    const { data, isLoading } = useMovements({
        per_page: 50,
        ...(itemId ? { item_id: itemId } : {}),
        ...monthDayRange(month, day, range),
    })

    return (
        <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <MonthDayFilter
                    month={month}
                    day={day}
                    range={range}
                    onMonth={setMonth}
                    onDay={setDay}
                    onRange={setRange}
                />
                <Link
                    to={`${path('/print/movements')}?${new URLSearchParams({
                        ...(month ? { month } : {}),
                        ...(day ? { day } : {}),
                        ...(itemId ? { item_id: itemId } : {}),
                    }).toString()}`}
                    target="_blank"
                    className="btn-secondary"
                >
                    <Printer className="size-4" />
                    {tr('طباعة')}
                </Link>

                <ViewToggle view={view} onChange={setView} className="mb-0.5" />
            </div>

            {itemId && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 ring-1 ring-brand-100">
                    <PackageSearch className="size-4" />
                    <span>
                        حركة الصنف المحدد
                        {data?.data[0]?.item?.name ? `: ${data.data[0].item.name}` : ''}
                    </span>
                    <Link
                        to={path('/inventory/movements')}
                        className="tap mr-auto grid place-items-center rounded-lg p-1.5 text-brand-500 transition hover:bg-white hover:text-brand-800"
                        aria-label="إلغاء فلتر الصنف"
                        title="إلغاء فلتر الصنف"
                    >
                        <X className="size-4" />
                    </Link>
                </div>
            )}

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState icon={ClipboardList} title="لا توجد حركات في هذه الفترة" />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="54rem"
                    headers={[
                        { label: tr('النوع'), className: 'w-28' },
                        'الصنف',
                        'من / إلى',
                        { label: tr('الكمية'), className: 'w-24' },
                        { label: tr('القيمة'), className: 'w-28' },
                        { label: tr('المستند'), className: 'w-28' },
                        { label: tr('التاريخ'), className: 'w-36' },
                    ]}
                >
                    {data.data.map((movement) => {
                        const meta = MOVEMENT_TYPE[movement.type] ?? MOVEMENT_TYPE_FALLBACK

                        return (
                            <tr
                                key={movement.id}
                                className="border-t border-navy-100 hover:bg-navy-50/60"
                            >
                                <td className="px-3 py-2.5">
                                    <span className={clsx('badge', meta.chip)}>
                                        {movement.type_label}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 font-semibold text-navy-800">
                                    {movement.item?.name ?? '—'}
                                </td>
                                <td className="px-3 py-2.5 text-navy-600">
                                    {[movement.from, movement.to].filter(Boolean).join(' ← ') || '—'}
                                    {movement.supplier && (
                                        <span className="block text-[11px] text-navy-400">
                                            {movement.supplier}
                                        </span>
                                    )}
                                </td>
                                <td className="tabular px-3 py-2.5 font-bold text-navy-800">
                                    {meta.sign}
                                    {formatQty(movement.qty)}
                                </td>
                                <td className="tabular px-3 py-2.5 text-navy-600">
                                    {formatMoney(movement.value)}
                                </td>
                                <td className="tabular px-3 py-2.5 text-[11px] text-navy-500">
                                    {movement.task_code ?? '—'}
                                </td>
                                <td className="tabular px-3 py-2.5 text-[11px] text-navy-500">
                                    {formatSmart(movement.created_at)}
                                    <span className="block text-navy-400">{movement.actor}</span>
                                </td>
                            </tr>
                        )
                    })}
                </DataTable>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {data.data.map((movement) => {
                const meta = MOVEMENT_TYPE[movement.type] ?? MOVEMENT_TYPE_FALLBACK

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
            )}
        </>
    )
}

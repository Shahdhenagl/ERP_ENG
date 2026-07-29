import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DocumentShell } from '@/components/DocumentShell'
import { monthDayRange } from '@/components/MonthDayFilter'
import { PageLoader } from '@/components/ui'
import { formatMoney, formatQty, MOVEMENT_TYPE, MOVEMENT_TYPE_FALLBACK } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useMovements } from '@/lib/queries'

const MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function periodLabel(params: URLSearchParams): string {
    const month = params.get('month')
    const day = params.get('day')
    if (day) return formatDate(day)
    if (month) {
        const [y, m] = month.split('-').map(Number)
        return `${MONTHS[m - 1]} ${y}`
    }
    return 'كل الحركات'
}

/** The stock movement log, printed for the chosen month or day. */
export function MovementListPrint() {
    const [params] = useSearchParams()

    const filters = useMemo(() => {
        const month = params.get('month') ?? ''
        const day = params.get('day') ?? ''
        const range = { from: params.get('from') ?? '', to: params.get('to') ?? '' }

        return { ...monthDayRange(month, day, range), per_page: '1000' }
    }, [params])

    const { data, isLoading } = useMovements(filters)

    if (isLoading || !data) return <PageLoader />

    const movements = data.data

    return (
        <DocumentShell
            title="سجل حركة المخزون"
            subtitle={periodLabel(params)}
            footer={<p>عدد الحركات: {movements.length}</p>}
        >
            {movements.length === 0 ? (
                <p className="rounded-lg bg-navy-50 p-4 text-center text-[13px] text-navy-500">
                    لا توجد حركات في هذه الفترة.
                </p>
            ) : (
                <table className="doc-table">
                    <thead>
                        <tr>
                            <th className="w-24">التاريخ</th>
                            <th className="w-24">النوع</th>
                            <th>الصنف</th>
                            <th>من / إلى</th>
                            <th className="w-20 text-left">الكمية</th>
                            <th className="w-28 text-left">القيمة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {movements.map((movement) => {
                            const meta = MOVEMENT_TYPE[movement.type] ?? MOVEMENT_TYPE_FALLBACK

                            return (
                                <tr key={movement.id}>
                                    <td className="tabular text-navy-500">
                                        {movement.created_at ? formatDate(movement.created_at) : '—'}
                                    </td>
                                    <td className="text-navy-600">{movement.type_label}</td>
                                    <td className="text-navy-700">{movement.item?.name ?? '—'}</td>
                                    <td className="text-[11px] text-navy-500">
                                        {movement.from && `من ${movement.from}`}
                                        {movement.from && movement.to && ' ← '}
                                        {movement.to && `إلى ${movement.to}`}
                                        {movement.supplier && ` · ${movement.supplier}`}
                                    </td>
                                    <td className="tabular text-left font-semibold text-navy-900">
                                        {meta.sign}
                                        {formatQty(movement.qty)}
                                    </td>
                                    <td className="tabular text-left text-navy-600">
                                        {formatMoney(movement.value)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}
        </DocumentShell>
    )
}

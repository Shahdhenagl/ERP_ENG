import { useTaskMovementsReport } from '@/lib/queries'
import { useReports } from './ReportsLayout'
import { Empty, Section } from './parts'
import { SkeletonCard } from '@/components/ui'

interface TaskMovementRow {
    id: number
    task_code: string
    task_title: string
    customer: string
    branch: string
    from_status: string
    from_status_label: string
    to_status: string
    to_status_label: string
    user: string
    created_at: string
    note: string | null
}

export function TaskMovementsReportPage() {
    const { period } = useReports()
    const { data, isLoading } = useTaskMovementsReport(period.range)

    if (isLoading) return <SkeletonCard />
    if (!data?.length) return <Empty>لا توجد حركات مهام في هذه الفترة.</Empty>

    return (
        <Section title="سجل الحركات" count={data.length}>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                    <thead className="bg-navy-50 text-navy-400 font-bold border-b border-navy-100">
                        <tr>
                            <th className="px-3 py-2">المهمة</th>
                            <th className="px-3 py-2">العميل</th>
                            <th className="px-3 py-2">الفرع</th>
                            <th className="px-3 py-2">من حالة</th>
                            <th className="px-3 py-2">إلى حالة</th>
                            <th className="px-3 py-2">بواسطة</th>
                            <th className="px-3 py-2">التاريخ والوقت</th>
                            <th className="px-3 py-2">ملاحظات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-50">
                        {data.map((row: TaskMovementRow) => (
                            <tr key={row.id} className="hover:bg-navy-50/50 transition-colors">
                                <td className="px-3 py-2">
                                    <div className="font-bold text-navy-900">{row.task_code}</div>
                                    <div className="text-[11px] text-navy-400">{row.task_title}</div>
                                </td>
                                <td className="px-3 py-2 text-navy-700">{row.customer}</td>
                                <td className="px-3 py-2 text-navy-700">{row.branch}</td>
                                <td className="px-3 py-2 font-semibold text-navy-600">{row.from_status_label}</td>
                                <td className="px-3 py-2 font-semibold text-brand-600">{row.to_status_label}</td>
                                <td className="px-3 py-2 text-navy-700">{row.user}</td>
                                <td className="px-3 py-2 text-navy-600 whitespace-nowrap" dir="ltr">
                                    {row.created_at}
                                </td>
                                <td className="px-3 py-2 text-navy-500 text-xs">{row.note ?? '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Section>
    )
}

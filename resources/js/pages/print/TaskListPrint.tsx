import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DocumentShell } from '@/components/DocumentShell'
import { monthDayRange } from '@/components/MonthDayFilter'
import { PageLoader } from '@/components/ui'
import { PRIORITY, STATUS, TASK_TYPE } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useTasks } from '@/lib/queries'

const MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/** A human line describing the filters the printed list was drawn under. */
function filterSummary(params: URLSearchParams): string {
    const parts: string[] = []
    const status = params.get('status')
    const type = params.get('type')
    const priority = params.get('priority')
    const month = params.get('month')
    const day = params.get('day')

    if (params.get('open_only')) parts.push('المفتوحة')
    if (status && STATUS[status as keyof typeof STATUS]) parts.push(STATUS[status as keyof typeof STATUS].label)
    if (type && TASK_TYPE[type as keyof typeof TASK_TYPE]) parts.push(TASK_TYPE[type as keyof typeof TASK_TYPE].label)
    if (priority && PRIORITY[priority as keyof typeof PRIORITY]) parts.push(PRIORITY[priority as keyof typeof PRIORITY].label)
    if (day) parts.push(formatDate(day))
    else if (month) {
        const [y, m] = month.split('-').map(Number)
        parts.push(`${MONTHS[m - 1]} ${y}`)
    }
    if (params.get('search')) parts.push(`بحث: ${params.get('search')}`)

    return parts.length ? parts.join(' · ') : 'كل المهام'
}

/** The task list, printed under whatever filters it was viewed with. */
export function TaskListPrint() {
    const [params] = useSearchParams()

    const filters = useMemo(() => {
        const entries = Object.fromEntries(params.entries())
        const { month, day, from, to, page, ...rest } = entries

        return {
            ...rest,
            ...monthDayRange(month ?? '', day ?? '', { from: from ?? '', to: to ?? '' }),
            per_page: '1000',
        }
    }, [params])

    const { data, isLoading } = useTasks(filters)

    if (isLoading || !data) return <PageLoader />

    const tasks = data.data

    return (
        <DocumentShell
            title="قائمة المهام"
            subtitle={filterSummary(params)}
            footer={<p>عدد المهام: {tasks.length}</p>}
        >
            {tasks.length === 0 ? (
                <p className="rounded-lg bg-navy-50 p-4 text-center text-[13px] text-navy-500">
                    لا توجد مهام مطابقة.
                </p>
            ) : (
                <table className="doc-table">
                    <thead>
                        <tr>
                            <th className="w-20">الكود</th>
                            <th>المهمة والعميل</th>
                            <th className="w-24">النوع</th>
                            <th className="w-20">الأولوية</th>
                            <th className="w-24">الحالة</th>
                            <th className="w-28">الفني</th>
                            <th className="w-24">الموعد</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map((task) => (
                            <tr key={task.id}>
                                <td className="tabular text-navy-600">{task.code}</td>
                                <td>
                                    <span className="font-semibold text-navy-800">{task.title}</span>
                                    {task.customer && (
                                        <span className="block text-[11px] text-navy-400">
                                            {task.customer.name}
                                        </span>
                                    )}
                                </td>
                                <td className="text-navy-600">{task.type_label}</td>
                                <td className="text-navy-600">{task.priority_label}</td>
                                <td className="text-navy-600">{task.status_label}</td>
                                <td className="text-navy-600">{task.technicians?.length ? task.technicians.map((t: any) => t.name).join('، ') : '—'}</td>
                                <td className="tabular text-navy-600">
                                    {task.scheduled_at ? formatDate(task.scheduled_at) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </DocumentShell>
    )
}

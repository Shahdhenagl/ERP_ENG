import { useQuery } from '@tanstack/react-query'
import { tr } from '@/lib/i18n'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { LoadingState } from '@/components/LoadingState'
import { getReport } from '@/lib/queries'
import { useReports } from './ReportsLayout'
import { TaskStatusBadge } from '@/components/TaskStatusBadge'

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

export default function TaskMovementsReportPage() {
    const { period } = useReports()

    const { data, isLoading } = useQuery({
        queryKey: ['report', 'task-movements', period.range],
        queryFn: () => getReport<TaskMovementRow[]>('task-movements', period.range),
    })

    if (isLoading) return <LoadingState />
    if (!data?.length) return <EmptyState text="لا توجد حركات مهام في هذه الفترة." />

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>المهمة</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>الفرع</TableHead>
                    <TableHead>من حالة</TableHead>
                    <TableHead>إلى حالة</TableHead>
                    <TableHead>بواسطة</TableHead>
                    <TableHead>التاريخ والوقت</TableHead>
                    <TableHead>ملاحظات</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map(row => (
                    <TableRow key={row.id}>
                        <TableCell>
                            <div className="font-medium">{row.task_code}</div>
                            <div className="text-xs text-muted-foreground">{row.task_title}</div>
                        </TableCell>
                        <TableCell>{row.customer}</TableCell>
                        <TableCell>{row.branch}</TableCell>
                        <TableCell>
                            <TaskStatusBadge status={row.from_status as any} />
                        </TableCell>
                        <TableCell>
                            <TaskStatusBadge status={row.to_status as any} />
                        </TableCell>
                        <TableCell>{row.user}</TableCell>
                        <TableCell className="whitespace-nowrap" dir="ltr">
                            {row.created_at}
                        </TableCell>
                        <TableCell>{row.note ?? '-'}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

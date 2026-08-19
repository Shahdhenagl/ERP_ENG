import clsx from 'clsx'
import { useParams, useSearchParams } from 'react-router-dom'
import { DocumentParty, DocumentShell, DocumentTotals } from '@/components/DocumentShell'
import { ErrorState, PageLoader } from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/format'
import { useCustomerTasks } from '@/lib/queries'

/** Job-status colours, matched to the on-screen history. */
const STATUS_TEXT: Record<string, string> = {
    completed: 'text-emerald-700',
    cancelled: 'text-red-700',
    in_progress: 'text-amber-700',
}

/**
 * A customer's maintenance history over a date window — what was done, when, by
 * whom — the sheet handed to the customer or filed with the contract.
 */
export function CustomerTasksPrint() {
    const { id } = useParams<{ id: string }>()
    const [params] = useSearchParams()

    const { data, isLoading, isError, refetch } = useCustomerTasks(id, {
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
    })

    if (isError) return <ErrorState message="تعذّر تحميل تقرير المهام." onRetry={() => void refetch()} />
    if (isLoading || !data) return <PageLoader />

    const { meta, data: rows } = data

    const period = [meta.from && `من ${formatDate(meta.from)}`, meta.to && `حتى ${formatDate(meta.to)}`]
        .filter(Boolean)
        .join(' ')

    return (
        <DocumentShell title="تقرير حركات المهام" subtitle={period || 'منذ بداية التعامل'}>
            <DocumentParty
                heading="العميل"
                rows={[
                    ['الاسم', meta.customer.name],
                    ['الشركة', meta.customer.company],
                    ['الكود', meta.customer.code],
                    ['الهاتف', meta.customer.phone],
                    ['العنوان', meta.customer.address],
                ]}
            />

            {rows.length === 0 ? (
                <p className="doc-keep mt-6 rounded-lg bg-navy-50 p-4 text-center text-[13px] text-navy-400">
                    لا توجد مهام في هذه الفترة.
                </p>
            ) : (
                <table className="doc-table mt-5">
                    <thead>
                        <tr>
                            <th className="w-24">الكود</th>
                            <th>المهمة</th>
                            <th className="w-28">العميل</th>
                            <th className="w-28">الجهاز</th>
                            <th className="w-24">الفرع</th>
                            <th className="w-20">الموعد</th>
                            <th className="w-24">بداية التنفيذ</th>
                            <th className="w-24">انتهاء التنفيذ</th>
                            <th className="w-20">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((task) => (
                            <tr key={task.id}>
                                <td className="tabular text-navy-600">{task.code}</td>
                                <td className="text-navy-700">
                                    {task.title ?? task.type_label}
                                    <span className="block text-[11px] text-navy-400">
                                        {task.type_label}
                                        {task.technician ? ` · ${task.technician}` : ''}
                                    </span>
                                </td>
                                <td className="text-navy-600">{task.customer ?? '—'}</td>
                                <td className="text-navy-600">{task.asset ?? '—'}</td>
                                <td className="text-navy-600">{task.branch ?? '—'}</td>
                                <td className="tabular text-navy-600">
                                    {task.date ? formatDate(task.date) : '—'}
                                </td>
                                <td className="tabular text-navy-600">
                                    {task.started_at ? formatDateTime(task.started_at) : '—'}
                                </td>
                                <td className="tabular text-navy-600">
                                    {task.completed_at ? formatDateTime(task.completed_at) : '—'}
                                </td>
                                <td className={clsx('font-bold', STATUS_TEXT[task.status] ?? 'text-navy-700')}>
                                    {task.status_label}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <DocumentTotals
                rows={[
                    ['إجمالي المهام', String(meta.total)],
                    ['منتهية', String(meta.completed)],
                ]}
                total={String(meta.open)}
                totalLabel="مهام مفتوحة"
            />
        </DocumentShell>
    )
}

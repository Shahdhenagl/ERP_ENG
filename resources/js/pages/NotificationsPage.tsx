import clsx from 'clsx'
import { CheckCheck, Inbox } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { formatRelative } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useMarkAllRead, useMarkNotificationRead, useNotifications } from '@/lib/queries'

/**
 * The full notification history — the standing list behind the bell's quick
 * peek. Filter to the unread, open one to jump to what it points at (which
 * clears it), or mark the whole lot read.
 */
export function NotificationsPage() {
    const { data, isLoading } = useNotifications()
    const markAll = useMarkAllRead()
    const markRead = useMarkNotificationRead()
    const navigate = useNavigate()
    const { path } = useArea()

    const [unreadOnly, setUnreadOnly] = useState(false)

    const notifications = data?.data ?? []
    const unread = data?.meta.unread_count ?? 0

    const rows = useMemo(
        () => (unreadOnly ? notifications.filter((n) => !n.read_at) : notifications),
        [notifications, unreadOnly],
    )

    const open = (id: string, url: string | null) => {
        markRead.mutate(id)
        if (url) navigate(path(url))
    }

    return (
        <>
            <PageHeader
                title="التنبيهات"
                subtitle={unread ? `${unread} غير مقروء` : 'كل شيء مقروء'}
                actions={
                    notifications.length > 0 && unread > 0 ? (
                        <Button
                            variant="secondary"
                            icon={CheckCheck}
                            loading={markAll.isPending}
                            onClick={() => markAll.mutate()}
                        >
                            تعليم الكل كمقروء
                        </Button>
                    ) : undefined
                }
            />

            <div className="mb-4 flex gap-1 rounded-xl bg-navy-100 p-1">
                {(
                    [
                        [false, 'الكل'],
                        [true, `غير المقروء${unread ? ` (${unread})` : ''}`],
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={String(value)}
                        onClick={() => setUnreadOnly(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                            unreadOnly === value ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={Inbox}
                    title={unreadOnly ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات بعد'}
                />
            ) : (
                <div className="space-y-2">
                    {rows.map((notification) => {
                        const url = notification.data.url
                            ? notification.data.url
                            : notification.data.task_id
                              ? `/tasks/${notification.data.task_id}`
                              : null

                        return (
                            <button
                                key={notification.id}
                                onClick={() => open(notification.id, url)}
                                className={clsx(
                                    'block w-full rounded-2xl border p-3.5 text-right transition',
                                    notification.read_at
                                        ? 'border-navy-100 bg-white hover:bg-navy-50'
                                        : 'border-brand-200 bg-brand-50/60 hover:bg-brand-50',
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    {!notification.read_at && (
                                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-navy-900">
                                            {notification.data.code && (
                                                <span className="tabular text-brand-600">
                                                    {notification.data.code}{' '}
                                                </span>
                                            )}
                                            {notification.data.title ?? 'إشعار'}
                                        </p>
                                        {notification.data.actor && (
                                            <p className="mt-0.5 text-xs text-navy-500">
                                                بواسطة {notification.data.actor}
                                            </p>
                                        )}
                                        <p className="mt-1 text-[11px] text-navy-400">
                                            {formatRelative(notification.created_at)}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}
        </>
    )
}

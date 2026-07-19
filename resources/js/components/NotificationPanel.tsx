import clsx from 'clsx'
import { BellOff, BellRing, CheckCheck, Inbox } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Button, EmptyState, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { formatRelative } from '@/lib/format'
import { enablePush, isIos, isStandalone, pushPermission } from '@/lib/push'
import { useMarkAllRead, useNotifications } from '@/lib/queries'

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { data, isLoading } = useNotifications()
    const markAllRead = useMarkAllRead()
    const navigate = useNavigate()
    const toast = useToast()

    const [permission, setPermission] = useState(pushPermission())
    const [enabling, setEnabling] = useState(false)

    useEffect(() => {
        if (open) setPermission(pushPermission())
    }, [open])

    const handleEnablePush = async () => {
        setEnabling(true)

        try {
            const result = await enablePush()

            if (result.ok) {
                toast.success('تم تفعيل الإشعارات على هذا الجهاز.')
                setPermission('granted')
            } else {
                toast.error(result.reason ?? 'تعذّر تفعيل الإشعارات.')
            }
        } finally {
            setEnabling(false)
        }
    }

    const notifications = data?.data ?? []
    const unread = data?.meta.unread_count ?? 0

    // iOS refuses to expose the Push API until the app is installed.
    const needsInstallFirst = isIos() && !isStandalone()

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="الإشعارات"
            description={unread ? `${unread} إشعار غير مقروء` : 'لا توجد إشعارات غير مقروءة'}
            footer={
                notifications.length > 0 && (
                    <Button
                        variant="secondary"
                        icon={CheckCheck}
                        loading={markAllRead.isPending}
                        onClick={() => markAllRead.mutate()}
                    >
                        تعليم الكل كمقروء
                    </Button>
                )
            }
        >
            {/* Push opt-in prompt */}
            {permission !== 'granted' && (
                <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-white">
                            <BellRing className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-navy-900">فعّل إشعارات الجهاز</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-navy-500">
                                {needsInstallFirst
                                    ? 'من قائمة المشاركة في Safari اختر «إضافة إلى الشاشة الرئيسية»، ثم افتح التطبيق وفعّل الإشعارات.'
                                    : 'استقبل تنبيهًا فوريًا بالمهام الجديدة حتى والتطبيق مغلق.'}
                            </p>
                            {!needsInstallFirst && permission !== 'denied' && (
                                <Button
                                    className="mt-3"
                                    icon={BellRing}
                                    loading={enabling}
                                    onClick={handleEnablePush}
                                >
                                    تفعيل الآن
                                </Button>
                            )}
                            {permission === 'denied' && (
                                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                                    <BellOff className="size-3.5" />
                                    الإشعارات محظورة — فعّلها من إعدادات المتصفح.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center py-10">
                    <Spinner />
                </div>
            ) : notifications.length === 0 ? (
                <EmptyState icon={Inbox} title="لا توجد إشعارات بعد" />
            ) : (
                <ul className="space-y-2">
                    {notifications.map((notification) => (
                        <li key={notification.id}>
                            <button
                                onClick={() => {
                                    if (notification.data.task_id) {
                                        navigate(`/tasks/${notification.data.task_id}`)
                                        onClose()
                                    }
                                }}
                                className={clsx(
                                    'w-full rounded-xl border p-3 text-right transition',
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
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    )
}

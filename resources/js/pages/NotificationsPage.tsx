import clsx from 'clsx'
import {
    AlertTriangle,
    BadgeCheck,
    CalendarClock,
    CheckCircle2,
    Package,
    Receipt,
    ShieldAlert,
    Wrench,
    type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { useArea } from '@/lib/nav'
import { useOperationsAlerts } from '@/lib/queries'

/** Each group's icon and accent — the bell keeps the ordinary history. */
const GROUP: Record<string, { icon: LucideIcon; accent: string; chip: string }> = {
    stock: { icon: Package, accent: 'text-amber-600', chip: 'bg-amber-50 text-amber-700' },
    tasks: { icon: Wrench, accent: 'text-red-600', chip: 'bg-red-50 text-red-700' },
    maintenance: { icon: CalendarClock, accent: 'text-brand-600', chip: 'bg-brand-50 text-brand-700' },
    warranties: { icon: ShieldAlert, accent: 'text-violet-600', chip: 'bg-violet-50 text-violet-700' },
    finance: { icon: Receipt, accent: 'text-red-600', chip: 'bg-red-50 text-red-700' },
    approvals: { icon: BadgeCheck, accent: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700' },
}

/**
 * The operational alerts board — the standing conditions that need acting on:
 * stock shortages, urgent and delayed jobs, maintenance and contract deadlines,
 * warranties lapsing, money overdue, and anything waiting on a sign-off.
 *
 * This is deliberately NOT the bell. The bell keeps the ordinary notification
 * history; this reads the live conditions, grouped, and refreshes on its own.
 */
export function NotificationsPage() {
    const { path } = useArea()
    const { data, isLoading } = useOperationsAlerts()

    const groups = data?.groups ?? []
    const total = data?.total ?? 0

    return (
        <>
            <PageHeader
                title="التنبيهات"
                subtitle={
                    total ? `${total} تنبيه يحتاج إجراء` : 'لا توجد تنبيهات تشغيلية حاليًا'
                }
            />

            {isLoading ? (
                <div className="space-y-3">
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            ) : groups.length === 0 ? (
                <EmptyState
                    icon={CheckCircle2}
                    title="كل شيء تحت السيطرة"
                    description="لا نواقص مخزون ولا مهام متأخرة ولا مستحقات فائتة ولا طلبات تنتظر الاعتماد."
                />
            ) : (
                <div className="space-y-5">
                    {groups.map((group) => {
                        const meta = GROUP[group.key] ?? {
                            icon: AlertTriangle,
                            accent: 'text-navy-500',
                            chip: 'bg-navy-100 text-navy-600',
                        }
                        const Icon = meta.icon

                        return (
                            <section key={group.key}>
                                <div className="mb-2 flex items-center gap-2">
                                    <Icon className={clsx('size-4', meta.accent)} />
                                    <h2 className="text-sm font-bold text-navy-800">{group.label}</h2>
                                    <span className={clsx('tabular badge', meta.chip)}>{group.count}</span>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {group.items.map((item, index) => (
                                        <Link
                                            key={`${group.key}-${index}`}
                                            to={path(item.url)}
                                            className="flex items-start gap-3 rounded-2xl border border-navy-100 bg-surface p-3.5 transition hover:bg-navy-50"
                                        >
                                            <span
                                                className={clsx(
                                                    'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                                                    meta.chip,
                                                )}
                                            >
                                                <Icon className="size-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-navy-900">{item.title}</p>
                                                <p className="tabular mt-0.5 truncate text-xs text-navy-500">
                                                    {item.body}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )
                    })}
                </div>
            )}
        </>
    )
}

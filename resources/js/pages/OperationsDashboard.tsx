import {
    Activity,
    BatteryCharging,
    CalendarClock,
    HardDrive,
    Package,
    Wrench,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useOperations } from '@/lib/queries'

/**
 * The standby-power estate, folded into the main dashboard: the devices and how
 * they are, their batteries, the maintenance due, the work in flight, how the
 * service is performing, and the parts on the shelf. Every figure is read from
 * the module that owns it — this only gathers them.
 */
export function OperationsOverview() {
    const { path } = useArea()
    const { data, isLoading } = useOperations()

    if (isLoading || !data) {
        return (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
        )
    }

    const d = data.devices
    const b = data.battery
    const p = data.performance

    return (
        <>
            {/* ── Devices ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile icon={HardDrive} label="إجمالي الأجهزة" value={d.total} tone="brand" />
                <Tile icon={Activity} label="أجهزة عاملة" value={d.working} tone="up" />
                <Tile
                    icon={Wrench}
                    label="متوقفة / تحت الإصلاح"
                    value={d.stopped}
                    tone={d.stopped ? 'down' : 'slate'}
                    hint={`${d.under_repair} إصلاح · ${d.retired} خارج الخدمة`}
                />
                <Tile
                    icon={CalendarClock}
                    label="صيانة دورية متأخرة"
                    value={data.maintenance.overdue}
                    tone={data.maintenance.overdue ? 'warn' : 'up'}
                    hint={`${data.maintenance.upcoming} قادمة خلال ٣٠ يوم`}
                />
            </div>

            {/* ── Batteries ─────────────────────────────────── */}
            <Section title="حالة البطاريات" icon={BatteryCharging}>
                <div className="grid grid-cols-3 gap-3">
                    <Stat label="جيدة" value={b.good} tone="up" />
                    <Stat label="تحتاج فحص" value={b.need_check} tone="warn" hint="لم تُفحص بعد" />
                    <Stat label="تحتاج استبدال" value={b.need_replacement} tone="down" />
                </div>
            </Section>

            {/* ── Requests + performance ────────────────────── */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Section title="طلبات الصيانة" icon={Wrench}>
                    <div className="grid grid-cols-3 gap-3">
                        <Stat label="مفتوحة" value={data.requests.open} tone="brand" />
                        <Stat label="مغلقة" value={data.requests.closed} tone="up" />
                        <Stat
                            label="تأخّر عن الوقت"
                            value={data.requests.sla_breaches}
                            tone={data.requests.sla_breaches ? 'down' : 'up'}
                        />
                    </div>
                </Section>

                <Section title="مؤشرات الأداء" icon={Activity}>
                    <div className="grid grid-cols-3 gap-3">
                        <Stat
                            label="زمن الاستجابة"
                            value={p.avg_response_hours}
                            suffix="س"
                            tone="brand"
                        />
                        <Stat label="نسبة الأعطال" value={p.fault_rate} suffix="%" tone="warn" />
                        <Stat
                            label="مستوى الخدمة"
                            value={p.service_level ?? '—'}
                            suffix={p.service_level === null ? '' : '%'}
                            tone={p.service_level !== null && p.service_level >= 90 ? 'up' : 'slate'}
                        />
                    </div>
                </Section>
            </div>

            {/* ── Spare parts ───────────────────────────────── */}
            <Section title="مخزون قطع الغيار" icon={Package}>
                <div className="grid grid-cols-3 gap-3">
                    <Stat label="أصناف متوفرة" value={data.spare_parts.lines} tone="brand" />
                    <Stat label="قيمة المخزون" value={formatMoney(data.spare_parts.value)} />
                    <Stat
                        label="تحت حد الطلب"
                        value={data.spare_parts.below_reorder}
                        tone={data.spare_parts.below_reorder ? 'warn' : 'up'}
                    />
                </div>
            </Section>

            {/* ── Recent visits ─────────────────────────────── */}
            <Section title="آخر الزيارات الفنية" icon={CalendarClock}>
                {data.recent_visits.length === 0 ? (
                    <EmptyState icon={CalendarClock} title="لا توجد زيارات منفّذة بعد" />
                ) : (
                    <div className="divide-y divide-navy-100">
                        {data.recent_visits.map((visit) => (
                            <Link
                                key={visit.id}
                                to={path(`/tasks/${visit.id}`)}
                                className="flex items-center justify-between gap-3 py-2.5"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-navy-800">
                                        {visit.customer ?? visit.title}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {visit.code}
                                        {visit.technician && ` · ${visit.technician}`}
                                    </p>
                                </div>
                                <span className="tabular shrink-0 text-[11px] text-navy-400">
                                    {visit.completed_at && formatDate(visit.completed_at)}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </Section>
        </>
    )
}

const TONES = {
    brand: 'text-brand-700',
    up: 'text-emerald-700',
    down: 'text-red-700',
    warn: 'text-amber-600',
    slate: 'text-navy-500',
} as const

function Tile({
    icon: Icon,
    label,
    value,
    tone,
    hint,
}: {
    icon: typeof HardDrive
    label: string
    value: number | string
    tone: keyof typeof TONES
    hint?: string
}) {
    return (
        <div className="card p-4">
            <Icon className={`size-5 ${TONES[tone]}`} />
            <p className="mt-2 text-[11px] font-bold text-navy-400">{label}</p>
            <p className={`tabular mt-0.5 text-2xl font-extrabold ${TONES[tone]}`}>{value}</p>
            {hint && <p className="mt-0.5 text-[10px] text-navy-400">{hint}</p>}
        </div>
    )
}

function Stat({
    label,
    value,
    tone = 'slate',
    hint,
    suffix,
}: {
    label: string
    value: number | string
    tone?: keyof typeof TONES
    hint?: string
    suffix?: string
}) {
    return (
        <div className="rounded-xl bg-navy-50 p-3 text-center">
            <p className={`tabular text-lg font-extrabold ${TONES[tone]}`}>
                {value}
                {suffix && <span className="mr-0.5 text-xs font-bold">{suffix}</span>}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-navy-500">{label}</p>
            {hint && <p className="text-[10px] text-navy-400">{hint}</p>}
        </div>
    )
}

function Section({
    title,
    icon: Icon,
    children,
}: {
    title: string
    icon: typeof HardDrive
    children: React.ReactNode
}) {
    return (
        <section className="mt-4">
            <div className="mb-2 flex items-center gap-2">
                <Icon className="size-4 text-navy-400" />
                <h2 className="text-sm font-bold text-navy-800">{title}</h2>
            </div>
            <div className="card p-4">{children}</div>
        </section>
    )
}

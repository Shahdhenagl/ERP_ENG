import { Activity, CalendarClock, HardDrive, Wrench } from 'lucide-react'
import { SkeletonCard } from '@/components/ui'
import { useOperations } from '@/lib/queries'

/**
 * The standby-power estate at a glance, folded into the dashboard: the devices
 * and how they are, then a single compact strip of the numbers that matter —
 * batteries to replace, work open, SLA slips, parts short, and how the service
 * is performing. Every figure is read from the module that owns it.
 */
export function OperationsOverview() {
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

            {/* ── One compact strip of the key numbers ──────── */}
            <div className="card mt-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
                <Stat
                    label="بطاريات تحتاج استبدال"
                    value={b.need_replacement}
                    tone={b.need_replacement ? 'down' : 'up'}
                />
                <Stat label="طلبات مفتوحة" value={data.requests.open} tone="brand" />
                <Stat
                    label="تأخّر عن الوقت"
                    value={data.requests.sla_breaches}
                    tone={data.requests.sla_breaches ? 'down' : 'up'}
                />
                <Stat
                    label="قطع تحت حد الطلب"
                    value={data.spare_parts.below_reorder}
                    tone={data.spare_parts.below_reorder ? 'warn' : 'up'}
                />
                <Stat label="زمن الاستجابة" value={p.avg_response_hours} suffix="س" tone="brand" />
                <Stat
                    label="مستوى الخدمة"
                    value={p.service_level ?? '—'}
                    suffix={p.service_level === null ? '' : '%'}
                    tone={p.service_level !== null && p.service_level >= 90 ? 'up' : 'slate'}
                />
            </div>
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
    suffix,
}: {
    label: string
    value: number | string
    tone?: keyof typeof TONES
    suffix?: string
}) {
    return (
        <div className="rounded-xl bg-navy-50 p-3 text-center">
            <p className={`tabular text-lg font-extrabold ${TONES[tone]}`}>
                {value}
                {suffix && <span className="mr-0.5 text-xs font-bold">{suffix}</span>}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-navy-500">{label}</p>
        </div>
    )
}

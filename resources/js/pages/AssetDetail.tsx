import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { ArrowRight, Building2, CalendarClock, HardDrive, MapPin, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AssetForm } from '@/components/AssetForm'
import { TaskCard } from '@/components/TaskCard'
import { EmptyState, ErrorState, PageLoader } from '@/components/ui'
import { DeviceWarrantyBlock } from '@/pages/warranty/DeviceWarrantyBlock'
import { useAuth } from '@/lib/auth'
import { ASSET_STATUS, UPS_PHASES, UPS_TYPES } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useAsset } from '@/lib/queries'
import type { Asset } from '@/types'

export function AssetDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { canDispatch } = useAuth()
    const [editing, setEditing] = useState(false)

    const { data: asset, isLoading, isError, refetch } = useAsset(id)

    if (isLoading) return <PageLoader />
    if (isError || !asset) {
        return <ErrorState message="تعذّر تحميل بيانات الجهاز." onRetry={() => void refetch()} />
    }

    const history = asset.tasks ?? []

    return (
        <>
            <div className="mb-4 flex items-center gap-2">
                <button onClick={() => navigate(-1)} className="btn-ghost tap -mr-2 text-sm">
                    <ArrowRight className="size-4" />
                    {tr('رجوع')}
                </button>
                <div className="flex-1" />
                {canDispatch && (
                    <button
                        onClick={() => setEditing(true)}
                        className="btn-ghost tap px-3"
                        aria-label="تعديل"
                    >
                        <Pencil className="size-4" />
                    </button>
                )}
            </div>

            {/* ══ Identity ══════════════════════════════════════ */}
            <div className="card p-5">
                <div className="flex items-start gap-4">
                    <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                        <HardDrive className="size-6" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular text-[11px] font-bold text-brand-600">{asset.code}</span>
                            <span className={clsx('badge', ASSET_STATUS[asset.status].chip)}>
                                {asset.status_label}
                            </span>
                        </div>

                        <h1 className="mt-1 text-lg font-extrabold text-navy-900">{asset.label}</h1>

                        {asset.serial && (
                            <p className="tabular mt-0.5 text-left text-sm text-navy-500" dir="ltr">
                                {asset.serial}
                            </p>
                        )}
                    </div>
                </div>

                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Detail icon={Building2} label="العميل" value={asset.customer?.name} />
                    <Detail label="القدرة" value={asset.capacity} />
                    <Detail icon={MapPin} label="الموقع" value={asset.site_address} />
                    <Detail
                        icon={CalendarClock}
                        label="تاريخ التركيب"
                        value={asset.installed_at ? formatDate(asset.installed_at) : null}
                    />
                </dl>

                {asset.notes && (
                    <p className="mt-4 rounded-xl bg-navy-50 p-3 text-sm text-navy-600">{asset.notes}</p>
                )}
            </div>

            <AssetSpecs asset={asset} />

            {/* ══ Warranty and what has been claimed on it ══════ */}
            {/* Dispatchers only: the history endpoint is theirs, and a
                technician standing at the unit sees its cover on the job. */}
            {canDispatch && <DeviceWarrantyBlock asset={asset} />}

            {/* ══ Service history ═══════════════════════════════ */}
            <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-bold text-navy-900">سجل الصيانة</h2>
                    <span className="text-xs font-semibold text-navy-400">
                        {history.length} زيارة
                    </span>
                </div>

                {history.length === 0 ? (
                    <EmptyState
                        icon={CalendarClock}
                        title="لا توجد زيارات بعد"
                        description="ستظهر هنا كل مهمة تُربط بهذا الجهاز."
                    />
                ) : (
                    <div className="space-y-3">
                        {history.map((task) => (
                            <TaskCard key={task.id} task={task} />
                        ))}
                    </div>
                )}
            </div>

            {editing && (
                <AssetForm open={editing} onClose={() => setEditing(false)} asset={asset} />
            )}
        </>
    )
}

/** The UPS nameplate and specs — only the fields that were filled. */
function AssetSpecs({ asset }: { asset: Asset }) {
    const specs: Array<[string, string | null]> = [
        ['الشركة المصنّعة', asset.brand],
        ['الموديل', asset.model],
        ['النوع', asset.ups_type ? UPS_TYPES[asset.ups_type] ?? asset.ups_type : null],
        ['عدد الأوجه', asset.phase ? UPS_PHASES[asset.phase] ?? asset.phase : null],
        ['رقم الأصل', asset.asset_number],
        ['الباركود / QR', asset.barcode],
        ['جهد الإدخال', asset.input_voltage],
        ['جهد الخرج', asset.output_voltage],
        ['التردد', asset.frequency],
        ['الكفاءة', asset.efficiency],
        ['معامل القدرة', asset.power_factor],
        ['جهد البطارية', asset.battery_voltage],
        ['عدد البطاريات', asset.battery_count != null ? String(asset.battery_count) : null],
        ['مدة التشغيل', asset.backup_minutes != null ? `${asset.backup_minutes} دقيقة` : null],
        ['منفذ الاتصال', asset.comm_port],
    ].filter(([, value]) => value) as Array<[string, string]>

    if (specs.length === 0) return null

    return (
        <section className="card mt-4 p-5">
            <h2 className="mb-3 text-sm font-bold text-navy-800">المواصفات الفنية</h2>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {specs.map(([label, value]) => (
                    <Detail key={label} label={label} value={value} />
                ))}
            </dl>
        </section>
    )
}

function Detail({
    icon: Icon,
    label,
    value,
}: {
    icon?: typeof Building2
    label: string
    value?: string | null
}) {
    return (
        <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-bold text-navy-400">
                {Icon && <Icon className="size-3.5" />}
                {label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-navy-800">{value || '—'}</dd>
        </div>
    )
}

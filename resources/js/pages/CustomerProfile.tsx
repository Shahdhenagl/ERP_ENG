import clsx from 'clsx'
import {
    ArrowRight,
    Boxes,
    FileText,
    HardDrive,
    MapPin,
    MessageCircle,
    Pencil,
    Phone,
    ScrollText,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CustomerForm } from '@/components/CustomerForm'
import { Button, EmptyState, ErrorState, PageLoader } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate, telLink } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useCustomer, useCustomerProfile } from '@/lib/queries'

const CONTRACT_CHIP: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    expired: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    scheduled: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    draft: 'bg-navy-100 text-navy-500 ring-1 ring-navy-200',
    cancelled: 'bg-navy-100 text-navy-400 ring-1 ring-navy-200',
}

export function CustomerProfile() {
    const { id } = useParams<{ id: string }>()
    const { path } = useArea()
    const { data, isLoading, isError, refetch } = useCustomerProfile(id)
    const { data: customer } = useCustomer(id)
    const [editing, setEditing] = useState(false)

    if (isLoading) return <PageLoader />
    if (isError || !data) return <ErrorState message="تعذّر تحميل ملف العميل." onRetry={() => void refetch()} />

    const c = data.customer
    const s = data.summary

    return (
        <>
            <Link
                to={path('/customers')}
                className="tap mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy-500"
            >
                <ArrowRight className="size-4" />
                كل العملاء
            </Link>

            {/* ── Identity ───────────────────────────────── */}
            <div className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular text-[11px] font-bold text-brand-600">{c.code}</span>
                            {c.type_label && (
                                <span className="badge bg-brand-50 text-brand-700">{c.type_label}</span>
                            )}
                            {!c.is_active && (
                                <span className="badge bg-navy-100 text-navy-500">غير نشط</span>
                            )}
                        </div>
                        <h1 className="mt-1 text-xl font-extrabold text-navy-900">{c.name}</h1>
                        {c.company && <p className="text-sm text-navy-400">{c.company}</p>}
                    </div>

                    <div className="flex gap-2">
                        <Link
                            to={path(`/print/statements/${c.id}`)}
                            className="tap grid size-10 place-items-center rounded-xl bg-navy-100 text-navy-600"
                            aria-label="كشف حساب"
                        >
                            <FileText className="size-4.5" />
                        </Link>
                        <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                            تعديل
                        </Button>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {c.phone && (
                        <a href={telLink(c.phone)} className="btn-secondary py-2 text-xs">
                            <Phone className="size-3.5" />
                            {c.phone}
                        </a>
                    )}
                    <a
                        href={c.whatsapp_link ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={clsx('btn-whatsapp py-2 text-xs', !c.whatsapp_link && 'pointer-events-none opacity-40')}
                    >
                        <MessageCircle className="size-3.5" />
                        واتساب
                    </a>
                    <a
                        href={c.maps_url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={clsx('btn-secondary py-2 text-xs', !c.maps_url && 'pointer-events-none opacity-40')}
                    >
                        <MapPin className="size-3.5" />
                        الخريطة
                    </a>
                </div>

                {c.address && (
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-navy-500">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-navy-300" />
                        <span>{c.address}</span>
                    </p>
                )}
            </div>

            {/* ── Numbers ────────────────────────────────── */}
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="عقود سارية" value={String(s.active_contracts)} tone={s.expiring_contracts > 0 ? 'warn' : 'ok'} hint={s.expiring_contracts > 0 ? `${s.expiring_contracts} قارب على الانتهاء` : `${s.contracts} إجمالًا`} />
                <Stat label="عروض الأسعار" value={String(s.quotations)} />
                <Stat label="الأجهزة" value={String(s.assets)} />
                <Stat label="مستحق علينا/له" value={formatMoney(s.outstanding)} tone={s.outstanding > 0 ? 'down' : undefined} />
            </div>

            {/* ── Contracts ──────────────────────────────── */}
            <Section title="العقود" icon={ScrollText} count={data.contracts.length}>
                {data.contracts.length === 0 ? (
                    <EmptyState icon={ScrollText} title="لا توجد عقود" />
                ) : (
                    <div className="space-y-2">
                        {data.contracts.map((contract) => (
                            <Link
                                key={contract.id}
                                to={path(`/contracts/${contract.id}`)}
                                className="card-interactive flex items-center justify-between gap-3 p-3.5"
                            >
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-navy-500">
                                            {contract.code}
                                        </span>
                                        <span className={clsx('badge', CONTRACT_CHIP[contract.status] ?? 'bg-navy-100 text-navy-500')}>
                                            {contract.status_label}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-sm font-semibold text-navy-800">
                                        {contract.title}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {formatDate(contract.starts_on)} — {formatDate(contract.ends_on)}
                                        {contract.status === 'active' && contract.days_remaining >= 0 &&
                                            ` · باقٍ ${contract.days_remaining} يوم`}
                                    </p>
                                </div>
                                <span className="tabular shrink-0 text-sm font-bold text-navy-700">
                                    {formatMoney(contract.value)}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </Section>

            {/* ── Quotations ─────────────────────────────── */}
            <Section title="عروض الأسعار" icon={FileText} count={data.quotations.length}>
                {data.quotations.length === 0 ? (
                    <EmptyState icon={FileText} title="لا توجد عروض أسعار" />
                ) : (
                    <div className="space-y-2">
                        {data.quotations.map((quotation) => (
                            <div key={quotation.id} className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 p-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-navy-500">
                                            {quotation.code}
                                        </span>
                                        <span className="badge bg-navy-100 text-navy-600">
                                            {quotation.status_label}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-sm text-navy-700">
                                        {quotation.title ?? '—'} · {formatDate(quotation.issue_date)}
                                    </p>
                                </div>
                                <span className="tabular shrink-0 text-sm font-bold text-navy-700">
                                    {formatMoney(quotation.total)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* ── Assets ─────────────────────────────────── */}
            <Section title="الأجهزة" icon={HardDrive} count={data.assets.length}>
                {data.assets.length === 0 ? (
                    <EmptyState icon={Boxes} title="لا توجد أجهزة مسجّلة" />
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                        {data.assets.map((asset) => (
                            <Link
                                key={asset.id}
                                to={path(`/assets/${asset.id}`)}
                                className="card-interactive flex items-center gap-3 p-3"
                            >
                                <HardDrive className="size-4 shrink-0 text-navy-300" />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-navy-800">{asset.label}</p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {asset.code}
                                        {asset.serial && ` · ${asset.serial}`}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </Section>

            {editing && customer && (
                <CustomerForm open customer={customer} onClose={() => setEditing(false)} />
            )}
        </>
    )
}

function Stat({
    label,
    value,
    tone,
    hint,
}: {
    label: string
    value: string
    tone?: 'ok' | 'warn' | 'down'
    hint?: string
}) {
    const colour = tone
        ? { ok: 'text-emerald-700', warn: 'text-amber-600', down: 'text-red-700' }[tone]
        : 'text-navy-900'

    return (
        <div className="card p-4">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p className={clsx('tabular mt-1 text-lg font-extrabold', colour)}>{value}</p>
            {hint && <p className="mt-0.5 text-[10px] text-navy-400">{hint}</p>}
        </div>
    )
}

function Section({
    title,
    icon: Icon,
    count,
    children,
}: {
    title: string
    icon: typeof ScrollText
    count: number
    children: React.ReactNode
}) {
    return (
        <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
                <Icon className="size-4 text-navy-400" />
                <h2 className="text-sm font-bold text-navy-800">{title}</h2>
                <span className="tabular text-[11px] font-semibold text-navy-400">{count}</span>
            </div>
            {children}
        </section>
    )
}

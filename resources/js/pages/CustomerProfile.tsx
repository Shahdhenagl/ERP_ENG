import clsx from 'clsx'
import {
    ArrowLeft,
    ArrowRight,
    Boxes,
    ClipboardList,
    FileText,
    HardDrive,
    MapPin,
    MessageCircle,
    Pencil,
    Phone,
    Printer,
    ScrollText,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CustomerForm } from '@/components/CustomerForm'
import { Button, EmptyState, ErrorState, Field, Input, PageLoader, SkeletonCard } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { formatDate, formatDateTime, telLink } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { BranchesSection } from '@/components/BranchesSection'
import { useCustomer, useCustomerProfile, useCustomerTasks } from '@/lib/queries'

/** Job-status colours for the history rows and chips. */
const TASK_STATUS_CHIP: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    accepted: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    on_the_way: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    cancelled: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

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
                    {/* The name first, then what identifies it: the code, then the
                        kind of organisation. Reading the card should answer "who
                        is this" before "what is it filed as". */}
                    <div className="min-w-0">
                        <h1 className="text-xl font-extrabold text-navy-900">{c.name}</h1>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className="tabular text-[11px] font-bold text-brand-600">{c.code}</span>
                            {c.type_label && (
                                <span className="badge bg-brand-50 text-brand-700">{c.type_label}</span>
                            )}
                            {!c.is_active && (
                                <span className="badge bg-navy-100 text-navy-500">غير نشط</span>
                            )}
                        </div>
                        {c.company && <p className="mt-1 text-sm text-navy-400">{c.company}</p>}
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
                            <Link
                                key={quotation.id}
                                to={`${path('/print/quotations')}/${quotation.id}`}
                                target="_blank"
                                className="card-interactive flex items-center justify-between gap-3 p-3.5"
                            >
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-navy-500">
                                            {quotation.code}
                                        </span>
                                        <span className="badge bg-navy-100 text-navy-600">
                                            {quotation.status_label}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-sm font-semibold text-navy-800">
                                        {quotation.title ?? '—'}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {formatDate(quotation.issue_date)}
                                    </p>
                                </div>
                                <span className="tabular shrink-0 text-sm font-bold text-navy-700">
                                    {formatMoney(quotation.total)}
                                </span>
                            </Link>
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

            {/* ── Task / maintenance history ─────────────── */}
            <CustomerTasksSection customerId={c.id} />

            {/* ── Branches / sites ───────────────────────── */}
            <BranchesSection customerId={c.id} />

            {editing && customer && (
                <CustomerForm open customer={customer} onClose={() => setEditing(false)} />
            )}
        </>
    )
}

/**
 * Every job for this customer, filtered by a date window and printable.
 *
 * Fetches on its own so changing the dates re-queries without reloading the
 * whole profile; the print link hands the same window to the report sheet.
 */
function CustomerTasksSection({ customerId }: { customerId: number }) {
    const { path } = useArea()
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')

    const { data, isLoading } = useCustomerTasks(customerId, {
        from: from || undefined,
        to: to || undefined,
    })

    const printHref = path(
        `/print/customer-tasks/${customerId}?${new URLSearchParams({
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
        }).toString()}`,
    )

    return (
        <section className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <ClipboardList className="size-4 text-navy-400" />
                    <h2 className="text-sm font-bold text-navy-800">حركات المهام</h2>
                    {data && (
                        <span className="tabular text-[11px] font-semibold text-navy-400">
                            {data.meta.total}
                        </span>
                    )}
                </div>
                <a
                    href={data?.data.length ? printHref : undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={clsx(
                        'btn-secondary py-2 text-xs',
                        !data?.data.length && 'pointer-events-none opacity-40',
                    )}
                >
                    <Printer className="size-3.5" />
                    طباعة تقرير
                </a>
            </div>

            <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <Field label="من تاريخ">
                    <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                </Field>
                <Field label="إلى تاريخ">
                    <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </Field>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState icon={ClipboardList} title="لا توجد مهام في هذه الفترة" />
            ) : (
                <>
                    <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                        <MiniStat label="الإجمالي" value={String(data.meta.total)} />
                        <MiniStat label="منتهية" value={String(data.meta.completed)} tone="ok" />
                        <MiniStat label="مفتوحة" value={String(data.meta.open)} tone="warn" />
                    </div>

                    {/* One row per visit, each opening the job behind it — the
                        history is where a question about a visit starts. */}
                    <div className="overflow-x-auto rounded-2xl border border-navy-100">
                        <table className="w-full min-w-[60rem] text-right text-sm">
                            <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                                <tr>
                                    <th className="px-3 py-2.5">المهمة</th>
                                    <th className="px-3 py-2.5">العميل</th>
                                    <th className="px-3 py-2.5">الجهاز</th>
                                    <th className="px-3 py-2.5">الفرع</th>
                                    <th className="w-32 px-3 py-2.5">بداية التنفيذ</th>
                                    <th className="w-32 px-3 py-2.5">انتهاء التنفيذ</th>
                                    <th className="w-28 px-3 py-2.5">الحالة</th>
                                    <th className="w-12 px-3 py-2.5" />
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((task) => (
                                    <tr
                                        key={task.id}
                                        className="border-t border-navy-100 hover:bg-navy-50/60"
                                    >
                                        <td className="px-3 py-2.5">
                                            <span className="tabular block text-[11px] font-bold text-brand-600">
                                                {task.code}
                                            </span>
                                            <span className="block truncate font-semibold text-navy-800">
                                                {task.title ?? task.type_label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-navy-700">{task.customer ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-navy-600">{task.asset ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-navy-600">{task.branch ?? '—'}</td>
                                        <td className="tabular px-3 py-2.5 text-navy-600">
                                            {task.started_at ? formatDateTime(task.started_at) : '—'}
                                        </td>
                                        <td className="tabular px-3 py-2.5 text-navy-600">
                                            {task.completed_at ? formatDateTime(task.completed_at) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span
                                                className={clsx(
                                                    'badge',
                                                    TASK_STATUS_CHIP[task.status] ??
                                                        'bg-navy-100 text-navy-500',
                                                )}
                                            >
                                                {task.status_label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <Link
                                                to={path(`/tasks/${task.id}`)}
                                                className="tap grid place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-white hover:text-brand-600"
                                                aria-label={`فتح ${task.code}`}
                                            >
                                                <ArrowLeft className="size-4" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
    return (
        <div className="rounded-xl bg-navy-50 px-3 py-2">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular text-sm font-extrabold',
                    tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-navy-900',
                )}
            >
                {value}
            </p>
        </div>
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

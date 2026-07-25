import clsx from 'clsx'
import { BadgeCheck, Printer, Search, ShieldCheck, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Input, PageHeader, SkeletonCard } from '@/components/ui'
import { WARRANTY_STATUS } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useWarranties } from '@/lib/queries'

/**
 * Verify a warranty and print its certificate.
 *
 * Type a code, serial or customer and every matching cover comes back with a
 * plain valid / expired / void verdict — the answer a service desk needs on a
 * call — and the certificate is one click from each.
 */
export function WarrantyCertificatePage() {
    const { path } = useArea()
    const [input, setInput] = useState('')
    const [term, setTerm] = useState('')

    const { data, isLoading } = useWarranties({ search: term, per_page: 30 })

    return (
        <>
            <PageHeader title="شهادة الضمان" subtitle="التحقق من الضمان وطباعة الشهادة" />

            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    setTerm(input.trim())
                }}
                className="mx-auto mb-5 max-w-lg"
            >
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="ابحث بالكود أو السيريال أو العميل…"
                        className="pr-10"
                    />
                </div>
            </form>

            {!term ? (
                <EmptyState
                    icon={ShieldCheck}
                    title="ابحث عن ضمان للتحقق منه"
                    description="اكتب كود الضمان أو الرقم التسلسلي أو اسم العميل لعرض صلاحيته وطباعة شهادته."
                />
            ) : isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState icon={Search} title="لا يوجد ضمان مطابق" />
            ) : (
                <div className="space-y-2">
                    {data.data.map((w) => {
                        const state = WARRANTY_STATUS[w.effective_status]
                        const valid = w.effective_status === 'active' || w.effective_status === 'expiring'
                        const voided = w.effective_status === 'void'

                        return (
                            <div key={w.id} className="card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular font-bold text-navy-900">{w.code}</span>
                                            <span className={clsx('badge', state.chip)}>{state.label}</span>
                                        </div>
                                        <p className="mt-1 truncate text-sm font-semibold text-navy-800">
                                            {w.asset_code} · {w.asset}
                                            {w.serial && (
                                                <span className="tabular mr-1.5 text-[11px] text-navy-400">
                                                    {w.serial}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-[11px] text-navy-400">
                                            {w.customer} · {w.covers_label} · {formatDate(w.starts_on)} —{' '}
                                            {formatDate(w.ends_on)}
                                        </p>
                                    </div>

                                    <span
                                        className={clsx(
                                            'grid size-11 shrink-0 place-items-center rounded-full',
                                            valid ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600',
                                        )}
                                    >
                                        {valid ? (
                                            <BadgeCheck className="size-5" />
                                        ) : (
                                            <ShieldX className="size-5" />
                                        )}
                                    </span>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-navy-100 pt-3">
                                    <Link
                                        to={path(`/print/warranty/${w.id}`)}
                                        target="_blank"
                                        className="btn-secondary text-xs"
                                    >
                                        <Printer className="size-4" />
                                        طباعة الشهادة
                                    </Link>
                                    <span
                                        className={clsx(
                                            'text-xs font-bold',
                                            valid
                                                ? 'text-emerald-600'
                                                : voided
                                                  ? 'text-red-600'
                                                  : 'text-amber-600',
                                        )}
                                    >
                                        {valid
                                            ? `ساري — باقٍ ${w.days_remaining} يوم`
                                            : voided
                                              ? 'ملغي'
                                              : 'منتهي الصلاحية'}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </>
    )
}

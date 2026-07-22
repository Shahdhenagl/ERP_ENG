import clsx from 'clsx'
import { CalendarPlus, Printer, Search, ShieldCheck, ShieldX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { WARRANTY_STATUS } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useWarranties, useWarrantyAction } from '@/lib/queries'
import type { Warranty } from '@/types'

type Filter = 'all' | 'effective' | 'expiring'

const FILTERS: Array<[Filter, string]> = [
    ['all', 'الكل'],
    ['effective', 'ساري'],
    ['expiring', 'يقارب على الانتهاء'],
]

export function WarrantyRegisterPage() {
    const { path } = useArea()
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<Filter>('all')
    const [extending, setExtending] = useState<Warranty | null>(null)
    const [voiding, setVoiding] = useState<Warranty | null>(null)

    const { data, isLoading } = useWarranties({
        search,
        effective: filter === 'effective' ? 1 : undefined,
        // Sixty days is the window where an extension is still worth offering
        // and the customer has not yet felt uncovered.
        expiring_within: filter === 'expiring' ? 60 : undefined,
        per_page: 40,
    })

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    return (
        <>
            <div className="mb-4 space-y-2">
                <div className="relative">
                    <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        placeholder="ابحث بالكود أو السيريال أو العميل"
                        className="pr-10"
                        onChange={(e) => debounced(e.target.value)}
                    />
                </div>

                <div className="flex gap-1 rounded-xl bg-navy-100 p-1">
                    {FILTERS.map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={clsx(
                                'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                                filter === value
                                    ? 'bg-white text-navy-900 shadow-sm'
                                    : 'text-navy-500',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={ShieldCheck}
                    title="لا توجد ضمانات"
                    description="سجّل ضمانًا لأي جهاز لتبدأ متابعة المطالبات والتجديدات."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((warranty) => {
                        const state = WARRANTY_STATUS[warranty.effective_status]

                        return (
                            <div key={warranty.id} className="card p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular font-bold text-navy-900">
                                                {warranty.code}
                                            </span>
                                            <span className={clsx('badge', state.chip)}>
                                                {state.label}
                                            </span>
                                            {warranty.kind === 'extension' && (
                                                <span className="badge bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                                                    تمديد {warranty.parent_code}
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 truncate text-sm font-semibold text-navy-800">
                                            {warranty.asset_code} · {warranty.asset}
                                            {warranty.serial && (
                                                <span className="tabular mr-1.5 text-[11px] text-navy-400">
                                                    {warranty.serial}
                                                </span>
                                            )}
                                        </p>

                                        <p className="mt-0.5 text-[11px] text-navy-400">
                                            {warranty.customer} · {warranty.kind_label} ·{' '}
                                            {warranty.covers_label}
                                            {warranty.supplier && ` · ${warranty.supplier}`}
                                        </p>
                                    </div>

                                    <div className="text-left">
                                        <p className="tabular text-xs text-navy-500">
                                            {formatDate(warranty.starts_on)} —{' '}
                                            {formatDate(warranty.ends_on)}
                                        </p>
                                        <p
                                            className={clsx(
                                                'tabular text-sm font-extrabold',
                                                warranty.days_remaining < 0
                                                    ? 'text-red-600'
                                                    : warranty.days_remaining <= 60
                                                      ? 'text-amber-600'
                                                      : 'text-emerald-600',
                                            )}
                                        >
                                            {warranty.days_remaining < 0
                                                ? `انتهى منذ ${Math.abs(warranty.days_remaining)} يوم`
                                                : `باقٍ ${warranty.days_remaining} يوم`}
                                        </p>
                                    </div>
                                </div>

                                {warranty.void_reason && (
                                    <p className="mt-2 rounded-lg bg-red-50 p-2 text-[11px] text-red-700">
                                        سبب الإلغاء: {warranty.void_reason}
                                    </p>
                                )}

                                <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                    <Link
                                        to={path(`/print/warranty/${warranty.id}`)}
                                        target="_blank"
                                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-700"
                                    >
                                        <Printer className="size-3.5" />
                                        شهادة ضمان
                                    </Link>

                                    {warranty.status === 'active' && (
                                        <>
                                            <button
                                                onClick={() => setExtending(warranty)}
                                                className="tap inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                                            >
                                                <CalendarPlus className="size-3.5" />
                                                تمديد
                                            </button>
                                            <button
                                                onClick={() => setVoiding(warranty)}
                                                className="tap inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                                            >
                                                <ShieldX className="size-3.5" />
                                                إلغاء
                                            </button>
                                        </>
                                    )}

                                    {Boolean(warranty.claims_count) && (
                                        <span className="inline-flex items-center rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-500">
                                            {warranty.claims_count} مطالبة
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {extending && (
                <ExtendDialog warranty={extending} onClose={() => setExtending(null)} />
            )}
            {voiding && <VoidDialog warranty={voiding} onClose={() => setVoiding(null)} />}
        </>
    )
}

/* ── Selling more time ───────────────────────────────────── */

function ExtendDialog({ warranty, onClose }: { warranty: Warranty; onClose: () => void }) {
    const toast = useToast()
    const act = useWarrantyAction()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [months, setMonths] = useState('12')
    const [notes, setNotes] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title={`تمديد الضمان ${warranty.code}`}
            description={`الضمان الحالي ينتهي في ${formatDate(warranty.ends_on)} — التمديد يبدأ في اليوم التالي.`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={act.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={act.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await act.mutateAsync({
                                    id: warranty.id,
                                    action: 'extend',
                                    payload: { months: Number(months), notes: notes || null },
                                })
                                toast.success('تم تمديد الضمان.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تمديد الضمان.'))
                            }
                        }}
                    >
                        تمديد
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="مدة التمديد (شهور)" required error={errors.months || errors.ends_on}>
                    <Input
                        type="number"
                        min={1}
                        max={240}
                        value={months}
                        onChange={(e) => setMonths(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

/* ── Tearing one up ──────────────────────────────────────── */

function VoidDialog({ warranty, onClose }: { warranty: Warranty; onClose: () => void }) {
    const toast = useToast()
    const act = useWarrantyAction()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [reason, setReason] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title={`إلغاء الضمان ${warranty.code}`}
            description="الضمان الملغي لا يغطي أي عطل، مهما كان تاريخه."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={act.isPending}>
                        تراجع
                    </Button>
                    <Button
                        loading={act.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await act.mutateAsync({
                                    id: warranty.id,
                                    action: 'void',
                                    payload: { reason },
                                })
                                toast.success('تم إلغاء الضمان.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر إلغاء الضمان.'))
                            }
                        }}
                    >
                        إلغاء الضمان
                    </Button>
                </>
            }
        >
            <Field label="السبب" required error={errors.reason || errors.warranty}>
                <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="فتح الجهاز بواسطة طرف ثالث"
                />
            </Field>
        </Modal>
    )
}

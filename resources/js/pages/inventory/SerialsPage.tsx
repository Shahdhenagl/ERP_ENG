import clsx from 'clsx'
import { ScanLine, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Input, PageHeader, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useScrapSerial, useSerialLookup } from '@/lib/queries'

/**
 * Track one unit by its serial. Type or scan a number and its whole story comes
 * back — what it is, where it sits, which device it became, when it arrived and
 * left — and it can be scrapped out of circulation from here.
 */
export function SerialsPage() {
    const toast = useToast()
    const [input, setInput] = useState('')
    const [serial, setSerial] = useState('')
    const scrap = useScrapSerial()

    const { data: unit, isLoading, isError, error } = useSerialLookup(serial)

    const notFound = isError && (error as { response?: { status?: number } })?.response?.status === 404

    return (
        <>
            <PageHeader title="الباركود والأرقام التسلسلية" subtitle="تتبّع وحدة بالرقم التسلسلي" />

            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    setSerial(input.trim())
                }}
                className="mx-auto mb-5 flex max-w-lg gap-2"
            >
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="امسح أو اكتب الرقم التسلسلي…"
                        className="pr-10"
                        dir="ltr"
                    />
                </div>
                <Button type="submit" icon={ScanLine} disabled={!input.trim()}>
                    بحث
                </Button>
            </form>

            {!serial ? (
                <EmptyState
                    icon={ScanLine}
                    title="ابحث برقم تسلسلي"
                    description="اكتب الرقم أو امسحه بالباركود لعرض حالة الوحدة وتاريخها."
                />
            ) : isLoading ? (
                <SkeletonCard />
            ) : notFound || !unit ? (
                <EmptyState icon={Search} title="لا يوجد رقم تسلسلي مطابق" />
            ) : (
                <div className="mx-auto max-w-lg space-y-3">
                    <div className="card p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="tabular text-lg font-extrabold text-navy-900">{unit.serial}</p>
                                <p className="text-sm text-navy-600">
                                    {unit.item}
                                    {unit.item_code && (
                                        <span className="tabular text-[11px] text-navy-400"> · {unit.item_code}</span>
                                    )}
                                </p>
                            </div>
                            <span
                                className={clsx(
                                    'badge',
                                    unit.is_available
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-navy-100 text-navy-600',
                                )}
                            >
                                {unit.status_label}
                            </span>
                        </div>

                        <dl className="mt-3 space-y-1.5 border-t border-navy-100 pt-3 text-xs">
                            <Row label="المخزن" value={unit.warehouse} />
                            <Row label="أصبح جهازًا" value={unit.asset} />
                            <Row label="صُرف على أمر عمل" value={unit.issued_on_task} />
                            <Row label="استُلم" value={unit.received_at ? formatDate(unit.received_at) : null} />
                            <Row label="المورد" value={unit.received_from} />
                            <Row label="ملاحظة" value={unit.note} />
                        </dl>

                        {unit.is_available && (
                            <div className="mt-3 border-t border-navy-100 pt-3">
                                <Button
                                    variant="secondary"
                                    icon={Trash2}
                                    className="text-xs text-red-600"
                                    loading={scrap.isPending}
                                    onClick={async () => {
                                        const reason = window.prompt('سبب استبعاد الوحدة؟')
                                        if (!reason) return
                                        try {
                                            await scrap.mutateAsync({ id: unit.id, reason })
                                            toast.success('تم استبعاد الوحدة.')
                                        } catch (caught) {
                                            toast.error(errorMessage(caught, 'تعذّر الاستبعاد.'))
                                        }
                                    }}
                                >
                                    استبعاد الوحدة (Scrap)
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null

    return (
        <div className="flex justify-between gap-3">
            <dt className="text-navy-400">{label}</dt>
            <dd className="font-semibold text-navy-700">{value}</dd>
        </div>
    )
}

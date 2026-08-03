import clsx from 'clsx'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { tr } from '@/lib/i18n'
import { CalendarClock, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useContracts, useRenewContract } from '@/lib/queries'
import type { Contract } from '@/types'

/**
 * The renewals desk: contracts running out soonest first, so cover is sold
 * before the gap, not after it. Renew one in place — a new term the day after
 * this one ends, the old one left as it was.
 */
export function ContractRenewalsPage() {
    const [view, setView] = useViewMode('contract-renewals')
    const { data, isLoading } = useContracts({ expiring: 1, per_page: 100 })
    const [renewing, setRenewing] = useState<Contract | null>(null)

    const rows = [...(data?.data ?? [])].sort((a, b) => a.days_remaining - b.days_remaining)

    return (
        <>
            <PageHeader
                title="التنبيهات والتجديدات"
                subtitle="العقود التي تقترب على الانتهاء — جدّدها قبل انقطاع التغطية"
            />

            <div className="mb-3 flex justify-end">
                <ViewToggle view={view} onChange={setView} />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={CalendarClock}
                    title="لا توجد عقود تقترب على الانتهاء"
                    description="العقود التي تنتهي خلال 60 يومًا تظهر هنا لتجديدها."
                />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="54rem"
                    headers={[
                        { label: 'الكود', className: 'w-28' },
                        'العميل',
                        { label: 'يبدأ', className: 'w-32' },
                        { label: 'ينتهي', className: 'w-32' },
                        { label: 'الأيام المتبقية', className: 'w-28' },
                        { label: 'قيمة العقد', className: 'w-28 text-end' },
                    ]}
                >
                    {rows.map((contract) => (
                        <tr
                            key={contract.id}
                            className={clsx(
                                'border-t border-navy-100 hover:bg-navy-50/60',
                                // Cover that has already lapsed is not a renewal
                                // reminder any more; it is a gap.
                                contract.days_remaining < 0 && 'bg-red-50/60',
                            )}
                        >
                            <td className="tabular px-3 py-2.5 font-bold text-brand-600">
                                {contract.code}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-navy-800">
                                {contract.customer?.name ?? contract.title}
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600">
                                {formatDate(contract.starts_on)}
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600">
                                {formatDate(contract.ends_on)}
                            </td>
                            <td
                                className={clsx(
                                    'tabular px-3 py-2.5',
                                    contract.days_remaining < 0
                                        ? 'font-bold text-red-600'
                                        : 'text-navy-600',
                                )}
                            >
                                {contract.days_remaining}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end font-bold text-navy-900">
                                {contract.value ? formatMoney(Number(contract.value)) : '—'}
                            </td>
                        </tr>
                    ))}
                </DataTable>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((contract) => {
                        const overdue = contract.days_remaining < 0

                        return (
                            <div key={contract.id} className="card p-3.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="tabular text-[11px] font-bold text-brand-600">
                                                {contract.code}
                                            </span>
                                            <span
                                                className={clsx(
                                                    'badge',
                                                    contract.effective_status === 'active'
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : 'bg-amber-50 text-amber-700',
                                                )}
                                            >
                                                {contract.effective_status_label}
                                            </span>
                                            {contract.renewal_code && (
                                                <span className="tabular text-[11px] font-bold text-emerald-600">
                                                    ← {contract.renewal_code}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 truncate font-bold text-navy-900">
                                            {contract.customer?.name ?? contract.title}
                                        </p>
                                        <p className="tabular text-[11px] text-navy-400">
                                            ينتهي {formatDate(contract.ends_on)}
                                        </p>
                                    </div>

                                    <div className="shrink-0 text-left">
                                        <p
                                            className={clsx(
                                                'tabular text-sm font-extrabold',
                                                overdue
                                                    ? 'text-red-600'
                                                    : contract.days_remaining <= 14
                                                      ? 'text-amber-600'
                                                      : 'text-navy-600',
                                            )}
                                        >
                                            {overdue
                                                ? `انتهى منذ ${Math.abs(contract.days_remaining)} يوم`
                                                : `باقٍ ${contract.days_remaining} يوم`}
                                        </p>
                                    </div>
                                </div>

                                {!contract.renewal_code && (
                                    <div className="mt-3 border-t border-navy-100 pt-3">
                                        <Button
                                            variant="secondary"
                                            icon={RefreshCw}
                                            className="text-xs"
                                            onClick={() => setRenewing(contract)}
                                        >
                                            {tr('تجديد العقد')}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {renewing && <RenewDialog contract={renewing} onClose={() => setRenewing(null)} />}
        </>
    )
}

function RenewDialog({ contract, onClose }: { contract: Contract; onClose: () => void }) {
    const toast = useToast()
    const renew = useRenewContract(contract.id)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({
        months: '12',
        value: contract.value ?? '',
        notes: '',
    })

    return (
        <Modal
            open
            onClose={onClose}
            title={`تجديد العقد ${contract.code}`}
            description={`العقد الحالي ينتهي في ${formatDate(contract.ends_on)} — التجديد يبدأ في اليوم التالي.`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={renew.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={renew.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                const created = await renew.mutateAsync({
                                    months: Number(form.months) || 12,
                                    value: form.value ? Number(form.value) : null,
                                    notes: form.notes || null,
                                })
                                toast.success(`تم التجديد — ${created.code}.`)
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر التجديد.'))
                            }
                        }}
                    >
                        {tr('تجديد')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="مدة التجديد (شهور)" required error={errors.months}>
                    <Input
                        type="number"
                        min={1}
                        max={120}
                        value={form.months}
                        onChange={(e) => setForm((f) => ({ ...f, months: e.target.value }))}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>
                <Field label="قيمة العقد الجديد" error={errors.value}>
                    <Input
                        type="number"
                        value={form.value}
                        onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                        dir="ltr"
                        className="text-left"
                    />
                    <p className="mt-1 text-[11px] text-navy-400">
                        الحالية: {formatMoney(Number(contract.value ?? 0))}
                    </p>
                </Field>
                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                </Field>
            </div>
        </Modal>
    )
}

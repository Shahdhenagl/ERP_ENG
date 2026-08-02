import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { CalendarDays, Plus } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useMyLeave, useSubmitLeave } from '@/lib/queries'
import type { LeaveStatus } from '@/types'

const STATUS_CHIP: Record<LeaveStatus, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

/**
 * A technician's own leave: file a request and watch for the manager's decision.
 * Everything files as pending — only a manager approves it.
 */
export function TechLeavePage() {
    const { data, isLoading } = useMyLeave()
    const [creating, setCreating] = useState(false)

    return (
        <>
            <PageHeader
                title="الإجازات"
                subtitle="قدّم طلب إجازة وتابع اعتماده"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        {tr('طلب إجازة')}
                    </Button>
                }
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.length ? (
                <EmptyState
                    icon={CalendarDays}
                    title="لا توجد طلبات إجازة"
                    description="قدّم طلبك وسيظهر هنا بحالته حتى يعتمده المدير."
                />
            ) : (
                <div className="space-y-2">
                    {data.map((leave) => (
                        <div key={leave.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {leave.code}
                                        </span>
                                        <span className="badge bg-navy-100 text-navy-600">
                                            {leave.type_label}
                                        </span>
                                        <span className={clsx('badge', STATUS_CHIP[leave.status])}>
                                            {leave.status_label}
                                        </span>
                                    </div>
                                    <p className="tabular mt-1 text-sm font-semibold text-navy-800">
                                        {formatDate(leave.from_date)} — {formatDate(leave.to_date)}
                                        <span className="text-navy-400"> · {leave.days} يوم</span>
                                    </p>
                                    {leave.reason && (
                                        <p className="mt-0.5 text-[11px] text-navy-400">{leave.reason}</p>
                                    )}
                                    {leave.decision_note && leave.status === 'rejected' && (
                                        <p className="mt-0.5 text-[11px] text-red-500">
                                            سبب الرفض: {leave.decision_note}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {creating && <LeaveForm onClose={() => setCreating(false)} />}
        </>
    )
}

function LeaveForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const submit = useSubmitLeave()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({
        type: 'annual',
        from_date: '',
        to_date: '',
        reason: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title="طلب إجازة"
            description="يُرسل الطلب للمدير للاعتماد."
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={submit.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={submit.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await submit.mutateAsync({
                                    type: form.type,
                                    from_date: form.from_date,
                                    to_date: form.to_date,
                                    reason: form.reason || null,
                                })
                                toast.success('تم إرسال الطلب، بانتظار الاعتماد.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر إرسال الطلب.'))
                            }
                        }}
                    >
                        {tr('إرسال')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="نوع الإجازة" required error={errors.type}>
                    <Select value={form.type} onChange={(e) => set('type')(e.target.value)}>
                        <option value="annual">سنوية</option>
                        <option value="sick">مرضية</option>
                        <option value="unpaid">بدون راتب</option>
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="من تاريخ" required error={errors.from_date}>
                        <Input type="date" value={form.from_date} onChange={(e) => set('from_date')(e.target.value)} />
                    </Field>
                    <Field label="إلى تاريخ" required error={errors.to_date}>
                        <Input type="date" value={form.to_date} onChange={(e) => set('to_date')(e.target.value)} />
                    </Field>
                </div>

                <Field label="السبب" error={errors.reason}>
                    <Textarea value={form.reason} onChange={(e) => set('reason')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

import clsx from 'clsx'
import { CalendarDays, Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useEmployees, useLeave, useLeaveAction, useSaveLeave } from '@/lib/queries'
import type { LeaveStatus } from '@/types'

const STATUS: Record<LeaveStatus, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

export function LeaveTab() {
    const toast = useToast()
    const decide = useLeaveAction()
    const [creating, setCreating] = useState(false)
    const [pendingOnly, setPendingOnly] = useState(false)

    const { data, isLoading } = useLeave({ pending: pendingOnly ? 1 : undefined, per_page: 60 })

    const act = async (id: number, action: 'approve' | 'reject') => {
        const reason =
            action === 'reject' ? window.prompt('سبب الرفض؟') : window.prompt('ملاحظة (اختياري)') ?? ''
        if (action === 'reject' && !reason) return
        try {
            await decide.mutateAsync({ id, action, reason: reason ?? '', note: reason ?? '' })
            toast.success(action === 'approve' ? 'تم الاعتماد.' : 'تم الرفض.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
        }
    }

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-2">
                <button
                    onClick={() => setPendingOnly((v) => !v)}
                    className={clsx(
                        'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                        pendingOnly
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-white text-navy-500 ring-navy-200',
                    )}
                >
                    بانتظار الاعتماد
                    {data?.meta.pending ? ` (${data.meta.pending})` : ''}
                </button>
                <Button icon={Plus} onClick={() => setCreating(true)}>
                    طلب إجازة
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState icon={CalendarDays} title="لا توجد طلبات إجازة" />
            ) : (
                <div className="space-y-2">
                    {data.data.map((leave) => (
                        <div key={leave.id} className="card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular font-bold text-navy-900">
                                            {leave.code}
                                        </span>
                                        <span className={clsx('badge', STATUS[leave.status])}>
                                            {leave.status_label}
                                        </span>
                                        <span className="badge bg-navy-100 text-navy-600">
                                            {leave.type_label}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm font-semibold text-navy-800">
                                        {leave.employee}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {formatDate(leave.from_date)} — {formatDate(leave.to_date)} ·{' '}
                                        {leave.days} يوم
                                    </p>
                                    {leave.reason && (
                                        <p className="mt-1 text-sm text-navy-600">{leave.reason}</p>
                                    )}
                                    {leave.decision_note && (
                                        <p className="mt-1 rounded-lg bg-navy-50 p-2 text-[11px] text-navy-500">
                                            {leave.decision_note}
                                        </p>
                                    )}
                                </div>

                                {leave.type === 'annual' && leave.annual_remaining !== null && (
                                    <span className="tabular shrink-0 text-[11px] text-navy-400">
                                        الرصيد {leave.annual_remaining} يوم
                                    </span>
                                )}
                            </div>

                            {leave.status === 'pending' && (
                                <div className="mt-3 flex gap-2 border-t border-navy-100 pt-3">
                                    <button
                                        onClick={() => act(leave.id, 'approve')}
                                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                                    >
                                        <Check className="size-3.5" />
                                        اعتماد
                                    </button>
                                    <button
                                        onClick={() => act(leave.id, 'reject')}
                                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                                    >
                                        <X className="size-3.5" />
                                        رفض
                                    </button>
                                </div>
                            )}
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
    const save = useSaveLeave()
    const { data: employees } = useEmployees({ active: 1, per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        employee_id: '',
        type: 'annual',
        from_date: new Date().toISOString().slice(0, 10),
        to_date: new Date().toISOString().slice(0, 10),
        reason: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title="طلب إجازة"
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await save.mutateAsync({
                                    ...form,
                                    employee_id: Number(form.employee_id),
                                })
                                toast.success('تم تسجيل الطلب.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تسجيل الطلب.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الموظف" required error={errors.employee_id}>
                    <Select
                        value={form.employee_id}
                        onChange={(e) => set('employee_id')(e.target.value)}
                    >
                        <option value="">— اختر —</option>
                        {employees?.data.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                                {employee.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field
                    label="النوع"
                    required
                    error={errors.type}
                    hint="الاعتيادية تُخصم من الرصيد، والبدون أجر تُخصم من الراتب"
                >
                    <Select value={form.type} onChange={(e) => set('type')(e.target.value)}>
                        <option value="annual">اعتيادية</option>
                        <option value="sick">مرضية</option>
                        <option value="unpaid">بدون أجر</option>
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="من" required error={errors.from_date}>
                        <Input
                            type="date"
                            value={form.from_date}
                            onChange={(e) => set('from_date')(e.target.value)}
                        />
                    </Field>
                    <Field label="إلى" required error={errors.to_date}>
                        <Input
                            type="date"
                            value={form.to_date}
                            onChange={(e) => set('to_date')(e.target.value)}
                        />
                    </Field>
                </div>

                <Field label="السبب" error={errors.reason}>
                    <Textarea value={form.reason} onChange={(e) => set('reason')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

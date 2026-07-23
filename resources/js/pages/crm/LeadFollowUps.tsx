import clsx from 'clsx'
import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useCompleteFollowUp, useSaveFollowUp } from '@/lib/queries'
import type { FollowUp, FollowUpStatus, Lead } from '@/types'

export const FOLLOWUP_STATUS: Record<FollowUpStatus, string> = {
    pending: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    overdue: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    done: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

/** The follow-ups hanging off one lead, with the means to add and close them. */
export function LeadFollowUps({ lead }: { lead: Lead }) {
    const [adding, setAdding] = useState(false)
    const followUps = lead.follow_ups ?? []

    return (
        <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-navy-900">المتابعات</h3>
                <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>
                    متابعة
                </Button>
            </div>

            {!followUps.length ? (
                <p className="py-4 text-center text-sm text-navy-400">لا توجد متابعات بعد.</p>
            ) : (
                <div className="space-y-2">
                    {followUps.map((followUp) => (
                        <FollowUpRow key={followUp.id} followUp={followUp} />
                    ))}
                </div>
            )}

            {adding && (
                <FollowUpForm
                    subjectType="lead"
                    subjectId={lead.id}
                    onClose={() => setAdding(false)}
                />
            )}
        </div>
    )
}

function FollowUpRow({ followUp }: { followUp: FollowUp }) {
    const toast = useToast()
    const complete = useCompleteFollowUp()

    const done = async () => {
        const outcome = window.prompt('نتيجة المتابعة؟') ?? ''
        try {
            await complete.mutateAsync({ id: followUp.id, outcome })
            toast.success('تم إغلاق المتابعة.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر الإغلاق.'))
        }
    }

    return (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-navy-50 p-3">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-navy-800">{followUp.type_label}</span>
                    <span className={clsx('badge', FOLLOWUP_STATUS[followUp.status])}>
                        {followUp.status_label}
                    </span>
                </div>
                <p className="tabular text-[11px] text-navy-400">
                    {followUp.due_at ? formatDateTime(followUp.due_at) : ''}
                    {followUp.owner && ` · ${followUp.owner}`}
                </p>
                {followUp.note && <p className="mt-1 text-sm text-navy-600">{followUp.note}</p>}
                {followUp.outcome && (
                    <p className="mt-1 text-[12px] text-emerald-700">↳ {followUp.outcome}</p>
                )}
            </div>
            {followUp.status !== 'done' && (
                <button
                    onClick={done}
                    className="tap grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"
                    title="إغلاق"
                >
                    <Check className="size-4" />
                </button>
            )}
        </div>
    )
}

/** Book a follow-up against a lead or a customer. */
export function FollowUpForm({
    subjectType,
    subjectId,
    onClose,
}: {
    subjectType: 'lead' | 'customer'
    subjectId: number
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveFollowUp()
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Default to tomorrow morning, the most common "get back to them" slot.
    const tomorrow = new Date(Date.now() + 864e5)
    tomorrow.setHours(10, 0, 0, 0)

    const [form, setForm] = useState({
        type: 'call',
        due_at: toLocalInput(tomorrow),
        note: '',
    })

    return (
        <Modal
            open
            onClose={onClose}
            title="متابعة جديدة"
            description="موعد للعودة إلى العميل — يظهر في قائمة المتابعات وعلى الرئيسية إذا فات موعده."
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
                                    subject_type: subjectType,
                                    subject_id: subjectId,
                                    type: form.type,
                                    due_at: new Date(form.due_at).toISOString(),
                                    note: form.note || null,
                                })
                                toast.success('تم حجز المتابعة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر الحفظ.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="النوع" required error={errors.type}>
                        <Select
                            value={form.type}
                            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                        >
                            <option value="call">اتصال</option>
                            <option value="visit">زيارة</option>
                            <option value="whatsapp">واتساب</option>
                            <option value="email">بريد</option>
                            <option value="note">ملاحظة</option>
                        </Select>
                    </Field>
                    <Field label="الموعد" required error={errors.due_at}>
                        <Input
                            type="datetime-local"
                            value={form.due_at}
                            onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
                        />
                    </Field>
                </div>
                <Field label="المطلوب" error={errors.note}>
                    <Textarea
                        value={form.note}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    />
                </Field>
            </div>
        </Modal>
    )
}

/** A Date to the value a datetime-local input expects, in local time. */
function toLocalInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

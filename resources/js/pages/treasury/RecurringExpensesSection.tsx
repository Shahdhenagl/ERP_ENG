import clsx from 'clsx'
import { CalendarClock, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import {
    useCashBoxes,
    useDeleteRecurringExpense,
    usePayRecurringExpense,
    useRecurringExpenses,
    useSaveRecurringExpense,
} from '@/lib/queries'
import type { RecurringExpense } from '@/types'

const CYCLES: Array<{ days: number; label: string }> = [
    { days: 30, label: 'شهري' },
    { days: 60, label: 'كل شهرين' },
    { days: 90, label: 'ربع سنوي' },
    { days: 180, label: 'نصف سنوي' },
    { days: 365, label: 'سنوي' },
]

function cycleLabel(days: number): string {
    return CYCLES.find((c) => c.days === days)?.label ?? `كل ${days} يوم`
}

/** How soon it is due, worded and coloured — the reminder at a glance. */
function dueChip(days: number): { text: string; className: string } {
    if (days < 0) return { text: `متأخر ${Math.abs(days)} يوم`, className: 'bg-red-50 text-red-700' }
    if (days === 0) return { text: 'مستحق اليوم', className: 'bg-red-50 text-red-700' }
    if (days <= 3) return { text: `خلال ${days} يوم`, className: 'bg-amber-50 text-amber-700' }
    return { text: `بعد ${days} يوم`, className: 'bg-navy-100 text-navy-500' }
}

/**
 * The fixed, recurring bills — rent, a line, a licence — with the reminder that
 * lights up three days before each is due and stays until it is paid. Paying
 * rolls the schedule forward one cycle.
 */
export function RecurringExpensesSection() {
    const { data, isLoading } = useRecurringExpenses()
    const [editing, setEditing] = useState<RecurringExpense | null | undefined>(undefined)
    const [deleting, setDeleting] = useState<RecurringExpense | null>(null)
    const remove = useDeleteRecurringExpense()
    const toast = useToast()

    const expenses = data?.data ?? []
    const dueSoon = data?.meta.due_soon ?? 0

    return (
        <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-bold text-navy-900">
                    <CalendarClock className="size-4.5 text-brand-600" />
                    المصروفات الدورية
                    {dueSoon > 0 && (
                        <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                            {dueSoon} مستحق قريبًا
                        </span>
                    )}
                </h2>
                <Button icon={Plus} className="text-xs" onClick={() => setEditing(null)}>
                    مصروف دوري جديد
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : expenses.length === 0 ? (
                <EmptyState
                    icon={CalendarClock}
                    title="لا مصروفات دورية"
                    description="أضف الإيجار والاشتراكات الثابتة ليذكّرك النظام قبل استحقاقها بثلاثة أيام."
                />
            ) : (
                <div className="space-y-2">
                    {expenses.map((expense) => {
                        const chip = dueChip(expense.days_until_due)

                        return (
                            <div
                                key={expense.id}
                                className={clsx(
                                    'rounded-2xl border p-3.5',
                                    expense.is_due_soon
                                        ? 'border-amber-200 bg-amber-50/40'
                                        : 'border-navy-100',
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-bold text-navy-900">{expense.name}</span>
                                            {!expense.is_active && (
                                                <span className="badge bg-slate-100 text-slate-500">
                                                    موقوف
                                                </span>
                                            )}
                                            <span className={clsx('badge', chip.className)}>{chip.text}</span>
                                        </div>
                                        <p className="tabular mt-1 text-[11px] text-navy-400">
                                            {cycleLabel(expense.cycle_days)}
                                            {' · '}
                                            الاستحقاق {expense.next_due_on && formatDate(expense.next_due_on)}
                                            {expense.cash_box && ` · ${expense.cash_box}`}
                                            {expense.category && ` · ${expense.category}`}
                                        </p>
                                    </div>
                                    <span className="tabular shrink-0 font-extrabold text-navy-900">
                                        {formatMoney(expense.amount)}
                                    </span>
                                </div>

                                <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-navy-100 pt-2.5">
                                    <PayButton expense={expense} />
                                    <button
                                        onClick={() => setEditing(expense)}
                                        className="tap flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-navy-500 transition hover:bg-navy-50 hover:text-navy-800"
                                    >
                                        <Pencil className="size-3.5" />
                                        تعديل
                                    </button>
                                    <button
                                        onClick={() => setDeleting(expense)}
                                        className="tap flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                    >
                                        <Trash2 className="size-3.5" />
                                        حذف
                                    </button>
                                    {expense.last_paid_on && (
                                        <span className="mr-auto text-[11px] text-navy-400">
                                            آخر سداد {formatDate(expense.last_paid_on)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {editing !== undefined && (
                <RecurringExpenseDialog expense={editing} onClose={() => setEditing(undefined)} />
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                onConfirm={async () => {
                    if (!deleting) return
                    try {
                        await remove.mutateAsync(deleting.id)
                        toast.success('تم الحذف.')
                        setDeleting(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                    }
                }}
                title="حذف المصروف الدوري"
                message={`حذف «${deleting?.name ?? ''}»؟ لن يؤثر على أي سداد سابق.`}
                confirmLabel="حذف"
                loading={remove.isPending}
                danger
            />
        </section>
    )
}

function PayButton({ expense }: { expense: RecurringExpense }) {
    const toast = useToast()
    const pay = usePayRecurringExpense()

    return (
        <button
            onClick={async () => {
                if (!window.confirm(`سداد ${expense.name} بمبلغ ${formatMoney(expense.amount)}؟`)) return
                try {
                    await pay.mutateAsync(expense.id)
                    toast.success('تم السداد وتحديث موعد الاستحقاق التالي.')
                } catch (caught) {
                    toast.error(errorMessage(caught, 'تعذّر السداد.'))
                }
            }}
            disabled={pay.isPending}
            className="tap flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
        >
            <Wallet className="size-3.5" />
            سداد
        </button>
    )
}

function RecurringExpenseDialog({
    expense,
    onClose,
}: {
    expense: RecurringExpense | null
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveRecurringExpense(expense?.id)
    const { data: boxes } = useCashBoxes()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: expense?.name ?? '',
        amount: expense ? String(expense.amount) : '',
        category: expense?.category ?? '',
        cash_box_id: expense?.cash_box_id ? String(expense.cash_box_id) : '',
        cycle_days: String(expense?.cycle_days ?? 30),
        start_on: expense?.start_on ?? new Date().toISOString().slice(0, 10),
        is_active: expense?.is_active ?? true,
        notes: expense?.notes ?? '',
    })
    const set = (k: keyof typeof form) => (v: string | boolean) =>
        setForm((c) => ({ ...c, [k]: v }))

    return (
        <Modal
            open
            onClose={onClose}
            title={expense ? 'تعديل مصروف دوري' : 'مصروف دوري جديد'}
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
                                    name: form.name,
                                    amount: Number(form.amount),
                                    category: form.category || null,
                                    cash_box_id: form.cash_box_id ? Number(form.cash_box_id) : null,
                                    cycle_days: Number(form.cycle_days),
                                    start_on: form.start_on,
                                    is_active: form.is_active,
                                    notes: form.notes || null,
                                })
                                toast.success('تم الحفظ.')
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
                <Field label="البيان" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(e) => set('name')(e.target.value)}
                        placeholder="إيجار المقر، اشتراك الإنترنت…"
                    />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="المبلغ" required error={errors.amount}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.amount}
                            onChange={(e) => set('amount')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                    <Field label="الدورة" required error={errors.cycle_days}>
                        <Select
                            value={form.cycle_days}
                            onChange={(e) => set('cycle_days')(e.target.value)}
                        >
                            {CYCLES.map((c) => (
                                <option key={c.days} value={c.days}>
                                    {c.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="أول استحقاق" required error={errors.start_on}>
                        <Input
                            type="date"
                            value={form.start_on}
                            onChange={(e) => set('start_on')(e.target.value)}
                        />
                    </Field>
                    <Field label="من خزينة" error={errors.cash_box_id}>
                        <Select
                            value={form.cash_box_id}
                            onChange={(e) => set('cash_box_id')(e.target.value)}
                        >
                            <option value="">الرئيسية</option>
                            {boxes?.map((box) => (
                                <option key={box.id} value={box.id}>
                                    {box.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <Field label="البند" error={errors.category} hint="إيجارات، اشتراكات…">
                    <Input value={form.category} onChange={(e) => set('category')(e.target.value)} />
                </Field>

                <Field label="ملاحظة" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} rows={2} />
                </Field>

                {expense && (
                    <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => set('is_active')(e.target.checked)}
                            className="size-4 rounded border-navy-300"
                        />
                        مُفعّل (يذكّر بالاستحقاق)
                    </label>
                )}
            </div>
        </Modal>
    )
}

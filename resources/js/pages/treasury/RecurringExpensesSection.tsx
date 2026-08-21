import clsx from 'clsx'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { tr } from '@/lib/i18n'
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
    useRecurringExpenseItems,
    useRecurringExpenses,
    useSaveRecurringExpense,
} from '@/lib/queries'
import type { RecurringExpense } from '@/types'

const CYCLES: Array<{ days: number; label: string }> = [
    { days: 30, label: tr('شهري') },
    { days: 60, label: tr('كل شهرين') },
    { days: 90, label: tr('ربع سنوي') },
    { days: 180, label: tr('نصف سنوي') },
    { days: 365, label: tr('سنوي') },
]

function cycleLabel(days: number): string {
    return CYCLES.find((c) => c.days === days)?.label ?? `كل ${days} يوم`
}

/** How soon it is due, worded and coloured — the reminder at a glance. */
function dueChip(days: number): { text: string; className: string } {
    if (days < 0) return { text: `متأخر ${Math.abs(days)} يوم`, className: 'bg-red-50 text-red-700' }
    if (days === 0) return { text: tr('مستحق اليوم'), className: 'bg-red-50 text-red-700' }
    if (days <= 3) return { text: `خلال ${days} يوم`, className: 'bg-amber-50 text-amber-700' }
    return { text: `بعد ${days} يوم`, className: 'bg-navy-100 text-navy-500' }
}

/**
 * The fixed, recurring bills — rent, a line, a licence — with the reminder that
 * lights up three days before each is due and stays until it is paid. Paying
 * rolls the schedule forward one cycle.
 */
export function RecurringExpensesSection() {
    const [view, setView] = useViewMode('recurring-expenses')
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
                    {tr('مصروف دوري جديد')}
                </Button>
            </div>

            <div className="mb-3 flex justify-end">
                <ViewToggle view={view} onChange={setView} />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : expenses.length === 0 ? (
                <EmptyState
                    icon={CalendarClock}
                    title="لا مصروفات دورية"
                    description="أضف الإيجار والاشتراكات الثابتة ليذكّرك النظام قبل استحقاقها بثلاثة أيام."
                />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="0"
                    className="recurring-expenses-table-wrap"
                    tableClassName="table-fixed compact-table recurring-expenses-table"
                    headers={[
                        { label: 'بند المصروف', className: 'w-[34%]' },
                        { label: 'الخزينة', className: 'w-[22%]' },
                        { label: 'الدورة', className: 'w-[15%]' },
                        { label: 'الاستحقاق القادم', className: 'w-[18%]' },
                        { label: 'المبلغ', className: 'w-[11%] text-end' },
                    ]}
                >
                    {expenses.map((expense) => (
                        <tr
                            key={expense.id}
                            className={clsx(
                                'border-t border-navy-100 hover:bg-navy-50/60',
                                // What falls due next is the reason this list
                                // is open at all.
                                expense.is_due_soon && 'bg-amber-50/60',
                            )}
                        >
                            <td data-label="بند المصروف" className="px-2 py-2 font-semibold text-navy-800" title={expense.name}>
                                <span className="block truncate">{expense.name}</span>
                            </td>
                            <td data-label="الخزينة" className="px-2 py-2 text-navy-600" title={expense.cash_box ?? undefined}>
                                <span className="block truncate">{expense.cash_box ?? '—'}</span>
                            </td>
                            <td data-label="الدورة" className="tabular whitespace-nowrap px-2 py-2 text-navy-600">
                                {expense.cycle_days} يوم
                            </td>
                            <td
                                data-label="الاستحقاق القادم"
                                className={clsx(
                                    'tabular whitespace-nowrap px-2 py-2',
                                    expense.is_due_soon
                                        ? 'font-bold text-amber-700'
                                        : 'text-navy-600',
                                )}
                            >
                                {expense.next_due_on ? formatDate(expense.next_due_on) : '—'}
                            </td>
                            <td data-label="المبلغ" className="tabular whitespace-nowrap px-2 py-2 text-end font-bold text-navy-900">
                                {formatMoney(expense.amount)}
                            </td>
                        </tr>
                    ))}
                </DataTable>
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
                                                    {tr('موقوف')}
                                                </span>
                                            )}
                                            <span className={clsx('badge', chip.className)}>{chip.text}</span>
                                        </div>
                                        <p className="tabular mt-1 text-[11px] text-navy-400">
                                            {cycleLabel(expense.cycle_days)}
                                            {' · '}
                                            الاستحقاق {expense.next_due_on && formatDate(expense.next_due_on)}
                                            {expense.cash_box && ` · ${expense.cash_box}`}
                                            {expense.items.length > 0 && ` · ${expense.items.map((item) => item.label).join('، ')}`}
                                            {expense.items.length === 0 && expense.category && ` · ${expense.category}`}
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
                                        {tr('تعديل')}
                                    </button>
                                    <button
                                        onClick={() => setDeleting(expense)}
                                        className="tap flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                    >
                                        <Trash2 className="size-3.5" />
                                        {tr('حذف')}
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
            {tr('سداد')}
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
    const { data: availableItems = [] } = useRecurringExpenseItems()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [newItemLabel, setNewItemLabel] = useState('')

    const [form, setForm] = useState({
        name: expense?.name ?? '',
        amount: expense ? String(expense.amount) : '',
        category: expense?.category ?? '',
        item_ids: expense?.items.map((item) => item.id) ?? [],
        new_item_labels: [] as string[],
        cash_box_id: expense?.cash_box_id ? String(expense.cash_box_id) : '',
        cycle_days: String(expense?.cycle_days ?? 30),
        start_on: expense?.start_on ?? new Date().toISOString().slice(0, 10),
        is_active: expense?.is_active ?? true,
        notes: expense?.notes ?? '',
    })
    const set = (k: keyof typeof form) => (v: string | boolean) =>
        setForm((c) => ({ ...c, [k]: v }))
    const toggleItem = (id: number) =>
        setForm((current) => ({
            ...current,
            item_ids: current.item_ids.includes(id)
                ? current.item_ids.filter((itemId) => itemId !== id)
                : [...current.item_ids, id],
        }))
    const addNewItem = () => {
        const label = newItemLabel.trim()
        const hasSameExisting = availableItems.some(
            (item) => item.label.localeCompare(label, 'ar', { sensitivity: 'accent' }) === 0,
        )
        const hasSameNew = form.new_item_labels.some(
            (item) => item.localeCompare(label, 'ar', { sensitivity: 'accent' }) === 0,
        )

        if (!label || hasSameExisting || hasSameNew) return

        setForm((current) => ({ ...current, new_item_labels: [...current.new_item_labels, label] }))
        setNewItemLabel('')
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={expense ? 'تعديل مصروف دوري' : 'مصروف دوري جديد'}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        {tr('إلغاء')}
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
                                    item_ids: form.item_ids,
                                    new_item_labels: form.new_item_labels,
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
                        {tr('حفظ')}
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                <Field
                    label="البند"
                    error={errors.item_ids ?? errors.new_item_labels}
                    hint="اختر بندًا أو أضف بندًا جديدًا ليُستخدم في المصروفات القادمة."
                >
                    <div className="space-y-2 rounded-xl border border-navy-100 bg-navy-50/40 p-2.5">
                        {availableItems.length > 0 ? (
                            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                                {availableItems.map((item) => {
                                    const selected = form.item_ids.includes(item.id)

                                    return (
                                        <label
                                            key={item.id}
                                            className={clsx(
                                                'tap inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold transition',
                                                selected
                                                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                                                    : 'border-navy-100 bg-white text-navy-600 hover:border-brand-200',
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => toggleItem(item.id)}
                                                className="size-3.5 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
                                            />
                                            {item.label}
                                        </label>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="text-xs text-navy-400">لا توجد بنود بعد؛ أضف أول بند أدناه.</p>
                        )}

                        {form.new_item_labels.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 border-t border-navy-100 pt-2">
                                {form.new_item_labels.map((label) => (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() =>
                                            setForm((current) => ({
                                                ...current,
                                                new_item_labels: current.new_item_labels.filter((item) => item !== label),
                                            }))
                                        }
                                        className="tap rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                                        title="إزالة البند الجديد"
                                    >
                                        {label} ×
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2 border-t border-navy-100 pt-2">
                            <Input
                                value={newItemLabel}
                                onChange={(e) => setNewItemLabel(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        addNewItem()
                                    }
                                }}
                                placeholder="بند جديد، مثل: صيانة مصعد"
                            />
                            <Button type="button" variant="secondary" className="shrink-0" onClick={addNewItem}>
                                <Plus className="size-4" />
                                إضافة
                            </Button>
                        </div>
                    </div>
                </Field>

                <Field label="التصنيف المحاسبي" error={errors.category} hint="اختياري ويُستخدم عند تسجيل السداد.">
                    <Input value={form.category} onChange={(e) => set('category')(e.target.value)} placeholder="إيجارات، اشتراكات…" />
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

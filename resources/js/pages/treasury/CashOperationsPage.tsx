import { ArrowLeftRight, Banknote } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PageHeader, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { useCashBoxes, useTreasuryOperation } from '@/lib/queries'

/**
 * The two cash operations that are not a customer or supplier settlement:
 * moving money between boxes, and paying a plain expense. Kept on one screen —
 * the day's petty-cash desk — beside the boxes they draw on.
 */
export function CashOperationsPage() {
    const { data: boxes } = useCashBoxes()

    return (
        <>
            <PageHeader title="تحويل الخزينة والمصروفات" subtitle="تحويل بين الخزائن وتسجيل المصروفات" />

            <div className="grid gap-4 lg:grid-cols-2">
                <TransferCard boxes={boxes ?? []} />
                <ExpenseCard boxes={boxes ?? []} />
            </div>
        </>
    )
}

type Box = { id: number; name: string; type_label: string; balance: number }

function TransferCard({ boxes }: { boxes: Box[] }) {
    const toast = useToast()
    const transfer = useTreasuryOperation('transfer')
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({ from_box_id: '', to_box_id: '', amount: '', note: '' })
    const set = (k: keyof typeof form) => (v: string) => setForm((c) => ({ ...c, [k]: v }))
    const same = form.from_box_id && form.from_box_id === form.to_box_id

    return (
        <div className="card space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-bold text-navy-900">
                <ArrowLeftRight className="size-4.5 text-brand-600" />
                تحويل بين الخزائن
            </h2>

            <Field label="من" required error={errors.from_box_id}>
                <Select value={form.from_box_id} onChange={(e) => set('from_box_id')(e.target.value)}>
                    <option value="">— اختر —</option>
                    {boxes.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.name} · {formatMoney(b.balance)}
                        </option>
                    ))}
                </Select>
            </Field>
            <Field label="إلى" required error={errors.to_box_id}>
                <Select value={form.to_box_id} onChange={(e) => set('to_box_id')(e.target.value)}>
                    <option value="">— اختر —</option>
                    {boxes.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.name} · {b.type_label}
                        </option>
                    ))}
                </Select>
            </Field>
            {same && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                    لا يمكن التحويل إلى نفس الخزينة.
                </p>
            )}
            <Field label="المبلغ" required error={errors.amount}>
                <Input type="number" min={0} step="any" value={form.amount} onChange={(e) => set('amount')(e.target.value)} dir="ltr" className="text-left" />
            </Field>
            <Field label="ملاحظة" error={errors.note}>
                <Textarea value={form.note} onChange={(e) => set('note')(e.target.value)} rows={2} />
            </Field>

            <Button
                icon={ArrowLeftRight}
                className="w-full"
                loading={transfer.isPending}
                disabled={!form.from_box_id || !form.to_box_id || !form.amount || Boolean(same)}
                onClick={async () => {
                    setErrors({})
                    try {
                        await transfer.mutateAsync({
                            from_box_id: Number(form.from_box_id),
                            to_box_id: Number(form.to_box_id),
                            amount: Number(form.amount),
                            note: form.note || null,
                        })
                        toast.success('تم التحويل.')
                        setForm({ from_box_id: '', to_box_id: '', amount: '', note: '' })
                    } catch (caught) {
                        setErrors(fieldErrors(caught))
                        toast.error(errorMessage(caught, 'تعذّر التحويل.'))
                    }
                }}
            >
                تنفيذ التحويل
            </Button>
        </div>
    )
}

function ExpenseCard({ boxes }: { boxes: Box[] }) {
    const toast = useToast()
    const expense = useTreasuryOperation('expense')
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({ cash_box_id: '', amount: '', category: '', note: '' })
    const set = (k: keyof typeof form) => (v: string) => setForm((c) => ({ ...c, [k]: v }))

    return (
        <div className="card space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-bold text-navy-900">
                <Banknote className="size-4.5 text-red-600" />
                تسجيل مصروف
            </h2>

            <Field label="الخزينة" required error={errors.cash_box_id}>
                <Select value={form.cash_box_id} onChange={(e) => set('cash_box_id')(e.target.value)}>
                    <option value="">— اختر —</option>
                    {boxes.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.name} · {formatMoney(b.balance)}
                        </option>
                    ))}
                </Select>
            </Field>
            <Field label="البند" error={errors.category} hint="إيجار، كهرباء، وقود…">
                <Input value={form.category} onChange={(e) => set('category')(e.target.value)} />
            </Field>
            <Field label="المبلغ" required error={errors.amount}>
                <Input type="number" min={0} step="any" value={form.amount} onChange={(e) => set('amount')(e.target.value)} dir="ltr" className="text-left" />
            </Field>
            <Field label="ملاحظة" error={errors.note}>
                <Textarea value={form.note} onChange={(e) => set('note')(e.target.value)} rows={2} />
            </Field>

            <Button
                icon={Banknote}
                variant="secondary"
                className="w-full"
                loading={expense.isPending}
                disabled={!form.cash_box_id || !form.amount}
                onClick={async () => {
                    setErrors({})
                    try {
                        await expense.mutateAsync({
                            cash_box_id: Number(form.cash_box_id),
                            amount: Number(form.amount),
                            category: form.category || null,
                            note: form.note || null,
                        })
                        toast.success('تم تسجيل المصروف.')
                        setForm({ cash_box_id: '', amount: '', category: '', note: '' })
                    } catch (caught) {
                        setErrors(fieldErrors(caught))
                        toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                    }
                }}
            >
                تسجيل المصروف
            </Button>
        </div>
    )
}

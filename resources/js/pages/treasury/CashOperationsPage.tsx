import { ArrowLeftRight, Banknote, HandCoins } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PageHeader, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { useCashBoxes, useTreasuryOperation, useUsers } from '@/lib/queries'
import { RecurringExpensesSection } from '@/pages/treasury/RecurringExpensesSection'

/**
 * The two cash operations that are not a customer or supplier settlement:
 * moving money between boxes, and paying a plain expense. Kept on one screen —
 * the day's petty-cash desk — beside the boxes they draw on.
 */
export function CashOperationsPage() {
    const { data: boxes } = useCashBoxes()

    return (
        <>
            <PageHeader
                title="عمليات الخزينة"
                subtitle="تحويل بين الخزائن وتسجيل المصروفات والإيداعات الخارجية"
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <TransferCard boxes={boxes ?? []} />
                <ExpenseCard boxes={boxes ?? []} />
                <DepositCard boxes={boxes ?? []} />
            </div>

            <div className="mt-4">
                <RecurringExpensesSection />
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
    const [form, setForm] = useState({
        cash_box_id: '',
        amount: '',
        category: '',
        responsible_user_id: '',
        note: '',
    })
    const set = (k: keyof typeof form) => (v: string) => setForm((c) => ({ ...c, [k]: v }))

    // Who the money was spent for. Separate from whoever is at the screen:
    // a manager records a technician's fuel, and later the question is whose.
    const { data: userPage } = useUsers({ active_only: 1, per_page: 200 })

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
            <Field
                label="الموظف المسؤول"
                error={errors.responsible_user_id}
                hint="من صُرف عليه المصروف — اتركه فارغًا لو مصروف عام على الشركة."
            >
                <Select
                    value={form.responsible_user_id}
                    onChange={(e) => set('responsible_user_id')(e.target.value)}
                >
                    <option value="">— مصروف عام —</option>
                    {userPage?.data.map((user) => (
                        <option key={user.id} value={user.id}>
                            {user.name}
                            {user.role_label ? ` — ${user.role_label}` : ''}
                        </option>
                    ))}
                </Select>
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
                            responsible_user_id: form.responsible_user_id
                                ? Number(form.responsible_user_id)
                                : null,
                            note: form.note || null,
                        })
                        toast.success('تم تسجيل المصروف.')
                        setForm({
                            cash_box_id: '',
                            amount: '',
                            category: '',
                            responsible_user_id: '',
                            note: '',
                        })
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

/**
 * Money in from someone who is not a customer — a refund, an outside party's
 * deposit, the owner topping up the till. Its own voucher, so it is never
 * mistaken for a customer settling an invoice.
 */
function DepositCard({ boxes }: { boxes: Box[] }) {
    const toast = useToast()
    const deposit = useTreasuryOperation('deposit')
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({ cash_box_id: '', amount: '', party: '', note: '' })
    const set = (k: keyof typeof form) => (v: string) => setForm((c) => ({ ...c, [k]: v }))

    return (
        <div className="card space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-bold text-navy-900">
                <HandCoins className="size-4.5 text-emerald-600" />
                إيداع خارجي
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
            <Field label="الجهة المودِعة" required error={errors.party} hint="اسم الشخص أو الجهة">
                <Input value={form.party} onChange={(e) => set('party')(e.target.value)} />
            </Field>
            <Field label="المبلغ" required error={errors.amount}>
                <Input type="number" min={0} step="any" value={form.amount} onChange={(e) => set('amount')(e.target.value)} dir="ltr" className="text-left" />
            </Field>

            <Button
                icon={HandCoins}
                variant="secondary"
                className="w-full"
                loading={deposit.isPending}
                disabled={!form.cash_box_id || !form.amount || !form.party.trim()}
                onClick={async () => {
                    setErrors({})
                    try {
                        await deposit.mutateAsync({
                            cash_box_id: Number(form.cash_box_id),
                            amount: Number(form.amount),
                            party: form.party.trim(),
                            note: form.note || null,
                        })
                        toast.success('تم تسجيل الإيداع.')
                        setForm({ cash_box_id: '', amount: '', party: '', note: '' })
                    } catch (caught) {
                        setErrors(fieldErrors(caught))
                        toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                    }
                }}
            >
                تسجيل الإيداع
            </Button>
        </div>
    )
}

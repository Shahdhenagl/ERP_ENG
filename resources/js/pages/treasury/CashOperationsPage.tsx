import { Banknote, HandCoins } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PageHeader, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { useCashBoxes, useTreasuryOperation, useUsers } from '@/lib/queries'
import { RecurringExpensesSection } from '@/pages/treasury/RecurringExpensesSection'
import {
    ExpenseAccountChecklist,
    isTransportCustodyExpenseAccount,
} from '@/components/ExpenseAccountChecklist'
import type { Account } from '@/types'
import { TransportBranchPicker } from '@/components/TransportBranchPicker'

/**
 * Cash operations that are not customer or supplier settlements: recording
 * expenses and external deposits. Transfers between boxes are managed from
 * the dedicated treasury workflow and are not recorded from this screen.
 */
export function CashOperationsPage() {
    const { data: boxes } = useCashBoxes()

    return (
        <>
            <PageHeader
                title="عمليات الخزينة"
                subtitle="تسجيل المصروفات والإيداعات الخارجية على الخزائن"
            />

            <div className="grid gap-4 lg:grid-cols-2">
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

const PAYMENT_METHOD_OPTIONS = [
    { value: 'cash', label: 'كاش' },
    { value: 'bank_transfer', label: 'تحويل بنكي' },
    { value: 'instapay', label: 'إنستا باي' },
    { value: 'vodafone_cash', label: 'فودافون كاش' },
] as const

const defaultTransactionDate = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())

    return now.toISOString().slice(0, 10)
}

function ExpenseCard({ boxes }: { boxes: Box[] }) {
    const toast = useToast()
    const expense = useTreasuryOperation('expense')
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({
        cash_box_id: '',
        amount: '',
        transaction_date: defaultTransactionDate(),
        payment_method: 'cash',
        account_id: '',
        responsible_user_id: '',
        note: '',
        branch_ids: [] as number[],
    })
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
    const set = (k: keyof Omit<typeof form, 'branch_ids'>) => (v: string) =>
        setForm((current) => ({ ...current, [k]: v }))

    const isTransportCustody = isTransportCustodyExpenseAccount(selectedAccount)

    // Who the money was spent for. Separate from whoever is at the screen.
    const { data: userPage } = useUsers({ active_only: 1, per_page: 200 })

    return (
        <div className="card overflow-hidden p-0">
            <div className="border-b border-red-100 bg-gradient-to-l from-red-50 via-white to-white px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 font-bold text-navy-900">
                            <span className="grid size-9 place-items-center rounded-xl bg-red-100 text-red-600">
                                <Banknote className="size-4.5" />
                            </span>
                            {tr('تسجيل مصروف')}
                        </h2>
                        <p className="mt-1 text-xs text-navy-400">سجّل المصروف واربطه بحساب المصروف المناسب.</p>
                    </div>
                    <span className="badge bg-red-50 text-red-600">مصروف</span>
                </div>
            </div>

            <div className="space-y-4 p-5">
                <Field label="الخزينة" required error={errors.cash_box_id}>
                    <Select value={form.cash_box_id} onChange={(e) => set('cash_box_id')(e.target.value)}>
                        <option value="">— اختر الخزينة —</option>
                        {boxes.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} · الرصيد {formatMoney(box.balance)}
                            </option>
                        ))}
                    </Select>
                </Field>

                <ExpenseAccountChecklist
                    value={form.account_id}
                    onChange={set('account_id')}
                    onAccountChange={(account) => {
                        setSelectedAccount(account)
                        if (!isTransportCustodyExpenseAccount(account)) {
                            setForm((current) => ({ ...current, branch_ids: [] }))
                        }
                    }}
                    error={errors.account_id}
                />

                {isTransportCustody && (
                    <TransportBranchPicker
                        value={form.branch_ids}
                        onChange={(branch_ids) => setForm((current) => ({ ...current, branch_ids }))}
                        error={errors.branch_ids}
                    />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="تاريخ الصرف" required error={errors.transaction_date}>
                        <Input
                            type="date"
                            value={form.transaction_date}
                            onChange={(e) => set('transaction_date')(e.target.value)}
                        />
                    </Field>
                    <Field label="طريقة الصرف" required error={errors.payment_method}>
                        <Select
                            value={form.payment_method}
                            onChange={(e) => set('payment_method')(e.target.value)}
                        >
                            {PAYMENT_METHOD_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="المبلغ" required error={errors.amount}>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={form.amount}
                            onChange={(e) => set('amount')(e.target.value)}
                            dir="ltr"
                            className="text-left font-bold"
                            placeholder="0.00"
                        />
                    </Field>
                    <Field
                        label="الموظف المسؤول"
                        error={errors.responsible_user_id}
                        hint="اختياري للمصروفات العامة."
                    >
                        <Select
                            value={form.responsible_user_id}
                            onChange={(e) => set('responsible_user_id')(e.target.value)}
                        >
                            <option value="">— مصروف عام —</option>
                            {userPage?.data.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name}
                                    {(user.effective_role_label ?? user.role_label)
                                        ? ` — ${user.effective_role_label ?? user.role_label}`
                                        : ''}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <Field label="البيان أو الملاحظة" error={errors.note}>
                    <Textarea
                        value={form.note}
                        onChange={(e) => set('note')(e.target.value)}
                        rows={3}
                        placeholder="أضف تفاصيل المصروف عند الحاجة…"
                    />
                </Field>

                <Button
                    icon={Banknote}
                    variant="secondary"
                    className="w-full"
                    loading={expense.isPending}
                    disabled={
                        !form.cash_box_id
                        || !form.amount
                        || !form.account_id
                        || (isTransportCustody && form.branch_ids.length === 0)
                    }
                    onClick={async () => {
                        setErrors({})
                        try {
                            await expense.mutateAsync({
                                cash_box_id: Number(form.cash_box_id),
                                amount: Number(form.amount),
                                transaction_date: form.transaction_date,
                                payment_method: form.payment_method,
                                account_id: Number(form.account_id),
                                responsible_user_id: form.responsible_user_id
                                    ? Number(form.responsible_user_id)
                                    : null,
                                note: form.note || null,
                                branch_ids: isTransportCustody ? form.branch_ids : [],
                            })
                            toast.success('تم تسجيل المصروف.')
                            setForm({
                                cash_box_id: '',
                                amount: '',
                                transaction_date: defaultTransactionDate(),
                                payment_method: 'cash',
                                account_id: '',
                                responsible_user_id: '',
                                note: '',
                                branch_ids: [],
                            })
                            setSelectedAccount(null)
                        } catch (caught) {
                            setErrors(fieldErrors(caught))
                            toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                        }
                    }}
                >
                    {tr('تسجيل المصروف')}
                </Button>
            </div>
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
    const [form, setForm] = useState({
        cash_box_id: '',
        amount: '',
        transaction_date: defaultTransactionDate(),
        payment_method: 'cash',
        party: '',
        note: '',
    })
    const set = (k: keyof typeof form) => (v: string) => setForm((c) => ({ ...c, [k]: v }))

    return (
        <div className="card space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-bold text-navy-900">
                <HandCoins className="size-4.5 text-emerald-600" />
                {tr('إيداع خارجي')}
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
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="تاريخ الإيداع" required error={errors.transaction_date}>
                    <Input
                        type="date"
                        value={form.transaction_date}
                        onChange={(e) => set('transaction_date')(e.target.value)}
                    />
                </Field>
                <Field label="طريقة الإيداع" required error={errors.payment_method}>
                    <Select
                        value={form.payment_method}
                        onChange={(e) => set('payment_method')(e.target.value)}
                    >
                        {PAYMENT_METHOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </Select>
                </Field>
            </div>

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
                            transaction_date: form.transaction_date,
                            payment_method: form.payment_method,
                            party: form.party.trim(),
                            note: form.note || null,
                        })
                        toast.success('تم تسجيل الإيداع.')
                        setForm({
                            cash_box_id: '',
                            amount: '',
                            transaction_date: defaultTransactionDate(),
                            payment_method: 'cash',
                            party: '',
                            note: '',
                        })
                    } catch (caught) {
                        setErrors(fieldErrors(caught))
                        toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                    }
                }}
            >
                {tr('تسجيل الإيداع')}
            </Button>
        </div>
    )
}

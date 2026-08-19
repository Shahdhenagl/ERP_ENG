import { Field } from '@/components/ui'
import { useAccounts } from '@/lib/queries'
import type { Account } from '@/types'

export function ExpenseAccountChecklist({
    value,
    onChange,
    error,
}: {
    value: string
    onChange: (value: string) => void
    error?: string
}) {
    const { data: accounts, isLoading } = useAccounts({ type: 'expense', is_group: 0, is_active: 1 })
    const expenseAccounts = (accounts ?? []).filter(
        (account: Account) => account.type === 'expense' && !account.is_group && account.is_active,
    )

    return (
        <Field
            label="بند المصروف"
            required
            error={error}
            hint="اختر بنداً واحداً من حسابات المصروفات المستخدمة في القيود اليومية."
        >
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {isLoading && <p className="text-sm text-slate-500">جاري تحميل بنود المصروف...</p>}
                {!isLoading && expenseAccounts.length === 0 && (
                    <p className="text-sm text-slate-500">لا توجد حسابات مصروفات فعالة قابلة للاختيار.</p>
                )}
                {expenseAccounts.map((account) => {
                    const selected = value === String(account.id)

                    return (
                        <label
                            key={account.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                                selected
                                    ? 'border-brand-500 bg-brand-50 text-brand-900'
                                    : 'border-transparent bg-white text-slate-700 hover:border-slate-300'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => onChange(selected ? '' : String(account.id))}
                                className="size-4 accent-brand-600"
                            />
                            <span>
                                <span className="font-semibold">{account.code}</span>
                                <span className="mx-1 text-slate-400">—</span>
                                {account.name}
                            </span>
                        </label>
                    )
                })}
            </div>
        </Field>
    )
}

export default ExpenseAccountChecklist

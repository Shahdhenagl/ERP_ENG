import { Field, Select } from '@/components/ui'
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
            hint="اختر حساب المصروف الذي سيظهر في القيود اليومية."
        >
            <Select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={isLoading || expenseAccounts.length === 0}
            >
                <option value="">
                    {isLoading ? 'جاري تحميل بنود المصروف…' : '— اختر بند المصروف —'}
                </option>
                {expenseAccounts.map((account) => (
                    <option key={account.id} value={String(account.id)}>
                        {account.code} — {account.name}
                    </option>
                ))}
            </Select>
            {!isLoading && expenseAccounts.length === 0 && (
                <p className="mt-1.5 text-xs font-medium text-amber-700">
                    لا توجد حسابات مصروفات فعالة قابلة للاختيار.
                </p>
            )}
        </Field>
    )
}

export default ExpenseAccountChecklist

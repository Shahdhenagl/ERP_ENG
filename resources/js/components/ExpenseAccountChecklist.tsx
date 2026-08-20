import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/lib/auth'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAccounts, useSaveAccount } from '@/lib/queries'
import type { Account } from '@/types'
import { Plus, Save } from 'lucide-react'
import { useState } from 'react'
import { Button, Field, Input, Select } from '@/components/ui'

export function ExpenseAccountChecklist({
    value,
    onChange,
    error,
}: {
    value: string
    onChange: (value: string) => void
    error?: string
}) {
    const toast = useToast()
    const { can } = useAuth()
    const canManageAccounts = can('accounting.manage')
    const { data: accounts, isLoading, refetch } = useAccounts()
    const saveAccount = useSaveAccount()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [dialogErrors, setDialogErrors] = useState<Record<string, string>>({})
    const [newAccount, setNewAccount] = useState({ code: '', name: '', parent_id: '' })

    const expenseAccounts = (accounts ?? []).filter(
        (account: Account) => account.type === 'expense' && !account.is_group && account.is_active,
    )
    const expenseGroups = (accounts ?? []).filter(
        (account: Account) => account.type === 'expense' && account.is_group && account.is_active,
    )

    const openCreateDialog = () => {
        setDialogErrors({})
        setNewAccount({ code: '', name: '', parent_id: '' })
        setDialogOpen(true)
    }

    const createAccount = async () => {
        setDialogErrors({})

        try {
            const response = await saveAccount.mutateAsync({
                code: newAccount.code.trim(),
                name: newAccount.name.trim(),
                type: 'expense',
                parent_id: newAccount.parent_id ? Number(newAccount.parent_id) : null,
                is_group: false,
            }) as Account & { data?: Account }

            await refetch()
            const createdId = response.data?.id ?? response.id
            if (createdId) onChange(String(createdId))
            toast.success('تمت إضافة بند المصروف إلى شجرة الحسابات.')
            setDialogOpen(false)
        } catch (caught) {
            setDialogErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّرت إضافة بند المصروف.'))
        }
    }

    return (
        <>
            <Field
                label="بند المصروف"
                required
                error={error}
                hint="اختر حسابًا موجودًا أو أضف بندًا فرعيًا جديدًا؛ سيظهر البند في شجرة الحسابات والقيود اليومية."
            >
                <div className="flex items-start gap-2">
                    <Select
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        disabled={isLoading}
                        className="min-w-0 flex-1"
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
                    {canManageAccounts && (
                        <button
                            type="button"
                            onClick={openCreateDialog}
                            className="tap inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2.5 text-xs font-bold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-100"
                        >
                            <Plus className="size-3.5" />
                            <span className="hidden sm:inline">إضافة بند</span>
                        </button>
                    )}
                </div>
                {!isLoading && expenseAccounts.length === 0 && (
                    <p className="mt-1.5 text-xs font-medium text-amber-700">
                        لا توجد حسابات مصروفات فعالة قابلة للاختيار؛ يمكن لمسؤول دليل الحسابات إضافة أول بند.
                    </p>
                )}
            </Field>

            <Modal
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                title="إضافة بند مصروف"
                description="سيُحفظ كبند مصروف عادي داخل شجرة الحسابات، ويمكن استخدامه لاحقًا من كل نماذج المصروفات."
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saveAccount.isPending}>
                            إلغاء
                        </Button>
                        <Button icon={Save} loading={saveAccount.isPending} onClick={() => void createAccount()}>
                            حفظ البند
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="رقم الحساب" required error={dialogErrors.code}>
                            <Input
                                value={newAccount.code}
                                onChange={(event) => setNewAccount((current) => ({ ...current, code: event.target.value }))}
                                placeholder="5208"
                                dir="ltr"
                                className="text-left"
                            />
                        </Field>
                        <Field label="اسم البند" required error={dialogErrors.name}>
                            <Input
                                value={newAccount.name}
                                onChange={(event) => setNewAccount((current) => ({ ...current, name: event.target.value }))}
                                placeholder="مصروفات نقل"
                            />
                        </Field>
                    </div>
                    <Field label="نوع المصروف في الشجرة" error={dialogErrors.parent_id} hint="اختياري؛ اختر الحساب التجميعي الذي سيظهر تحته البند.">
                        <Select
                            value={newAccount.parent_id}
                            onChange={(event) => setNewAccount((current) => ({ ...current, parent_id: event.target.value }))}
                        >
                            <option value="">— بدون حساب أب —</option>
                            {expenseGroups.map((group) => (
                                <option key={group.id} value={String(group.id)}>
                                    {group.code} — {group.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>
            </Modal>
        </>
    )
}

export default ExpenseAccountChecklist

import clsx from 'clsx'
import { BookOpen, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
    Button,
    EmptyState,
    Field,
    Input,
    Select,
    SkeletonCard,
    Textarea,
} from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/domain'
import { useArea } from '@/lib/nav'
import { useAccounts, useDeleteAccount, useSaveAccount } from '@/lib/queries'
import { useAccounting } from '@/pages/accounting/AccountingLayout'
import type { Account, AccountType } from '@/types'

/**
 * The chart, as one indented list.
 *
 * Indented rather than collapsible: a chart of accounts is read top to bottom
 * to find where something belongs, and a tree that hides half of it makes that
 * harder rather than tidier.
 */

const TYPES: Array<[AccountType, string]> = [
    ['asset', 'أصول'],
    ['liability', 'خصوم'],
    ['equity', 'حقوق ملكية'],
    ['revenue', 'إيرادات'],
    ['expense', 'مصروفات'],
]

const TYPE_TONE: Record<AccountType, string> = {
    asset: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
    liability: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    equity: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    revenue: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    expense: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

export function AccountsPage() {
    const { period } = useAccounting()
    const { user } = useAuth()
    const { path } = useArea()
    const [search, setSearch] = useState('')
    const [editing, setEditing] = useState<Account | null | undefined>(undefined)

    const { data: accounts, isLoading } = useAccounts({ ...period.range, search })
    const isAdmin = user?.role === 'admin'

    return (
        <>
            <div className="mb-4 flex flex-wrap items-end gap-2">
                <Field label="بحث" className="min-w-48 flex-1">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="اسم الحساب أو رقمه"
                    />
                </Field>

                {isAdmin && (
                    <Button icon={Plus} className="mb-0.5" onClick={() => setEditing(null)}>
                        حساب جديد
                    </Button>
                )}
            </div>

            {isLoading && !accounts ? (
                <SkeletonCard />
            ) : !accounts?.length ? (
                <EmptyState icon={BookOpen} title="لا توجد حسابات" />
            ) : (
                <div className="card divide-y divide-navy-100">
                    {accounts.map((account) => (
                        <div
                            key={account.id}
                            className={clsx(
                                'flex items-center gap-3 px-4 py-3',
                                account.is_group && 'bg-navy-50/60',
                                !account.is_active && 'opacity-50',
                            )}
                            // Depth is computed server-side by walking parents,
                            // so a renumbered chart still indents correctly.
                            style={{ paddingRight: `${account.depth * 1.25 + 1}rem` }}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="tabular text-xs font-bold text-navy-400">
                                        {account.code}
                                    </span>
                                    <span
                                        className={clsx(
                                            'truncate text-navy-900',
                                            account.is_group ? 'font-extrabold' : 'font-semibold',
                                        )}
                                    >
                                        {account.name}
                                    </span>
                                    {account.is_system && (
                                        <Lock className="size-3 shrink-0 text-navy-300" />
                                    )}
                                </div>

                                <span
                                    className={clsx(
                                        'badge mt-1 inline-block',
                                        TYPE_TONE[account.type],
                                    )}
                                >
                                    {account.type_label}
                                </span>
                            </div>

                            <p
                                className={clsx(
                                    'tabular shrink-0 text-sm font-extrabold',
                                    account.balance < 0 ? 'text-red-600' : 'text-navy-900',
                                )}
                            >
                                {formatMoney(account.balance)}
                            </p>

                            <div className="flex shrink-0 items-center gap-1">
                                {!account.is_group && (
                                    <Link
                                        to={`${path('/accounting/ledger')}?account=${account.id}`}
                                        className="tap rounded-lg p-2 text-navy-400 transition hover:bg-navy-100 hover:text-navy-700"
                                        aria-label={`أستاذ ${account.name}`}
                                    >
                                        <BookOpen className="size-4" />
                                    </Link>
                                )}

                                {isAdmin && (
                                    <button
                                        onClick={() => setEditing(account)}
                                        className="tap rounded-lg p-2 text-navy-400 transition hover:bg-navy-100 hover:text-navy-700"
                                        aria-label={`تعديل ${account.name}`}
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing !== undefined && (
                <AccountDialog
                    key={editing?.id ?? 'new'}
                    account={editing}
                    accounts={accounts ?? []}
                    onClose={() => setEditing(undefined)}
                />
            )}
        </>
    )
}

function AccountDialog({
    account,
    accounts,
    onClose,
}: {
    account: Account | null
    accounts: Account[]
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveAccount(account?.id)
    const remove = useDeleteAccount()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        code: account?.code ?? '',
        name: account?.name ?? '',
        type: account?.type ?? ('expense' as AccountType),
        parent_id: account?.parent_id ? String(account.parent_id) : '',
        is_group: account?.is_group ?? false,
        is_active: account?.is_active ?? true,
        notes: account?.notes ?? '',
    })

    // A child under a heading of another type would break every report, so the
    // choice is narrowed rather than validated after the fact.
    const parents = accounts.filter((a) => a.type === form.type && a.id !== account?.id)

    return (
        <Modal
            open
            onClose={onClose}
            title={account ? account.name : 'حساب جديد'}
            size="md"
            footer={
                <>
                    {account && !account.is_system && (
                        <Button
                            variant="ghost"
                            icon={Trash2}
                            className="ml-auto text-red-600"
                            loading={remove.isPending}
                            onClick={async () => {
                                try {
                                    await remove.mutateAsync(account.id)
                                    toast.success('تم حذف الحساب.')
                                    onClose()
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر حذف الحساب.'))
                                }
                            }}
                        >
                            حذف
                        </Button>
                    )}

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
                                    parent_id: form.parent_id ? Number(form.parent_id) : null,
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
                {account?.is_system && (
                    <p className="rounded-xl bg-navy-50 p-3 text-xs text-navy-500">
                        حساب أساسي يعتمد عليه الترحيل الآلي. يمكن تغيير اسمه وموضعه، ولا يمكن حذفه
                        أو تغيير نوعه.
                    </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="رقم الحساب" required error={errors.code}>
                        <Input
                            value={form.code}
                            onChange={(e) => setForm({ ...form, code: e.target.value })}
                            dir="ltr"
                            className="text-left"
                            placeholder="5208"
                        />
                    </Field>

                    <Field label="النوع" required error={errors.type}>
                        <Select
                            value={form.type}
                            disabled={account?.is_system}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    type: e.target.value as AccountType,
                                    // The old parent belongs to the old type.
                                    parent_id: '',
                                })
                            }
                        >
                            {TYPES.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <Field label="الاسم" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="مصروفات نظافة"
                    />
                </Field>

                <Field label="تحت حساب" error={errors.parent_id}>
                    <Select
                        value={form.parent_id}
                        onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                    >
                        <option value="">— بدون —</option>
                        {parents.map((parent) => (
                            <option key={parent.id} value={parent.id}>
                                {parent.code} · {parent.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <label className="flex items-start gap-2.5 text-sm">
                    <input
                        type="checkbox"
                        checked={form.is_group}
                        onChange={(e) => setForm({ ...form, is_group: e.target.checked })}
                        className="mt-0.5 size-4 rounded"
                    />
                    <span>
                        <span className="font-semibold text-navy-800">حساب تجميعي</span>
                        <span className="block text-[11px] text-navy-400">
                            عنوان تُجمَّع تحته الحسابات، ولا تُرحَّل عليه القيود مباشرة.
                        </span>
                    </span>
                </label>

                {account && (
                    <label className="flex items-center gap-2.5 text-sm">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                            className="size-4 rounded"
                        />
                        <span className="font-semibold text-navy-800">مُفعَّل</span>
                    </label>
                )}

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        rows={2}
                        value={form.notes ?? ''}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                </Field>
            </div>
        </Modal>
    )
}

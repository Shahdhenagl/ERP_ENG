import clsx from 'clsx'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/domain'
import { useCostCenters, useDeleteCostCenter, useSaveCostCenter } from '@/lib/queries'
import { useAccounting } from '@/pages/accounting/AccountingLayout'
import type { CostCenterReport } from '@/types'

/**
 * Where the money went, as opposed to what it was spent on.
 *
 * The account says «fuel»; the centre says which branch or contract burnt it.
 * Optional throughout — a company that does not ask the question never has to
 * answer it, which is why an empty list here is a normal state and not a
 * prompt to fill something in.
 */
export function CostCentersPage() {
    const { period } = useAccounting()
    const { user } = useAuth()
    const [editing, setEditing] = useState<CostCenterReport | null | undefined>(undefined)

    const { data: centres, isLoading } = useCostCenters(period.range)
    const isAdmin = user?.role === 'admin'

    if (isLoading && !centres) return <SkeletonCard />

    return (
        <>
            {isAdmin && (
                <Button icon={Plus} className="mb-4" onClick={() => setEditing(null)}>
                    مركز تكلفة جديد
                </Button>
            )}

            {!centres?.length ? (
                <EmptyState
                    icon={Target}
                    title="لا توجد مراكز تكلفة"
                    description="مراكز التكلفة اختيارية — أنشئ واحدًا لكل فرع أو عقد تريد قياس مصروفاته على حدة."
                />
            ) : (
                <div className="space-y-3">
                    {centres.map((centre) => (
                        <section key={centre.id} className="card overflow-hidden">
                            <header className="flex items-center justify-between gap-3 border-b border-navy-100 bg-navy-50/60 px-4 py-3">
                                <div className="min-w-0">
                                    <p
                                        className={clsx(
                                            'truncate text-sm font-extrabold text-navy-900',
                                            !centre.is_active && 'opacity-50',
                                        )}
                                    >
                                        {centre.name}
                                    </p>
                                    <p className="tabular text-[11px] text-navy-400">
                                        {centre.code}
                                        {!centre.is_active && ' · معطّل'}
                                    </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <span className="tabular text-sm font-extrabold text-navy-900">
                                        {formatMoney(centre.total)}
                                    </span>
                                    {isAdmin && (
                                        <button
                                            onClick={() => setEditing(centre)}
                                            className="tap rounded-lg p-2 text-navy-400 transition hover:bg-navy-100 hover:text-navy-700"
                                            aria-label={`تعديل ${centre.name}`}
                                        >
                                            <Pencil className="size-4" />
                                        </button>
                                    )}
                                </div>
                            </header>

                            {centre.accounts.length === 0 ? (
                                <p className="px-4 py-5 text-center text-xs text-navy-400">
                                    لا توجد حركة على هذا المركز في الفترة.
                                </p>
                            ) : (
                                <div className="divide-y divide-navy-100">
                                    {centre.accounts.map((account) => (
                                        <div
                                            key={account.id}
                                            className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
                                        >
                                            <span className="truncate text-navy-600">
                                                <span className="tabular ml-1.5 text-navy-300">
                                                    {account.code}
                                                </span>
                                                {account.name}
                                            </span>
                                            <span className="tabular shrink-0 font-bold text-navy-800">
                                                {formatMoney(account.total)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            )}

            {editing !== undefined && (
                <CostCenterDialog
                    key={editing?.id ?? 'new'}
                    centre={editing}
                    onClose={() => setEditing(undefined)}
                />
            )}
        </>
    )
}

function CostCenterDialog({
    centre,
    onClose,
}: {
    centre: CostCenterReport | null
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveCostCenter(centre?.id)
    const remove = useDeleteCostCenter()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        code: centre?.code ?? '',
        name: centre?.name ?? '',
        is_active: centre?.is_active ?? true,
        notes: '',
    })

    return (
        <Modal
            open
            onClose={onClose}
            title={centre ? centre.name : 'مركز تكلفة جديد'}
            size="sm"
            footer={
                <>
                    {centre && (
                        <Button
                            variant="ghost"
                            icon={Trash2}
                            className="ml-auto text-red-600"
                            loading={remove.isPending}
                            onClick={async () => {
                                try {
                                    await remove.mutateAsync(centre.id)
                                    toast.success('تم الحذف.')
                                    onClose()
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر الحذف.'))
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
                                    // Left to the server to number when new, so
                                    // two people adding at once cannot collide.
                                    code: form.code || null,
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
                <Field label="الاسم" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="فرع المعادي"
                    />
                </Field>

                {centre && (
                    <Field label="الكود" error={errors.code}>
                        <Input
                            value={form.code}
                            onChange={(e) => setForm({ ...form, code: e.target.value })}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                )}

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        rows={2}
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                </Field>

                {centre && (
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
            </div>
        </Modal>
    )
}

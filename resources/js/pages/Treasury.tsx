import clsx from 'clsx'
import { ArrowLeftRight, Banknote, Landmark, Receipt, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import { useCashBoxes, useCashMovements, useTreasuryOperation, useTreasurySummary } from '@/lib/queries'

export function Treasury() {
    const { data: summary } = useTreasurySummary()
    const { data: boxes, isLoading } = useCashBoxes()
    const { data: movements } = useCashMovements({ per_page: 40 })
    const [dialog, setDialog] = useState<'expense' | 'transfer' | null>(null)

    return (
        <>
            <PageHeader
                title="الخزينة"
                subtitle={summary ? `النقدية المتاحة ${formatMoney(summary.cash_on_hand)}` : undefined}
            />

            <div className="mb-5 flex flex-wrap gap-2">
                <Button variant="secondary" icon={Banknote} onClick={() => setDialog('expense')}>
                    تسجيل مصروف
                </Button>
                <Button variant="secondary" icon={ArrowLeftRight} onClick={() => setDialog('transfer')}>
                    تحويل بين الخزائن
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {boxes?.map((box) => (
                        <div key={box.id} className="card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span
                                        className={clsx(
                                            'grid size-10 shrink-0 place-items-center rounded-2xl',
                                            box.type === 'bank'
                                                ? 'bg-indigo-50 text-indigo-600'
                                                : 'bg-emerald-50 text-emerald-600',
                                        )}
                                    >
                                        {box.type === 'bank' ? (
                                            <Landmark className="size-5" />
                                        ) : (
                                            <Wallet className="size-5" />
                                        )}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-navy-900">{box.name}</p>
                                        <p className="text-[11px] text-navy-400">{box.type_label}</p>
                                    </div>
                                </div>

                                <p
                                    className={clsx(
                                        'tabular shrink-0 font-extrabold',
                                        box.balance < 0 ? 'text-red-600' : 'text-navy-900',
                                    )}
                                >
                                    {formatMoney(box.balance)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <section className="mt-6">
                <h2 className="mb-3 font-bold text-navy-900">حركة الخزينة</h2>

                {!movements?.length ? (
                    <EmptyState icon={Receipt} title="لا توجد حركات بعد" />
                ) : (
                    <div className="space-y-2">
                        {movements.map((movement) => (
                            <div key={movement.id} className="card p-3.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <span
                                            className={clsx(
                                                'badge',
                                                movement.direction === 'in'
                                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                    : 'bg-red-50 text-red-700 ring-1 ring-red-200',
                                            )}
                                        >
                                            {movement.source_label}
                                        </span>

                                        <p className="mt-1 truncate text-sm font-bold text-navy-900">
                                            {movement.customer ?? movement.category ?? movement.box}
                                        </p>

                                        <p className="mt-0.5 text-[11px] text-navy-400">
                                            {movement.box}
                                            {movement.note && ` · ${movement.note}`}
                                            {movement.actor && ` · ${movement.actor}`}
                                            {movement.created_at && ` · ${formatSmart(movement.created_at)}`}
                                        </p>
                                    </div>

                                    <p
                                        className={clsx(
                                            'tabular shrink-0 font-extrabold',
                                            movement.direction === 'in' ? 'text-emerald-600' : 'text-red-600',
                                        )}
                                    >
                                        {movement.direction === 'in' ? '+' : '−'}
                                        {formatMoney(movement.amount)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {dialog && (
                <TreasuryDialog operation={dialog} onClose={() => setDialog(null)} />
            )}
        </>
    )
}

/* ── Expense / transfer ──────────────────────────────────── */

function TreasuryDialog({
    operation,
    onClose,
}: {
    operation: 'expense' | 'transfer'
    onClose: () => void
}) {
    const toast = useToast()
    const run = useTreasuryOperation(operation)
    const { data: boxes } = useCashBoxes()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        cash_box_id: '',
        from_box_id: '',
        to_box_id: '',
        amount: '',
        category: '',
        note: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const handleSave = async () => {
        setErrors({})

        const payload =
            operation === 'expense'
                ? {
                      cash_box_id: Number(form.cash_box_id || boxes?.[0]?.id),
                      amount: Number(form.amount),
                      category: form.category || null,
                      note: form.note || null,
                  }
                : {
                      from_box_id: Number(form.from_box_id),
                      to_box_id: Number(form.to_box_id),
                      amount: Number(form.amount),
                      note: form.note || null,
                  }

        try {
            await run.mutateAsync(payload)
            toast.success(operation === 'expense' ? 'تم تسجيل المصروف.' : 'تم التحويل.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={operation === 'expense' ? 'تسجيل مصروف' : 'تحويل بين الخزائن'}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={run.isPending}>
                        إلغاء
                    </Button>
                    <Button onClick={handleSave} loading={run.isPending}>
                        تنفيذ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {operation === 'expense' ? (
                    <>
                        <Field label="من خزينة" required error={errors.cash_box_id}>
                            <Select
                                value={form.cash_box_id}
                                onChange={(event) => set('cash_box_id')(event.target.value)}
                            >
                                {boxes?.map((box) => (
                                    <option key={box.id} value={box.id}>
                                        {box.name} ({formatMoney(box.balance)})
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="بند المصروف" error={errors.category}>
                            <Input
                                value={form.category}
                                onChange={(event) => set('category')(event.target.value)}
                                placeholder="وقود / أجور / مشتريات"
                            />
                        </Field>
                    </>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="من" required error={errors.from_box_id}>
                            <Select
                                value={form.from_box_id}
                                onChange={(event) => set('from_box_id')(event.target.value)}
                            >
                                <option value="">— اختر —</option>
                                {boxes?.map((box) => (
                                    <option key={box.id} value={box.id}>
                                        {box.name} ({formatMoney(box.balance)})
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="إلى" required error={errors.to_box_id}>
                            <Select
                                value={form.to_box_id}
                                onChange={(event) => set('to_box_id')(event.target.value)}
                            >
                                <option value="">— اختر —</option>
                                {boxes?.map((box) => (
                                    <option key={box.id} value={box.id}>
                                        {box.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                )}

                <Field label="المبلغ" required error={errors.amount}>
                    <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.amount}
                        onChange={(event) => set('amount')(event.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <Field label="ملاحظات" error={errors.note}>
                    <Textarea value={form.note} onChange={(event) => set('note')(event.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

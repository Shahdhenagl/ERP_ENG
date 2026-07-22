import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { useCashBoxes, useTreasuryOperation } from '@/lib/queries'

/** Paying something out, or moving it between two of our own boxes. */

export function TreasuryDialog({
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

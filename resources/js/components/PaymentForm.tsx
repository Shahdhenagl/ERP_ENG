import { Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney, PAYMENT_METHOD } from '@/lib/domain'
import { useCashBoxes, useReceivePayment } from '@/lib/queries'
import type { Invoice, PaymentMethod } from '@/types'

interface PaymentFormProps {
    open: boolean
    onClose: () => void
    invoice: Invoice
}

export function PaymentForm({ open, onClose, invoice }: PaymentFormProps) {
    const toast = useToast()
    const receive = useReceivePayment()
    const { data: boxes } = useCashBoxes()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        // Settling in full is the common case, so it is what the field opens on.
        amount: invoice.balance.toFixed(2),
        cash_box_id: '',
        method: 'cash' as PaymentMethod,
        paid_at: new Date().toISOString().slice(0, 10),
        reference: '',
        note: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const amount = Number(form.amount) || 0
    const over = amount > invoice.balance + 0.005

    const handleSave = async () => {
        setErrors({})

        try {
            await receive.mutateAsync({
                invoice_id: invoice.id,
                cash_box_id: Number(form.cash_box_id || boxes?.[0]?.id),
                amount,
                method: form.method,
                paid_at: form.paid_at,
                reference: form.reference || null,
                note: form.note || null,
            })

            toast.success('تم تسجيل التحصيل.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر تسجيل التحصيل.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`تحصيل على ${invoice.code}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={receive.isPending}>
                        إلغاء
                    </Button>
                    <Button icon={Save} onClick={handleSave} loading={receive.isPending} disabled={over}>
                        تسجيل
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="rounded-2xl bg-navy-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-navy-500">إجمالي الفاتورة</span>
                        <span className="tabular font-bold text-navy-900">{formatMoney(invoice.total)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-sm">
                        <span className="text-navy-500">المحصّل</span>
                        <span className="tabular font-bold text-navy-900">
                            {formatMoney(invoice.paid_total)}
                        </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between border-t border-navy-200 pt-1.5 text-sm">
                        <span className="font-bold text-navy-700">المتبقي</span>
                        <span className="tabular font-extrabold text-amber-600">
                            {formatMoney(invoice.balance)}
                        </span>
                    </div>
                </div>

                <Field
                    label="المبلغ"
                    required
                    error={errors.amount ?? (over ? 'المبلغ أكبر من المتبقي على الفاتورة.' : undefined)}
                >
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

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الخزينة" required error={errors.cash_box_id}>
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

                    <Field label="طريقة الدفع" required error={errors.method}>
                        <Select value={form.method} onChange={(event) => set('method')(event.target.value)}>
                            {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="تاريخ التحصيل" required error={errors.paid_at}>
                        <Input
                            type="date"
                            value={form.paid_at}
                            onChange={(event) => set('paid_at')(event.target.value)}
                        />
                    </Field>

                    <Field label="رقم الشيك / التحويل" error={errors.reference}>
                        <Input
                            value={form.reference}
                            onChange={(event) => set('reference')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <Field label="ملاحظات" error={errors.note}>
                    <Textarea value={form.note} onChange={(event) => set('note')(event.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

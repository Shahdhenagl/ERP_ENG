import { PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney, formatQty } from '@/lib/domain'
import { usePurchaseOrderAction } from '@/lib/queries'
import type { PurchaseOrder } from '@/types'

/**
 * Booking a delivery in. Each line opens on what is still outstanding, since
 * the whole order arriving at once is the common case — and the field refuses
 * to go above it, so an over-receipt is caught at the counter rather than by
 * the server rejecting the whole delivery.
 */
export function ReceiveOrderForm({
    open,
    onClose,
    order,
}: {
    open: boolean
    onClose: () => void
    order: PurchaseOrder
}) {
    const toast = useToast()
    const action = usePurchaseOrderAction()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const outstanding = (order.lines ?? []).filter((line) => (line.outstanding ?? 0) > 0)

    const [rows, setRows] = useState(
        Object.fromEntries(
            outstanding.map((line) => [
                line.item_id,
                { qty: String(line.outstanding ?? 0), unit_cost: String(line.unit_price) },
            ]),
        ),
    )
    const [reference, setReference] = useState('')
    const [note, setNote] = useState('')

    const patch = (itemId: number, key: 'qty' | 'unit_cost', value: string) =>
        setRows((current) => ({ ...current, [itemId]: { ...current[itemId], [key]: value } }))

    const anyOver = outstanding.some(
        (line) => Number(rows[line.item_id]?.qty ?? 0) > (line.outstanding ?? 0) + 0.0005,
    )

    const value = outstanding.reduce(
        (sum, line) =>
            sum + (Number(rows[line.item_id]?.qty) || 0) * (Number(rows[line.item_id]?.unit_cost) || 0),
        0,
    )

    const handleSave = async () => {
        setErrors({})

        try {
            await action.mutateAsync({
                id: order.id,
                action: 'receive',
                payload: {
                    reference: reference || null,
                    note: note || null,
                    lines: outstanding
                        .map((line) => ({
                            item_id: line.item_id,
                            qty: Number(rows[line.item_id]?.qty) || 0,
                            unit_cost: Number(rows[line.item_id]?.unit_cost) || 0,
                        }))
                        .filter((line) => line.qty > 0),
                },
            })

            toast.success('تم تسجيل الاستلام.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر تسجيل الاستلام.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`استلام على ${order.code}`}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={action.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        icon={PackageCheck}
                        onClick={handleSave}
                        loading={action.isPending}
                        disabled={anyOver}
                    >
                        تسجيل الاستلام
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <p className="rounded-xl bg-navy-50 p-3 text-xs text-navy-500">
                    اكتب الكمية التي وصلت فعلًا. الباقي يظل مفتوحًا على أمر الشراء لاستلام لاحق.
                </p>

                <div className="space-y-3">
                    {outstanding.map((line) => {
                        const entered = Number(rows[line.item_id]?.qty) || 0
                        const over = entered > (line.outstanding ?? 0) + 0.0005

                        return (
                            <div key={line.item_id} className="rounded-2xl border border-navy-100 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="min-w-0 truncate text-sm font-bold text-navy-900">
                                        {line.item}
                                    </p>
                                    <p className="tabular shrink-0 text-[11px] text-navy-400">
                                        المتبقي {formatQty(line.outstanding ?? 0)} {line.unit}
                                    </p>
                                </div>

                                <div className="mt-2 flex gap-2">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={line.outstanding}
                                        step="0.001"
                                        value={rows[line.item_id]?.qty ?? ''}
                                        onChange={(e) => patch(line.item_id, 'qty', e.target.value)}
                                        className="w-24 text-center"
                                        dir="ltr"
                                        aria-label={`الكمية المستلمة من ${line.item}`}
                                    />
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={rows[line.item_id]?.unit_cost ?? ''}
                                        onChange={(e) => patch(line.item_id, 'unit_cost', e.target.value)}
                                        className="w-28 text-center"
                                        dir="ltr"
                                        aria-label={`سعر وحدة ${line.item}`}
                                    />
                                    <span className="tabular flex-1 self-center text-left text-xs text-navy-500">
                                        {formatMoney(entered * (Number(rows[line.item_id]?.unit_cost) || 0))}
                                    </span>
                                </div>

                                {over && (
                                    <p className="mt-1.5 text-[11px] font-medium text-red-600">
                                        أكبر من المتبقي على أمر الشراء.
                                    </p>
                                )}
                            </div>
                        )
                    })}
                </div>

                {errors.lines && <p className="text-xs font-medium text-red-600">{errors.lines}</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="رقم فاتورة المورّد" error={errors.reference}>
                        <Input
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="ملاحظات" error={errors.note}>
                        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} />
                    </Field>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-4">
                    <span className="font-bold text-navy-800">قيمة الاستلام</span>
                    <span className="tabular text-lg font-extrabold text-navy-900">
                        {formatMoney(value)}
                    </span>
                </div>
            </div>
        </Modal>
    )
}

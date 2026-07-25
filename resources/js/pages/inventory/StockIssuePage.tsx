import { PackageMinus } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PageHeader, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useItems, useStockOperation, useWarehouses } from '@/lib/queries'

/**
 * A plain stock-out — consumption, damage, or a sample given away — with a
 * reason rather than a job behind it. Reduces the balance and lands on the
 * movement log as an issue.
 */
export function StockIssuePage() {
    const toast = useToast()
    const issue = useStockOperation('issue')
    const { data: items } = useItems({ per_page: 500 })
    const { data: warehouses } = useWarehouses()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({ item_id: '', warehouse_id: '', qty: '', note: '' })
    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const submit = async () => {
        setErrors({})
        try {
            await issue.mutateAsync({
                item_id: Number(form.item_id),
                warehouse_id: Number(form.warehouse_id),
                qty: Number(form.qty),
                note: form.note || null,
            })
            toast.success('تم تسجيل الصرف.')
            setForm({ ...form, qty: '', note: '' })
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر الصرف.'))
        }
    }

    return (
        <>
            <PageHeader title="إذن صرف" subtitle="صرف الأصناف من المخزن بسبب — استهلاك أو تلف أو عيّنة" />

            <div className="mx-auto max-w-lg">
                <div className="card space-y-4 p-5">
                    <Field label="الصنف" required error={errors.item_id}>
                        <Select value={form.item_id} onChange={(e) => set('item_id')(e.target.value)}>
                            <option value="">— اختر —</option>
                            {items?.data.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="المخزن" required error={errors.warehouse_id}>
                            <Select
                                value={form.warehouse_id}
                                onChange={(e) => set('warehouse_id')(e.target.value)}
                            >
                                <option value="">— اختر —</option>
                                {(warehouses ?? [])
                                    .filter((w) => w.type === 'store')
                                    .map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {w.name}
                                        </option>
                                    ))}
                            </Select>
                        </Field>
                        <Field label="الكمية" required error={errors.qty}>
                            <Input
                                type="number"
                                min={0}
                                step="any"
                                value={form.qty}
                                onChange={(e) => set('qty')(e.target.value)}
                                dir="ltr"
                                className="text-left"
                            />
                        </Field>
                    </div>

                    <Field label="السبب / ملاحظة" required error={errors.note}>
                        <Textarea
                            value={form.note}
                            onChange={(e) => set('note')(e.target.value)}
                            placeholder="تالف بالمخزن، عيّنة لعميل…"
                        />
                    </Field>

                    <Button
                        icon={PackageMinus}
                        className="w-full"
                        loading={issue.isPending}
                        disabled={!form.item_id || !form.warehouse_id || !form.qty}
                        onClick={submit}
                    >
                        تسجيل الصرف
                    </Button>
                </div>
            </div>
        </>
    )
}

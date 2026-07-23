import { HandCoins, Plus } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useAdvances, useCashBoxes, useEmployees, useSaveAdvance } from '@/lib/queries'

export function AdvancesTab() {
    const [creating, setCreating] = useState(false)
    const { data, isLoading } = useAdvances({ per_page: 60 })

    return (
        <>
            <div className="mb-4 flex justify-end">
                <Button icon={Plus} onClick={() => setCreating(true)}>
                    صرف سلفة
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={HandCoins}
                    title="لا توجد سلف"
                    description="السلفة تُصرف من الخزينة وتُسترد على أقساط من الرواتب."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((advance) => (
                        <div key={advance.id} className="card flex items-center justify-between gap-3 p-4">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-navy-900">{advance.employee}</p>
                                <p className="tabular text-[11px] text-navy-400">
                                    {advance.code} · {formatDate(advance.advance_date)}
                                    {advance.box && ` · ${advance.box}`}
                                    {advance.installment > 0 &&
                                        ` · قسط ${formatMoney(advance.installment)}`}
                                </p>
                            </div>

                            <div className="shrink-0 text-left">
                                <p className="tabular font-extrabold text-navy-900">
                                    {formatMoney(advance.amount)}
                                </p>
                                {advance.outstanding > 0 ? (
                                    <p className="tabular text-[11px] text-amber-600">
                                        متبقٍ {formatMoney(advance.outstanding)}
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-emerald-600">مسددة</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {creating && <AdvanceForm onClose={() => setCreating(false)} />}
        </>
    )
}

function AdvanceForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSaveAdvance()
    const { data: employees } = useEmployees({ active: 1, per_page: 200 })
    const { data: boxes } = useCashBoxes()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        employee_id: '',
        amount: '',
        installment: '',
        cash_box_id: '',
        notes: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title="صرف سلفة"
            description="يُخصم المبلغ من الخزينة فورًا، ويُسترد على أقساط من الرواتب."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await save.mutateAsync({
                                    employee_id: Number(form.employee_id),
                                    amount: Number(form.amount),
                                    installment: form.installment ? Number(form.installment) : null,
                                    cash_box_id: form.cash_box_id ? Number(form.cash_box_id) : null,
                                    notes: form.notes || null,
                                })
                                toast.success('تم صرف السلفة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر صرف السلفة.'))
                            }
                        }}
                    >
                        صرف
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الموظف" required error={errors.employee_id}>
                    <Select
                        value={form.employee_id}
                        onChange={(e) => set('employee_id')(e.target.value)}
                    >
                        <option value="">— اختر —</option>
                        {employees?.data.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                                {employee.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="المبلغ" required error={errors.amount}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.amount}
                            onChange={(e) => set('amount')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                    <Field label="القسط الشهري" error={errors.installment} hint="اتركه فارغًا للاسترداد كاملًا">
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.installment}
                            onChange={(e) => set('installment')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <Field label="من خزينة" error={errors.cash_box_id}>
                    <Select
                        value={form.cash_box_id}
                        onChange={(e) => set('cash_box_id')(e.target.value)}
                    >
                        <option value="">الخزينة الرئيسية</option>
                        {boxes?.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} ({formatMoney(box.balance)})
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

import { Gift, MinusCircle, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import {
    useDeletePayrollAdjustment,
    useEmployees,
    usePayrollAdjustments,
    useSavePayrollAdjustment,
} from '@/lib/queries'
import type { PayrollAdjustment } from '@/types'

const MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const now = new Date()

/**
 * Deductions and bonuses per employee per month — the one-off penalty or
 * incentive that lands on the month's payslip. Distinct from a السلف (a loan
 * recovered over months); this is booked against a single month and the run for
 * that month folds it into the net.
 */
export function AdjustmentsTab() {
    const [year, setYear] = useState(now.getFullYear())
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [creating, setCreating] = useState(false)

    const { data, isLoading } = usePayrollAdjustments({ year, month, per_page: 100 })

    return (
        <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div className="flex gap-2">
                    <Field label="الشهر">
                        <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                            {MONTHS.map((name, index) => (
                                <option key={name} value={index + 1}>
                                    {name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="السنة">
                        <Input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            dir="ltr"
                            className="w-24 text-left"
                        />
                    </Field>
                </div>

                <Button icon={Plus} onClick={() => setCreating(true)}>
                    خصم / مكافأة
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Gift}
                    title="لا توجد خصومات أو مكافآت لهذا الشهر"
                    description="أضف خصمًا أو مكافأة ليظهر في قسيمة راتب الموظف عند تشغيل مسير هذا الشهر."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((row) => (
                        <AdjustmentRow key={row.id} row={row} />
                    ))}
                </div>
            )}

            {creating && (
                <AdjustmentForm defaultYear={year} defaultMonth={month} onClose={() => setCreating(false)} />
            )}
        </>
    )
}

function AdjustmentRow({ row }: { row: PayrollAdjustment }) {
    const toast = useToast()
    const remove = useDeletePayrollAdjustment()
    const isBonus = row.type === 'bonus'

    return (
        <div className="card flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
                <div
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                        isBonus ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                    }`}
                >
                    {isBonus ? <Gift className="size-4" /> : <MinusCircle className="size-4" />}
                </div>
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy-900">{row.employee}</p>
                    <p className="truncate text-[11px] text-navy-400">
                        {row.type_label}
                        {row.reason && ` · ${row.reason}`}
                    </p>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
                <p
                    className={`tabular font-extrabold ${isBonus ? 'text-emerald-600' : 'text-red-600'}`}
                >
                    {isBonus ? '+' : '−'}
                    {formatMoney(row.amount)}
                </p>
                <button
                    type="button"
                    className="text-navy-300 transition hover:text-red-600"
                    disabled={remove.isPending}
                    onClick={async () => {
                        if (!confirm('حذف هذا البند؟')) return
                        try {
                            await remove.mutateAsync(row.id)
                            toast.success('تم الحذف.')
                        } catch (caught) {
                            toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                        }
                    }}
                    aria-label="حذف"
                >
                    <Trash2 className="size-4" />
                </button>
            </div>
        </div>
    )
}

function AdjustmentForm({
    defaultYear,
    defaultMonth,
    onClose,
}: {
    defaultYear: number
    defaultMonth: number
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSavePayrollAdjustment()
    const { data: employees } = useEmployees({ active: 1, per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        employee_id: '',
        type: 'deduction',
        amount: '',
        reason: '',
        year: String(defaultYear),
        month: String(defaultMonth),
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title="خصم / مكافأة"
            description="يظهر في قسيمة راتب الموظف عند تشغيل مسير الشهر المحدد."
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
                                    type: form.type,
                                    amount: Number(form.amount),
                                    reason: form.reason || null,
                                    year: Number(form.year),
                                    month: Number(form.month),
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
                <Field label="الموظف" required error={errors.employee_id}>
                    <Select value={form.employee_id} onChange={(e) => set('employee_id')(e.target.value)}>
                        <option value="">— اختر —</option>
                        {employees?.data.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                                {employee.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="النوع" required error={errors.type}>
                        <Select value={form.type} onChange={(e) => set('type')(e.target.value)}>
                            <option value="deduction">خصم</option>
                            <option value="bonus">مكافأة</option>
                        </Select>
                    </Field>
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
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الشهر" required error={errors.month}>
                        <Select value={form.month} onChange={(e) => set('month')(e.target.value)}>
                            {MONTHS.map((name, index) => (
                                <option key={name} value={index + 1}>
                                    {name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="السنة" required error={errors.year}>
                        <Input
                            type="number"
                            value={form.year}
                            onChange={(e) => set('year')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <Field label="السبب" error={errors.reason} hint="تأخير، تميّز، جزاء…">
                    <Input value={form.reason} onChange={(e) => set('reason')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

import { Plus, Search, Trash2, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { useDeleteEmployee, useEmployees, useSaveEmployee } from '@/lib/queries'
import type { Allowance, Employee } from '@/types'

export function EmployeesTab() {
    const toast = useToast()
    const remove = useDeleteEmployee()
    const [search, setSearch] = useState('')
    const [editing, setEditing] = useState<Employee | null | undefined>(undefined)

    const { data, isLoading } = useEmployees({ search, per_page: 60 })

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }
    useEffect(() => () => window.clearTimeout(timer.current), [])

    return (
        <>
            {data?.meta && (
                <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="card p-4">
                        <p className="text-[11px] font-bold text-navy-400">على رأس العمل</p>
                        <p className="tabular mt-1 text-lg font-extrabold text-navy-900">
                            {data.meta.active}
                        </p>
                    </div>
                    <div className="card p-4">
                        <p className="text-[11px] font-bold text-navy-400">إجمالي الرواتب الشهرية</p>
                        <p className="tabular mt-1 text-lg font-extrabold text-brand-700">
                            {formatMoney(data.meta.monthly_payroll)}
                        </p>
                    </div>
                </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-48 flex-1">
                    <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        placeholder="ابحث بالاسم أو الرقم القومي أو الوظيفة"
                        className="pr-10"
                        onChange={(e) => debounced(e.target.value)}
                    />
                </div>
                <Button icon={Plus} onClick={() => setEditing(null)}>
                    موظف جديد
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState icon={UserRound} title="لا يوجد موظفون" />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {data.data.map((employee) => (
                        <div key={employee.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <button
                                    onClick={() => setEditing(employee)}
                                    className="min-w-0 flex-1 text-right"
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {employee.code}
                                        </span>
                                        {employee.status !== 'active' && (
                                            <span className="badge bg-slate-100 text-slate-600">
                                                {employee.status_label}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 font-bold text-navy-900">{employee.name}</p>
                                    <p className="text-[11px] text-navy-400">
                                        {employee.job_title}
                                        {employee.department && ` · ${employee.department}`}
                                    </p>
                                </button>

                                <div className="shrink-0 text-left">
                                    <p className="tabular font-extrabold text-navy-900">
                                        {formatMoney(employee.gross_salary)}
                                    </p>
                                    <p className="text-[10px] text-navy-400">إجمالي الراتب</p>
                                    {employee.outstanding_advances > 0 && (
                                        <p className="tabular mt-0.5 text-[10px] text-amber-600">
                                            سلف {formatMoney(employee.outstanding_advances)}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between border-t border-navy-100 pt-2 text-[11px] text-navy-500">
                                <span>رصيد الإجازات: {employee.annual_leave_remaining} يوم</span>
                                <button
                                    onClick={async () => {
                                        if (!window.confirm(`حذف/إنهاء خدمة «${employee.name}»؟`)) return
                                        try {
                                            await remove.mutateAsync(employee.id)
                                            toast.success('تم.')
                                        } catch (caught) {
                                            toast.error(errorMessage(caught))
                                        }
                                    }}
                                    className="tap grid size-7 place-items-center rounded-lg text-navy-400 hover:bg-red-50 hover:text-red-600"
                                    aria-label="حذف"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing !== undefined && (
                <EmployeeForm employee={editing} onClose={() => setEditing(undefined)} />
            )}
        </>
    )
}

/* ── The form ────────────────────────────────────────────── */

function EmployeeForm({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const toast = useToast()
    const save = useSaveEmployee(employee?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: employee?.name ?? '',
        national_id: employee?.national_id ?? '',
        phone: employee?.phone ?? '',
        job_title: employee?.job_title ?? '',
        department: employee?.department ?? '',
        hired_on: employee?.hired_on ?? new Date().toISOString().slice(0, 10),
        employment_type: employee?.employment_type ?? 'full_time',
        basic_salary: String(employee?.basic_salary ?? ''),
        insurance_rate: String(employee?.insurance_rate ?? '0'),
        tax_rate: String(employee?.tax_rate ?? '0'),
        annual_leave_days: String(employee?.annual_leave_days ?? '21'),
        bank_name: employee?.bank_name ?? '',
        bank_account: employee?.bank_account ?? '',
        status: employee?.status ?? 'active',
        notes: employee?.notes ?? '',
    })
    const [allowances, setAllowances] = useState<Allowance[]>(employee?.allowances ?? [])

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title={employee ? `تعديل ${employee.name}` : 'موظف جديد'}
            size="lg"
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
                                    ...form,
                                    basic_salary: Number(form.basic_salary),
                                    insurance_rate: Number(form.insurance_rate),
                                    tax_rate: Number(form.tax_rate),
                                    annual_leave_days: Number(form.annual_leave_days),
                                    allowances: allowances.filter((a) => a.name && a.amount > 0),
                                })
                                toast.success('تم حفظ بيانات الموظف.')
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
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الاسم" required error={errors.name}>
                        <Input value={form.name} onChange={(e) => set('name')(e.target.value)} />
                    </Field>
                    <Field label="الرقم القومي" error={errors.national_id}>
                        <Input
                            value={form.national_id}
                            onChange={(e) => set('national_id')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                    <Field label="الوظيفة" error={errors.job_title}>
                        <Input
                            value={form.job_title}
                            onChange={(e) => set('job_title')(e.target.value)}
                        />
                    </Field>
                    <Field label="القسم" error={errors.department}>
                        <Input
                            value={form.department}
                            onChange={(e) => set('department')(e.target.value)}
                        />
                    </Field>
                    <Field label="الهاتف" error={errors.phone}>
                        <Input
                            value={form.phone}
                            onChange={(e) => set('phone')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                    <Field label="تاريخ التعيين" error={errors.hired_on}>
                        <Input
                            type="date"
                            value={form.hired_on}
                            onChange={(e) => set('hired_on')(e.target.value)}
                        />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="الراتب الأساسي" required error={errors.basic_salary}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.basic_salary}
                            onChange={(e) => set('basic_salary')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                    <Field label="نسبة التأمينات %" error={errors.insurance_rate}>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={form.insurance_rate}
                            onChange={(e) => set('insurance_rate')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                    <Field label="نسبة الضريبة %" error={errors.tax_rate}>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={form.tax_rate}
                            onChange={(e) => set('tax_rate')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                {/* Allowances build the rest of the gross, and each is named so a
                    payslip reads the way the contract does. */}
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-bold text-navy-800">البدلات</p>
                        <button
                            onClick={() => setAllowances((a) => [...a, { name: '', amount: 0 }])}
                            className="tap rounded-lg bg-navy-100 px-3 py-1.5 text-xs font-bold text-navy-700"
                        >
                            إضافة بدل
                        </button>
                    </div>
                    <div className="space-y-2">
                        {allowances.map((allowance, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    value={allowance.name}
                                    placeholder="بدل انتقال"
                                    onChange={(e) =>
                                        setAllowances((current) =>
                                            current.map((a, i) =>
                                                i === index ? { ...a, name: e.target.value } : a,
                                            ),
                                        )
                                    }
                                    className="flex-1"
                                />
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={allowance.amount || ''}
                                    onChange={(e) =>
                                        setAllowances((current) =>
                                            current.map((a, i) =>
                                                i === index
                                                    ? { ...a, amount: Number(e.target.value) }
                                                    : a,
                                            ),
                                        )
                                    }
                                    dir="ltr"
                                    className="w-32 text-left"
                                />
                                <button
                                    onClick={() =>
                                        setAllowances((current) => current.filter((_, i) => i !== index))
                                    }
                                    className="tap grid size-9 place-items-center rounded-xl bg-red-50 text-red-600"
                                    aria-label="حذف"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="رصيد الإجازات السنوي" error={errors.annual_leave_days}>
                        <Input
                            type="number"
                            min={0}
                            value={form.annual_leave_days}
                            onChange={(e) => set('annual_leave_days')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                    <Field label="نوع التعاقد" error={errors.employment_type}>
                        <Select
                            value={form.employment_type}
                            onChange={(e) => set('employment_type')(e.target.value)}
                        >
                            <option value="full_time">دوام كامل</option>
                            <option value="part_time">دوام جزئي</option>
                            <option value="contract">عقد مؤقت</option>
                        </Select>
                    </Field>
                    {employee && (
                        <Field label="الحالة" error={errors.status}>
                            <Select value={form.status} onChange={(e) => set('status')(e.target.value)}>
                                <option value="active">على رأس العمل</option>
                                <option value="suspended">موقوف</option>
                                <option value="terminated">انتهت خدمته</option>
                            </Select>
                        </Field>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="البنك" error={errors.bank_name}>
                        <Input value={form.bank_name} onChange={(e) => set('bank_name')(e.target.value)} />
                    </Field>
                    <Field label="رقم الحساب" error={errors.bank_account}>
                        <Input
                            value={form.bank_account}
                            onChange={(e) => set('bank_account')(e.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                </div>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

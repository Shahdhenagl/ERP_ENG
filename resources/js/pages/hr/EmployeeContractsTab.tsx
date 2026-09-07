import clsx from 'clsx'
import { FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import {
    useDeleteEmployeeContract,
    useEmployeeContracts,
    useEmployees,
    useSaveEmployeeContract,
} from '@/lib/queries'
import type { EmployeeContract } from '@/types'

const STATUS_CHIP: Record<EmployeeContract['status'], string> = {
    active: 'bg-emerald-50 text-emerald-700',
    expired: 'bg-amber-50 text-amber-700',
    terminated: 'bg-red-50 text-red-700',
}

export function EmployeeContractsTab() {
    const toast = useToast()
    const [search, setSearch] = useState('')
    const [editing, setEditing] = useState<EmployeeContract | null | undefined>(undefined)
    const remove = useDeleteEmployeeContract()
    const timer = useRef<number>(0)
    const { data, isLoading } = useEmployeeContracts({ search, per_page: 80 })

    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-56 flex-1">
                    <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        className="pr-10"
                        placeholder="ابحث برقم العقد أو الاسم أو عنوان العقد"
                        onChange={(event) => debounced(event.target.value)}
                    />
                </div>
                <Button icon={Plus} onClick={() => setEditing(null)}>
                    عقد موظف جديد
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState icon={FileText} title="لا توجد عقود موظفين" />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {data.data.map((contract) => (
                        <div key={contract.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="tabular text-[11px] font-bold text-brand-600">{contract.code}</p>
                                    <h3 className="mt-1 truncate font-bold text-navy-900">{contract.title}</h3>
                                    <p className="mt-0.5 text-xs text-navy-500">
                                        {contract.employee ?? '—'} · {contract.type_label ?? contract.type}
                                    </p>
                                </div>
                                <span className={clsx('badge shrink-0', STATUS_CHIP[contract.status])}>
                                    {contract.status_label ?? contract.status}
                                </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-navy-50 p-3 text-xs">
                                <div>
                                    <p className="text-[10px] text-navy-400">بداية العقد</p>
                                    <p className="tabular mt-0.5 font-semibold text-navy-700">
                                        {contract.starts_on ? formatDate(contract.starts_on) : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-navy-400">نهاية العقد</p>
                                    <p className="tabular mt-0.5 font-semibold text-navy-700">
                                        {contract.ends_on ? formatDate(contract.ends_on) : 'غير محدد'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-navy-400">الأجر الشهري</p>
                                    <p className="tabular mt-0.5 font-extrabold text-navy-900">{formatMoney(contract.agreed_salary)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-navy-400">الملفات</p>
                                    <p className="mt-0.5 font-semibold text-navy-700">{contract.attachments_count ?? 0} ملف</p>
                                </div>
                            </div>

                            <div className="mt-3 flex justify-end gap-2 border-t border-navy-100 pt-3">
                                <Button variant="secondary" icon={Pencil} onClick={() => setEditing(contract)}>
                                    تعديل
                                </Button>
                                <button
                                    type="button"
                                    className="tap grid size-9 place-items-center rounded-lg bg-red-50 text-red-600"
                                    aria-label="حذف العقد"
                                    onClick={async () => {
                                        if (!window.confirm(`حذف العقد «${contract.title}»؟`)) return
                                        try {
                                            await remove.mutateAsync(contract.id)
                                            toast.success('تم حذف العقد.')
                                        } catch (caught) {
                                            toast.error(errorMessage(caught))
                                        }
                                    }}
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing !== undefined && (
                <EmployeeContractForm contract={editing} onClose={() => setEditing(undefined)} />
            )}
        </>
    )
}

function EmployeeContractForm({ contract, onClose }: { contract: EmployeeContract | null; onClose: () => void }) {
    const toast = useToast()
    const isEdit = Boolean(contract)
    const save = useSaveEmployeeContract(undefined, contract?.id)
    const { data: employees } = useEmployees({ active: 1, per_page: 200 })
    const [form, setForm] = useState({
        employee_id: contract?.employee_id ? String(contract.employee_id) : '',
        title: contract?.title ?? 'عقد عمل',
        type: contract?.type ?? 'fixed_term',
        starts_on: contract?.starts_on ?? new Date().toISOString().slice(0, 10),
        ends_on: contract?.ends_on ?? '',
        agreed_salary: contract?.agreed_salary ? String(contract.agreed_salary) : '0',
        salary_basis_days: contract?.salary_basis_days ? String(contract.salary_basis_days) : '30',
        status: contract?.status ?? 'active',
        notes: contract?.notes ?? '',
    })

    const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title={isEdit ? 'تعديل عقد الموظف' : 'إنشاء عقد موظف جديد'}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>إلغاء</Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            try {
                                await save.mutateAsync({
                                    employee_id: Number(form.employee_id),
                                    title: form.title,
                                    type: form.type,
                                    starts_on: form.starts_on,
                                    ends_on: form.ends_on || null,
                                    agreed_salary: Number(form.agreed_salary || 0),
                                    salary_basis_days: Number(form.salary_basis_days || 30),
                                    status: form.status,
                                    notes: form.notes || null,
                                })
                                toast.success(isEdit ? 'تم تعديل العقد.' : 'تم إنشاء العقد.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر حفظ العقد.'))
                            }
                        }}
                    >
                        {isEdit ? 'حفظ التعديل' : 'إنشاء العقد'}
                    </Button>
                </>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="الموظف" required>
                    <Select value={form.employee_id} onChange={(event) => set('employee_id', event.target.value)}>
                        <option value="">اختر الموظف</option>
                        {employees?.data.map((employee) => (
                            <option key={employee.id} value={employee.id}>{employee.name} — {employee.code}</option>
                        ))}
                    </Select>
                </Field>
                <Field label="عنوان العقد" required>
                    <Input value={form.title} onChange={(event) => set('title', event.target.value)} />
                </Field>
                <Field label="نوع العقد" required>
                    <Select value={form.type} onChange={(event) => set('type', event.target.value)}>
                        <option value="permanent">دائم</option>
                        <option value="fixed_term">محدد المدة</option>
                        <option value="temporary">مؤقت</option>
                        <option value="probation">فترة اختبار</option>
                    </Select>
                </Field>
                <Field label="الحالة" required>
                    <Select value={form.status} onChange={(event) => set('status', event.target.value)}>
                        <option value="draft">مسودة</option>
                        <option value="active">ساري</option>
                        <option value="expired">منتهي</option>
                        <option value="terminated">منهى</option>
                    </Select>
                </Field>
                <Field label="تاريخ البداية" required>
                    <Input type="date" value={form.starts_on} onChange={(event) => set('starts_on', event.target.value)} />
                </Field>
                <Field label="تاريخ النهاية">
                    <Input type="date" value={form.ends_on} onChange={(event) => set('ends_on', event.target.value)} />
                </Field>
                <Field label="الأجر الشهري">
                    <Input type="number" min="0" step="0.01" value={form.agreed_salary} onChange={(event) => set('agreed_salary', event.target.value)} />
                </Field>
                <Field label="أيام الراتب" required>
                    <Input type="number" min="1" max="31" value={form.salary_basis_days} onChange={(event) => set('salary_basis_days', event.target.value)} />
                </Field>
                <Field label="ملاحظات">
                    <Textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} />
                </Field>
            </div>
            <p className="mt-4 rounded-xl bg-brand-50 p-3 text-xs font-semibold text-brand-800">
                بعد إنشاء العقد، افتحي بروفايل الموظف لرفع نسخة العقد أو أي مستندات مرتبطة به.
            </p>
        </Modal>
    )
}

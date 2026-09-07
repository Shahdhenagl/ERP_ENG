import { Eye, HandCoins, Pencil, Plus, Undo2 } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useAdvances, useCashBoxes, useEmployees, useReverseAdvance, useSaveAdvance, useUpdateAdvance } from '@/lib/queries'
import type { SalaryAdvance } from '@/types'

export function AdvancesTab() {
    const toast = useToast()
    const [creating, setCreating] = useState(false)
    const [viewing, setViewing] = useState<SalaryAdvance | null>(null)
    const [editing, setEditing] = useState<SalaryAdvance | null>(null)
    const reverse = useReverseAdvance()
    const [view, setView] = useViewMode('hr-advances')
    const { data, isLoading } = useAdvances({ per_page: 60 })

    return (
        <>
            <div className="mb-4 flex justify-end">
                <Button icon={Plus} onClick={() => setCreating(true)}>
                    {tr('صرف سلفة')}
                </Button>
            </div>

            <div className="mb-3 flex justify-end">
                <ViewToggle view={view} onChange={setView} />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={HandCoins}
                    title="لا توجد سلف"
                    description="السلفة تُصرف من الخزينة وتُسترد على أقساط من الرواتب."
                />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="48rem"
                    headers={[
                        { label: 'الكود', className: 'w-28' },
                        'الموظف',
                        { label: 'التاريخ', className: 'w-32' },
                        { label: 'الخزينة', className: 'w-32' },
                        { label: 'القسط الشهري', className: 'w-28 text-end' },
                        { label: 'المبلغ', className: 'w-28 text-end' },
                        { label: 'المتبقي', className: 'w-28 text-end' },
                        { label: 'الإجراءات', className: 'w-28 text-center' },
                    ]}
                >
                    {data.data.map((advance) => (
                        <tr key={advance.id} className="border-t border-navy-100 hover:bg-navy-50/60">
                            <td className="tabular px-3 py-2.5 font-bold text-brand-600">
                                {advance.code}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-navy-800">
                                {advance.employee}
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600">
                                {formatDate(advance.advance_date)}
                            </td>
                            <td className="px-3 py-2.5 text-navy-600">{advance.box ?? '—'}</td>
                            <td className="tabular px-3 py-2.5 text-end text-navy-600">
                                {advance.installment > 0 ? formatMoney(advance.installment) : '—'}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end font-bold text-navy-900">
                                {formatMoney(advance.amount)}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end">
                                {advance.is_reversed ? (
                                    <span className="font-bold text-red-600">متراجع عنها</span>
                                ) : advance.outstanding > 0 ? (
                                    <span className="font-bold text-amber-600">
                                        {formatMoney(advance.outstanding)}
                                    </span>
                                ) : (
                                    <span className="text-emerald-600">مسددة</span>
                                )}
                            </td>
                            <td className="px-3 py-2.5">
                                <div className="flex items-center justify-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setViewing(advance)}
                                        className="tap grid size-8 place-items-center rounded-lg text-navy-500 transition hover:bg-navy-100 hover:text-navy-800"
                                        aria-label={`عرض السلفة ${advance.code}`}
                                        title="عرض التفاصيل"
                                    >
                                        <Eye className="size-4" />
                                    </button>
                                    {!advance.is_reversed && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setEditing(advance)}
                                                className="tap grid size-8 place-items-center rounded-lg text-brand-600 transition hover:bg-brand-50"
                                                aria-label={`تعديل السلفة ${advance.code}`}
                                                title="تعديل القسط والملاحظات"
                                            >
                                                <Pencil className="size-4" />
                                            </button>
                                        </>
                                    )}
                                    {!advance.is_reversed && (
                                        <button
                                            type="button"
                                            onClick={() => reverseAdvance(advance)}
                                            className="tap grid size-8 place-items-center rounded-lg text-red-600 transition hover:bg-red-50"
                                            aria-label={`التراجع عن السلفة ${advance.code}`}
                                            title="التراجع عن السلفة وإرجاع المبلغ للخزينة"
                                        >
                                            <Undo2 className="size-4" />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </DataTable>
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
                                {advance.is_reversed ? (
                                    <p className="text-[11px] font-bold text-red-600">متراجع عنها</p>
                                ) : advance.outstanding > 0 ? (
                                    <p className="tabular text-[11px] text-amber-600">
                                        متبقٍ {formatMoney(advance.outstanding)}
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-emerald-600">مسددة</p>
                                )}
                                <div className="mt-2 flex items-center justify-end gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setViewing(advance)}
                                        className="tap grid size-8 place-items-center rounded-lg bg-navy-50 text-navy-500"
                                        aria-label={`عرض السلفة ${advance.code}`}
                                    >
                                        <Eye className="size-4" />
                                    </button>
                                    {!advance.is_reversed && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setEditing(advance)}
                                                className="tap grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-600"
                                                aria-label={`تعديل السلفة ${advance.code}`}
                                            >
                                                <Pencil className="size-4" />
                                            </button>
                                        </>
                                    )}
                                    {!advance.is_reversed && (
                                        <button
                                            type="button"
                                            onClick={() => reverseAdvance(advance)}
                                            className="tap grid size-8 place-items-center rounded-lg bg-red-50 text-red-600"
                                            aria-label={`التراجع عن السلفة ${advance.code}`}
                                        >
                                            <Undo2 className="size-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {creating && <AdvanceForm onClose={() => setCreating(false)} />}
            {viewing && <AdvanceDetails advance={viewing} onClose={() => setViewing(null)} />}
            {editing && <EditAdvanceForm advance={editing} onClose={() => setEditing(null)} />}
        </>
    )

    async function reverseAdvance(advance: SalaryAdvance) {
        if (!window.confirm(`التراجع عن السلفة ${advance.code} وإرجاع مبلغ ${formatMoney(advance.amount)} للخزينة؟`)) return
        try {
            await reverse.mutateAsync(advance.id)
            toast.success('تم التراجع عن السلفة وإرجاع المبلغ للخزينة.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر التراجع عن السلفة.'))
        }
    }
}

function AdvanceDetails({ advance, onClose }: { advance: SalaryAdvance; onClose: () => void }) {
    const rows = [
        ['الكود', advance.code],
        ['الموظف', advance.employee ?? '—'],
        ['تاريخ الصرف', formatDate(advance.advance_date)],
        ['الخزينة', advance.box ?? '—'],
        ['قيمة السلفة', formatMoney(advance.amount)],
        ['القسط الشهري', formatMoney(advance.installment)],
        ['المتبقي', advance.outstanding > 0 ? formatMoney(advance.outstanding) : 'مسددة'],
        ['أنشأها', advance.created_by ?? '—'],
    ]

    return (
        <Modal open onClose={onClose} title={`تفاصيل السلفة ${advance.code}`} size="sm">
            <dl className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-100">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 px-3 py-2.5">
                        <dt className="text-xs font-semibold text-navy-400">{label}</dt>
                        <dd className="text-end text-sm font-bold text-navy-800">{value}</dd>
                    </div>
                ))}
            </dl>
            {advance.is_reversed && (
                <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
                    تم التراجع عن هذه السلفة وإرجاع مبلغها للخزينة.
                </p>
            )}
            {advance.notes && (
                <div className="mt-4 rounded-xl bg-navy-50 p-3">
                    <p className="mb-1 text-xs font-bold text-navy-500">ملاحظات</p>
                    <p className="whitespace-pre-wrap text-sm text-navy-700">{advance.notes}</p>
                </div>
            )}
        </Modal>
    )
}

function EditAdvanceForm({ advance, onClose }: { advance: SalaryAdvance; onClose: () => void }) {
    const toast = useToast()
    const update = useUpdateAdvance()
    const [installment, setInstallment] = useState(String(advance.installment))
    const [notes, setNotes] = useState(advance.notes ?? '')
    const [errors, setErrors] = useState<Record<string, string>>({})

    return (
        <Modal
            open
            onClose={onClose}
            title={`تعديل السلفة ${advance.code}`}
            description="يمكن تعديل خطة الاسترداد والملاحظات فقط؛ مبلغ الصرف والخزينة مثبتان ماليًا."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={update.isPending}>إلغاء</Button>
                    <Button
                        loading={update.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await update.mutateAsync({
                                    id: advance.id,
                                    installment: Number(installment),
                                    notes: notes.trim() || null,
                                })
                                toast.success('تم تعديل السلفة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تعديل السلفة.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-600">
                    {advance.employee} · إجمالي {formatMoney(advance.amount)}
                </div>
                <Field label="القسط الشهري" required error={errors.installment}>
                    <Input
                        type="number"
                        min="0.01"
                        max={advance.amount}
                        step="0.01"
                        value={installment}
                        onChange={(event) => setInstallment(event.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>
                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

function AdvanceForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSaveAdvance()
    const { data: employees } = useEmployees({ active: 1, per_page: 200 })
    const { data: boxes } = useCashBoxes()
    const activeBoxes = boxes?.filter((box) => box.is_active) ?? []
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        employee_id: '',
        advance_date: new Date().toISOString().slice(0, 10),
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
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={save.isPending}
                        disabled={!activeBoxes.length}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await save.mutateAsync({
                                    employee_id: Number(form.employee_id),
                                    advance_date: form.advance_date,
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
                        {tr('صرف')}
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

                <Field label="تاريخ السلفة" required error={errors.advance_date}>
                    <Input
                        type="date"
                        value={form.advance_date}
                        onChange={(e) => set('advance_date')(e.target.value)}
                    />
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

                <Field label="من خزينة" required error={errors.cash_box_id}>
                    <Select
                        value={form.cash_box_id}
                        onChange={(e) => set('cash_box_id')(e.target.value)}
                        disabled={!activeBoxes.length}
                    >
                        <option value="">{activeBoxes.length ? '— اختر خزينة —' : 'لا توجد خزائن نشطة'}</option>
                        {activeBoxes.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} ({formatMoney(box.balance)})
                            </option>
                        ))}
                    </Select>
                </Field>

                {!activeBoxes.length && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        أنشئ خزينة أولًا من قسم الخزينة قبل صرف السلفة.
                    </p>
                )}

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

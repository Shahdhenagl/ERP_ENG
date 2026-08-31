import clsx from 'clsx'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { tr } from '@/lib/i18n'
import { ArrowRight, BadgeCheck, Coins, Pencil, Plus, Printer, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/domain'
import { useArea } from '@/lib/nav'
import {
    useCashBoxes,
    useOpenPayroll,
    usePayrollAction,
    usePayrollRun,
    usePayrollRuns,
    usePayslipAction,
} from '@/lib/queries'
import type { PayrollStatus, Payslip } from '@/types'

const STATUS: Record<PayrollStatus, string> = {
    draft: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    paid: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

export function PayrollTab() {
    const [opening, setOpening] = useState(false)
    const [openId, setOpenId] = useState<number | null>(null)
    const [view, setView] = useViewMode('hr-payroll')
    const { data, isLoading } = usePayrollRuns({ per_page: 24 })

    if (openId !== null) {
        return <RunDetail id={openId} onBack={() => setOpenId(null)} />
    }

    return (
        <>
            <div className="mb-4 flex justify-end">
                <Button icon={Plus} onClick={() => setOpening(true)}>
                    {tr('فتح كشف شهر')}
                </Button>
            </div>

            <div className="mb-3 flex justify-end">
                <ViewToggle view={view} onChange={setView} />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Coins}
                    title="لا توجد كشوف رواتب"
                    description="افتح كشف شهر ليُنشئ قسائم الرواتب لكل موظف على رأس العمل."
                />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="52rem"
                    headers={[
                        { label: 'الكود', className: 'w-28' },
                        'الشهر',
                        { label: 'عدد القسائم', className: 'w-28' },
                        { label: 'إجمالي الراتب', className: 'w-32 text-end' },
                        { label: 'الاستقطاعات', className: 'w-28 text-end' },
                        { label: 'الصافي', className: 'w-32 text-end' },
                        { label: 'الحالة', className: 'w-28' },
                    ]}
                >
                    {data.data.map((run) => (
                        <tr
                            key={run.id}
                            onClick={() => setOpenId(run.id)}
                            className="cursor-pointer border-t border-navy-100 hover:bg-navy-50/60"
                        >
                            <td className="tabular px-3 py-2.5 font-bold text-brand-600">
                                {run.code}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-navy-800">
                                {run.month_label}
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600">
                                {run.payslips_count ?? 0}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end text-navy-600">
                                {run.gross_total != null ? formatMoney(run.gross_total) : '—'}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end text-navy-600">
                                {run.deductions_total != null
                                    ? formatMoney(run.deductions_total)
                                    : '—'}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end font-bold text-navy-900">
                                {formatMoney(run.net_total)}
                            </td>
                            <td className="px-3 py-2.5">
                                <span className={clsx('badge', STATUS[run.status])}>
                                    {run.status_label}
                                </span>
                            </td>
                        </tr>
                    ))}
                </DataTable>
            ) : (
                <div className="space-y-2">
                    {data.data.map((run) => (
                        <button
                            key={run.id}
                            onClick={() => setOpenId(run.id)}
                            className="card flex w-full items-center justify-between gap-3 p-4 text-start transition hover:bg-navy-50"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-navy-900">{run.month_label}</span>
                                    <span className={clsx('badge', STATUS[run.status])}>
                                        {run.status_label}
                                    </span>
                                </div>
                                <p className="tabular text-[11px] text-navy-400">
                                    {run.code} · {run.payslips_count ?? 0} قسيمة
                                    {run.approved_at && ` · اعتُمد ${run.approved_at}`}
                                </p>
                            </div>
                            <div className="shrink-0 text-left">
                                <p className="tabular font-extrabold text-navy-900">
                                    {formatMoney(run.net_total)}
                                </p>
                                {run.unpaid_net > 0 && run.status !== 'draft' && (
                                    <p className="tabular text-[11px] text-amber-600">
                                        غير مصروف {formatMoney(run.unpaid_net)}
                                    </p>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {opening && <OpenForm onClose={() => setOpening(false)} onOpened={setOpenId} />}
        </>
    )
}

function OpenForm({
    onClose,
    onOpened,
}: {
    onClose: () => void
    onOpened: (id: number) => void
}) {
    const toast = useToast()
    const open = useOpenPayroll()
    const now = new Date()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({
        year: String(now.getFullYear()),
        month: String(now.getMonth() + 1),
    })

    return (
        <Modal
            open
            onClose={onClose}
            title="فتح كشف رواتب"
            description="يُنشئ قسيمة لكل موظف على رأس العمل بمرتّبه وبدلاته وخصوماته."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={open.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={open.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                const run = await open.mutateAsync({
                                    year: Number(form.year),
                                    month: Number(form.month),
                                })
                                toast.success('تم فتح كشف الرواتب.')
                                onClose()
                                onOpened(run.id)
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر فتح كشف الرواتب.'))
                            }
                        }}
                    >
                        {tr('فتح')}
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="السنة" required error={errors.year}>
                    <Input
                        type="number"
                        value={form.year}
                        onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>
                <Field label="الشهر" required error={errors.month}>
                    <Select
                        value={form.month}
                        onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
                    >
                        {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                                {MONTHS[i]}
                            </option>
                        ))}
                    </Select>
                </Field>
            </div>
        </Modal>
    )
}

const MONTHS = [
    tr('يناير'),
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
]

function RunDetail({ id, onBack }: { id: number; onBack: () => void }) {
    const toast = useToast()
    const { can } = useAuth()
    const { data: run, isLoading } = usePayrollRun(id)
    const act = usePayrollAction(id)
    const [payOpen, setPayOpen] = useState<'run' | Payslip | null>(null)
    const [editingSlip, setEditingSlip] = useState<Payslip | null>(null)

    const runAction = async (action: 'approve') => {
        if (action === 'approve' && !window.confirm('اعتماد كشف الرواتب يُثبّت الخصومات ويسجّله في الدفاتر. متابعة؟'))
            return
        try {
            await act.mutateAsync({ action })
            toast.success('تم اعتماد كشف الرواتب.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر اعتماد كشف الرواتب.'))
        }
    }

    return (
        <>
            <button
                onClick={onBack}
                className="tap mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy-500"
            >
                <ArrowRight className="size-4" />
                {tr('كل كشوف الرواتب')}
            </button>

            {isLoading || !run ? (
                <SkeletonCard />
            ) : (
                <>
                    <div className="card mb-4 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-extrabold text-navy-900">
                                        {run.month_label}
                                    </h2>
                                    <span className={clsx('badge', STATUS[run.status])}>
                                        {run.status_label}
                                    </span>
                                </div>
                                <p className="tabular text-[11px] text-navy-400">{run.code}</p>
                            </div>

                            <div className="flex gap-2">
                                {run.status === 'draft' && can('payroll.approve') && (
                                    <Button
                                        icon={BadgeCheck}
                                        loading={act.isPending}
                                        onClick={() => runAction('approve')}
                                    >
                                        {tr('اعتماد')}
                                    </Button>
                                )}
                                {run.status !== 'draft' && run.unpaid_net > 0 && (
                                    <Button icon={Wallet} onClick={() => setPayOpen('run')}>
                                        {tr('صرف الكل')}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                            <Metric label="الإجمالي" value={run.gross_total ?? 0} />
                            <Metric label="الخصومات" value={run.deductions_total ?? 0} tone="red" />
                            <Metric label="الصافي" value={run.net_total} tone="green" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        {run.payslips?.map((slip) => (
                            <SlipRow
                                key={slip.id}
                                slip={slip}
                                canPay={run.status !== 'draft'}
                                canEdit={run.status === 'draft'}
                                onPay={() => setPayOpen(slip)}
                                onEdit={() => setEditingSlip(slip)}
                            />
                        ))}
                    </div>
                </>
            )}

            {payOpen && (
                <PayModal
                    target={payOpen}
                    runId={id}
                    onClose={() => setPayOpen(null)}
                />
            )}
            {editingSlip && (
                <SalaryCalculationModal slip={editingSlip} onClose={() => setEditingSlip(null)} />
            )}
        </>
    )
}

function Metric({
    label,
    value,
    tone,
}: {
    label: string
    value: number
    tone?: 'red' | 'green'
}) {
    return (
        <div className="rounded-xl bg-navy-50 p-3">
            <p className="text-[11px] font-semibold text-navy-400">{label}</p>
            <p
                className={clsx(
                    'tabular mt-0.5 font-extrabold',
                    tone === 'red' && 'text-red-600',
                    tone === 'green' && 'text-emerald-600',
                    !tone && 'text-navy-900',
                )}
            >
                {formatMoney(value)}
            </p>
        </div>
    )
}

function SlipRow({
    slip,
    canPay,
    canEdit,
    onPay,
    onEdit,
}: {
    slip: Payslip
    canPay: boolean
    canEdit: boolean
    onPay: () => void
    onEdit: () => void
}) {
    const { path } = useArea()
    return (
        <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-navy-900">{slip.employee}</p>
                    <p className="tabular text-[11px] text-navy-400">
                        أساسي {formatMoney(slip.basic_salary)}
                        {slip.allowances_total > 0 && ` · بدلات ${formatMoney(slip.allowances_total)}`}
                        {` · أيام ${slip.worked_days}/${slip.salary_basis_days}`}
                        {slip.total_deductions > 0 && ` · خصم ${formatMoney(slip.total_deductions)}`}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-left">
                        <p className="tabular font-extrabold text-navy-900">{formatMoney(slip.net)}</p>
                        {slip.is_paid ? (
                            <p className="text-[11px] text-emerald-600">صُرف {slip.paid_on}</p>
                        ) : (
                            <p className="text-[11px] text-amber-600">غير مصروف</p>
                        )}
                    </div>

                    <div className="flex gap-1">
                        {canEdit && (
                            <button
                                onClick={onEdit}
                                className="tap grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-600"
                                title="تجهيز وحساب الراتب"
                                aria-label={`تجهيز راتب ${slip.employee}`}
                            >
                                <Pencil className="size-4" />
                            </button>
                        )}
                        <Link
                            to={path(`/print/payslips/${slip.id}`)}
                            target="_blank"
                            className="tap grid size-9 place-items-center rounded-lg bg-navy-100 text-navy-500"
                            title="طباعة"
                        >
                            <Printer className="size-4" />
                        </Link>
                        {canPay && !slip.is_paid && (
                            <button
                                onClick={onPay}
                                className="tap grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"
                                title="صرف"
                            >
                                <Wallet className="size-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function SalaryCalculationModal({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
    const toast = useToast()
    const action = usePayslipAction()
    const [workedDays, setWorkedDays] = useState(String(slip.worked_days))
    const [advanceRecovery, setAdvanceRecovery] = useState(String(slip.advance_recovery))
    const [otherDeductions, setOtherDeductions] = useState(String(slip.other_deductions))
    const [note, setNote] = useState(slip.other_note ?? '')
    const [errors, setErrors] = useState<Record<string, string>>({})

    const days = Math.max(0, Math.min(slip.salary_basis_days, Number(workedDays) || 0))
    const earned = slip.salary_basis_days > 0 ? slip.gross * days / slip.salary_basis_days : 0
    const dayDeduction = slip.gross - earned
    const insurance = earned * slip.insurance_rate / 100
    const tax = (earned - insurance) * slip.tax_rate / 100
    const deductions = dayDeduction + (Number(advanceRecovery) || 0)
        + insurance + tax + (Number(otherDeductions) || 0)
    const estimatedNet = Math.max(0, slip.gross + slip.additions_total - deductions)

    return (
        <Modal
            open
            onClose={onClose}
            title={`تجهيز راتب ${slip.employee}`}
            description="عدّل أيام العمل والاستقطاعات قبل اعتماد كشف الرواتب؛ سيُقفل الحساب بعد الاعتماد."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={action.isPending}>إلغاء</Button>
                    <Button
                        loading={action.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await action.mutateAsync({
                                    id: slip.id,
                                    action: 'adjust',
                                    payload: {
                                        worked_days: Number(workedDays),
                                        advance_recovery: Number(advanceRecovery) || 0,
                                        other_deductions: Number(otherDeductions) || 0,
                                        other_note: note.trim() || null,
                                    },
                                })
                                toast.success('تم تحديث حساب الراتب.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تحديث حساب الراتب.'))
                            }
                        }}
                    >
                        حفظ الحساب
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Field label="أيام العمل المستحقة" required error={errors.worked_days} hint={`من ${slip.salary_basis_days} يومًا`}>
                        <Input
                            type="number"
                            min={0}
                            max={slip.salary_basis_days}
                            step="1"
                            value={workedDays}
                            onChange={(event) => setWorkedDays(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>
                    <Field label="أجر اليوم">
                        <Input value={formatMoney(slip.daily_salary)} disabled />
                    </Field>
                    <Field label="استرداد السلفة" error={errors.advance_recovery}>
                        <Input type="number" min={0} step="0.01" value={advanceRecovery} onChange={(event) => setAdvanceRecovery(event.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="خصومات أخرى" error={errors.other_deductions}>
                        <Input type="number" min={0} step="0.01" value={otherDeductions} onChange={(event) => setOtherDeductions(event.target.value)} dir="ltr" className="text-left" />
                    </Field>
                </div>

                <div className="rounded-2xl bg-navy-50 p-3 text-xs">
                    <div className="flex justify-between text-navy-500"><span>مرتب الأيام المستحقة</span><span className="tabular">{formatMoney(earned)}</span></div>
                    <div className="mt-1 flex justify-between text-red-600"><span>إجمالي الاستقطاعات التقديري</span><span className="tabular">{formatMoney(deductions)}</span></div>
                    <div className="mt-2 flex justify-between border-t border-navy-200 pt-2 text-sm font-extrabold text-emerald-700"><span>صافي الراتب</span><span className="tabular">{formatMoney(estimatedNet)}</span></div>
                </div>

                <Field label="سبب الخصم / ملاحظات" error={errors.other_note}>
                    <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

function PayModal({
    target,
    runId,
    onClose,
}: {
    target: 'run' | Payslip
    runId: number
    onClose: () => void
}) {
    const toast = useToast()
    const { data: boxes } = useCashBoxes()
    const runAct = usePayrollAction(runId)
    const slipAct = usePayslipAction()
    const [boxId, setBoxId] = useState('')

    const isRun = target === 'run'
    const busy = isRun ? runAct.isPending : slipAct.isPending

    return (
        <Modal
            open
            onClose={onClose}
            title={isRun ? 'صرف رواتب الكشف' : 'صرف الراتب'}
            description={
                isRun
                    ? 'يُصرف صافي كل قسيمة لم تُصرف بعد من الخزينة.'
                    : `صرف صافي راتب ${(target as Payslip).employee} من الخزينة.`
            }
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={busy}
                        onClick={async () => {
                            const payload = boxId ? { cash_box_id: Number(boxId) } : {}
                            try {
                                if (isRun) {
                                    await runAct.mutateAsync({ action: 'pay', ...payload })
                                } else {
                                    await slipAct.mutateAsync({
                                        id: (target as Payslip).id,
                                        action: 'pay',
                                        payload,
                                    })
                                }
                                toast.success('تم الصرف.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر الصرف.'))
                            }
                        }}
                    >
                        {tr('صرف')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {!isRun && (
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-navy-50 p-3 text-xs">
                        <div><span className="text-navy-400">أيام العمل</span><p className="tabular font-bold text-navy-800">{(target as Payslip).worked_days} / {(target as Payslip).salary_basis_days}</p></div>
                        <div><span className="text-navy-400">صافي التسليم</span><p className="tabular font-extrabold text-emerald-700">{formatMoney((target as Payslip).net)}</p></div>
                    </div>
                )}
                <Field label="من خزينة">
                    <Select value={boxId} onChange={(e) => setBoxId(e.target.value)}>
                        <option value="">الخزينة الرئيسية</option>
                        {boxes?.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} ({formatMoney(box.balance)})
                            </option>
                        ))}
                    </Select>
                </Field>
            </div>
        </Modal>
    )
}

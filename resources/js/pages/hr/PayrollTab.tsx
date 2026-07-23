import clsx from 'clsx'
import { ArrowRight, BadgeCheck, Coins, Plus, Printer, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
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
    const { data, isLoading } = usePayrollRuns({ per_page: 24 })

    if (openId !== null) {
        return <RunDetail id={openId} onBack={() => setOpenId(null)} />
    }

    return (
        <>
            <div className="mb-4 flex justify-end">
                <Button icon={Plus} onClick={() => setOpening(true)}>
                    فتح مسير شهر
                </Button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Coins}
                    title="لا توجد مسيّرات رواتب"
                    description="افتح مسير شهر ليُنشئ قسائم الرواتب لكل موظف على رأس العمل."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((run) => (
                        <button
                            key={run.id}
                            onClick={() => setOpenId(run.id)}
                            className="card flex w-full items-center justify-between gap-3 p-4 text-right transition hover:bg-navy-50"
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
            title="فتح مسير رواتب"
            description="يُنشئ قسيمة لكل موظف على رأس العمل بمرتّبه وبدلاته وخصوماته."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={open.isPending}>
                        إلغاء
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
                                toast.success('تم فتح المسير.')
                                onClose()
                                onOpened(run.id)
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر فتح المسير.'))
                            }
                        }}
                    >
                        فتح
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
    'يناير',
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
    const { data: run, isLoading } = usePayrollRun(id)
    const act = usePayrollAction(id)
    const [payOpen, setPayOpen] = useState<'run' | Payslip | null>(null)

    const runAction = async (action: 'approve') => {
        if (action === 'approve' && !window.confirm('اعتماد المسير يُثبّت الخصومات ويقيّده في الدفاتر. متابعة؟'))
            return
        try {
            await act.mutateAsync({ action })
            toast.success('تم اعتماد المسير.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر اعتماد المسير.'))
        }
    }

    return (
        <>
            <button
                onClick={onBack}
                className="tap mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy-500"
            >
                <ArrowRight className="size-4" />
                كل المسيّرات
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
                                {run.status === 'draft' && (
                                    <Button
                                        icon={BadgeCheck}
                                        loading={act.isPending}
                                        onClick={() => runAction('approve')}
                                    >
                                        اعتماد
                                    </Button>
                                )}
                                {run.status !== 'draft' && run.unpaid_net > 0 && (
                                    <Button icon={Wallet} onClick={() => setPayOpen('run')}>
                                        صرف الكل
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
                                onPay={() => setPayOpen(slip)}
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
    onPay,
}: {
    slip: Payslip
    canPay: boolean
    onPay: () => void
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
            title={isRun ? 'صرف رواتب المسير' : 'صرف الراتب'}
            description={
                isRun
                    ? 'يُصرف صافي كل قسيمة لم تُصرف بعد من الخزينة.'
                    : `صرف صافي راتب ${(target as Payslip).employee} من الخزينة.`
            }
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        إلغاء
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
                        صرف
                    </Button>
                </>
            }
        >
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
        </Modal>
    )
}

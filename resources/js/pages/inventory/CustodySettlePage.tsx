import { Banknote, HandCoins, Undo2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { useCustody, useCustodyCash, useCustodySpend } from '@/lib/queries'
import type { CustodyStatement } from '@/types'

/**
 * Settling a cash float: what the technician spent out of it, and handing the
 * remainder back. Spending draws the balance down; a return closes what is
 * left, so the float reconciles against what was advanced.
 */
export function CustodySettlePage() {
    const { data: statements, isLoading } = useCustody()
    const [spendFor, setSpendFor] = useState<CustodyStatement | null>(null)
    const [returnFor, setReturnFor] = useState<CustodyStatement | null>(null)

    const withFloat = (statements ?? []).filter((s) => s.cash.balance > 0 || s.cash.box_id)

    return (
        <>
            <PageHeader title="مصروفات وتسوية العهدة" subtitle="تسجيل ما صُرف من العهدة النقدية وردّ المتبقي" />

            {isLoading ? (
                <SkeletonCard />
            ) : !withFloat.length ? (
                <EmptyState
                    icon={Wallet}
                    title="لا توجد عهد نقدية مفتوحة"
                    description="اصرف عهدة نقدية لفني من شاشة العهد لتظهر هنا للتسوية."
                />
            ) : (
                <div className="space-y-2">
                    {withFloat.map((s) => (
                        <div key={s.technician.id} className="card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-navy-900">{s.technician.name}</p>
                                    {s.technician.job_title && (
                                        <p className="text-[11px] text-navy-400">{s.technician.job_title}</p>
                                    )}
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] font-bold text-navy-400">رصيد العهدة</p>
                                    <p className="tabular text-lg font-extrabold text-navy-900">
                                        {formatMoney(s.cash.balance)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-100 pt-3">
                                <Button
                                    variant="secondary"
                                    icon={Banknote}
                                    className="text-xs"
                                    onClick={() => setSpendFor(s)}
                                >
                                    تسجيل مصروف
                                </Button>
                                <Button
                                    variant="secondary"
                                    icon={Undo2}
                                    className="text-xs"
                                    disabled={!s.cash.box_id || s.cash.balance <= 0}
                                    onClick={() => setReturnFor(s)}
                                >
                                    ردّ المتبقي / تسوية
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {spendFor && <SpendDialog statement={spendFor} onClose={() => setSpendFor(null)} />}
            {returnFor && <ReturnDialog statement={returnFor} onClose={() => setReturnFor(null)} />}
        </>
    )
}

function SpendDialog({ statement, onClose }: { statement: CustodyStatement; onClose: () => void }) {
    const toast = useToast()
    const spend = useCustodySpend()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({ amount: '', category: '', note: '' })

    return (
        <Modal
            open
            onClose={onClose}
            title={`مصروف من عهدة ${statement.technician.name}`}
            description={`الرصيد الحالي ${formatMoney(statement.cash.balance)}`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={spend.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={spend.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await spend.mutateAsync({
                                    user_id: statement.technician.id,
                                    amount: Number(form.amount),
                                    category: form.category || null,
                                    note: form.note || null,
                                })
                                toast.success('تم تسجيل المصروف.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="المبلغ" required error={errors.amount}>
                    <Input type="number" min={0} step="any" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} dir="ltr" className="text-left" />
                </Field>
                <Field label="البند" error={errors.category} hint="وقود، قطع غيار، مواصلات…">
                    <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                </Field>
                <Field label="ملاحظة / إيصال" error={errors.note}>
                    <Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                </Field>
            </div>
        </Modal>
    )
}

function ReturnDialog({ statement, onClose }: { statement: CustodyStatement; onClose: () => void }) {
    const toast = useToast()
    const cash = useCustodyCash()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [amount, setAmount] = useState(String(statement.cash.balance))
    const [note, setNote] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title={`ردّ عهدة ${statement.technician.name}`}
            description={`المتبقي في العهدة ${formatMoney(statement.cash.balance)}`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={cash.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        icon={HandCoins}
                        loading={cash.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await cash.mutateAsync({
                                    user_id: statement.technician.id,
                                    cash_box_id: statement.cash.box_id,
                                    amount: Number(amount),
                                    direction: 'return',
                                    note: note || null,
                                })
                                toast.success('تم ردّ العهدة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر الردّ.'))
                            }
                        }}
                    >
                        ردّ للخزينة
                    </Button>
                </>
            }
        >
            <Field label="المبلغ المرتجع" required error={errors.amount}>
                <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" className="text-left" />
            </Field>
            <div className="mt-4">
                <Field label="ملاحظة" error={errors.note}>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

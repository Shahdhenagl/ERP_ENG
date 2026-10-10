import { Camera, Save, X } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { EXPENSE_CATEGORIES, formatMoney } from '@/lib/domain'
import { useSpendMine } from '@/lib/queries'

/**
 * A technician logging what they paid for out of their float: the heading, the
 * amount, and a photo of the receipt. The spend leaves their custody the moment
 * it is saved, so the balance on the home screen reflects it at once.
 */
export function CustodyExpenseModal({
    balance,
    taskCash,
    taskId,
    taskCode,
    onClose,
}: {
    balance: number
    /** The custody assigned to this task, distinct from the technician's total float. */
    taskCash?: {
        advanced: number
        spent: number
        remaining: number
    } | null
    /** When set, the expense is billed to this job. */
    taskId?: number
    taskCode?: string
    onClose: () => void
}) {
    const toast = useToast()
    const spend = useSpendMine()
    const fileInput = useRef<HTMLInputElement>(null)

    const [errors, setErrors] = useState<Record<string, string>>({})
    const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0])
    const [amount, setAmount] = useState('')
    const [note, setNote] = useState('')
    const [receipt, setReceipt] = useState<File | null>(null)
    const previewUrl = receipt ? URL.createObjectURL(receipt) : null

    const handleSave = async () => {
        setErrors({})
        try {
            await spend.mutateAsync({
                amount: Number(amount),
                category,
                note: note || null,
                task_id: taskId ?? null,
                receipt,
            })
            toast.success('تم تسجيل المصروف وخصمه من عهدتك.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر تسجيل المصروف.'))
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={taskCode ? `مصروف على المهمة ${taskCode}` : 'تسجيل مصروف'}
            description={
                balance < 0
                    ? `عهدتك بالسالب ${formatMoney(balance)} — مستحق لك، أي مصروف يزيد الفرق`
                    : `رصيد عهدتك الحالي ${formatMoney(balance)}`
            }
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={spend.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button icon={Save} loading={spend.isPending} onClick={handleSave}>
                        {tr('حفظ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {taskCash && (
                    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3">
                        <p className="mb-2 text-xs font-extrabold text-brand-800">عهدة هذه المهمة</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                                ['المسلّم', taskCash.advanced, 'text-brand-700'],
                                ['المصروف', taskCash.spent, 'text-navy-900'],
                                ['المتبقي', taskCash.remaining, 'text-amber-700'],
                            ].map(([label, value, tone]) => (
                                <div key={String(label)} className="rounded-lg bg-white/80 px-2 py-2">
                                    <p className="text-[10px] font-bold text-navy-400">{label}</p>
                                    <p className={`tabular text-xs font-extrabold ${tone}`}>{formatMoney(Number(value))}</p>
                                </div>
                            ))}
                        </div>
                        <p className="mt-2 text-[11px] text-navy-500">
                            {amount
                                ? `المتبقي بعد هذا المصروف: ${formatMoney(taskCash.remaining - Number(amount))}`
                                : 'بعد حفظ المصروف سيتم تحديث المتبقي تلقائيًا.'}
                        </p>
                    </div>
                )}

                <Field label="نوع المصروف" required error={errors.category}>
                    <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                        {EXPENSE_CATEGORIES.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="المبلغ" required error={errors.amount}>
                    <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        dir="ltr"
                        className="text-left"
                        placeholder="0.00"
                        autoFocus
                    />
                </Field>

                <Field label="إيصال (صورة)" error={errors.receipt}>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                    />

                    {previewUrl ? (
                        <div className="relative">
                            <img
                                src={previewUrl}
                                alt="إيصال"
                                className="h-40 w-full rounded-xl border border-navy-200 bg-navy-50 object-contain p-1"
                            />
                            <button
                                type="button"
                                onClick={() => setReceipt(null)}
                                className="tap absolute top-2 left-2 grid size-8 place-items-center rounded-lg bg-surface/90 text-red-600 shadow"
                                aria-label="إزالة"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileInput.current?.click()}
                            className="tap flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50 py-6 text-navy-500 transition hover:bg-navy-100"
                        >
                            <Camera className="size-6" />
                            <span className="text-xs font-bold">التقاط صورة الإيصال</span>
                        </button>
                    )}
                </Field>

                <Field label="ملاحظة" error={errors.note}>
                    <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="تفاصيل إضافية (اختياري)…"
                    />
                </Field>
            </div>
        </Modal>
    )
}

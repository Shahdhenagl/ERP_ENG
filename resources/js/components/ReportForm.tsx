import { Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { SignaturePad } from '@/components/SignaturePad'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errorMessage } from '@/lib/api'
import { DEVICE_CONDITION, READING_FIELDS } from '@/lib/domain'
import { useSaveReport } from '@/lib/queries'
import type { ReportType, Task, TaskReport } from '@/types'

interface ReportFormProps {
    open: boolean
    onClose: () => void
    task: Task
    type: ReportType
    /** Existing report to edit, when refiling. */
    existing?: TaskReport
    onSaved?: () => void
}

interface PartRow {
    name: string
    qty: string
}

export function ReportForm({ open, onClose, task, type, existing, onSaved }: ReportFormProps) {
    const toast = useToast()
    const save = useSaveReport(task.id)

    const [readings, setReadings] = useState<Record<string, string>>(() =>
        Object.fromEntries(
            READING_FIELDS.map((field) => [
                field.key,
                existing?.readings[field.key as keyof TaskReport['readings']]?.toString() ?? '',
            ]),
        ),
    )
    const [condition, setCondition] = useState(existing?.device_condition ?? '')
    const [batteriesFlag, setBatteriesFlag] = useState(existing?.batteries_need_replacement ?? false)
    const [findings, setFindings] = useState(existing?.findings ?? '')
    const [actions, setActions] = useState(existing?.actions_taken ?? '')
    const [recommendations, setRecommendations] = useState(existing?.recommendations ?? '')
    const [parts, setParts] = useState<PartRow[]>(
        existing?.parts_used?.map((part) => ({ name: part.name, qty: String(part.qty ?? 1) })) ?? [],
    )
    const [signedBy, setSignedBy] = useState(existing?.signed_by_name ?? '')
    const [signature, setSignature] = useState<string | null>(null)

    const isCompletion = type === 'completion'

    const handleSave = async () => {
        // Blank readings must be sent as null, not "" — the API expects numerics.
        const numericReadings = Object.fromEntries(
            Object.entries(readings).map(([key, value]) => [key, value === '' ? null : Number(value)]),
        )

        try {
            await save.mutateAsync({
                type,
                ...numericReadings,
                device_condition: condition || null,
                batteries_need_replacement: batteriesFlag,
                findings: findings || null,
                actions_taken: actions || null,
                recommendations: recommendations || null,
                parts_used: parts
                    .filter((part) => part.name.trim())
                    .map((part) => ({ name: part.name.trim(), qty: Number(part.qty) || 1 })),
                signed_by_name: signedBy || null,
                signature,
            })

            toast.success(isCompletion ? 'تم حفظ تقرير الإنهاء.' : 'تم حفظ تقرير التشخيص.')
            onSaved?.()
            onClose()
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر حفظ التقرير.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={isCompletion ? 'تقرير الإنهاء' : 'تقرير التشخيص'}
            description={`${task.code} — ${task.customer?.name ?? ''}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button icon={Save} loading={save.isPending} onClick={handleSave}>
                        حفظ التقرير
                    </Button>
                </>
            }
        >
            <div className="space-y-6">
                {/* ── Readings ───────────────────────────────── */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-navy-800">قراءات الجهاز</h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {READING_FIELDS.map((field) => (
                            <Field key={field.key} label={`${field.label} (${field.unit})`}>
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    step={field.step}
                                    value={readings[field.key] ?? ''}
                                    onChange={(event) =>
                                        setReadings((current) => ({
                                            ...current,
                                            [field.key]: event.target.value,
                                        }))
                                    }
                                    placeholder="—"
                                    dir="ltr"
                                    className="text-left"
                                />
                            </Field>
                        ))}
                    </div>
                </section>

                {/* ── Condition ──────────────────────────────── */}
                <section className="grid gap-3 sm:grid-cols-2">
                    <Field label="حالة الجهاز">
                        <Select value={condition} onChange={(event) => setCondition(event.target.value as never)}>
                            <option value="">— اختر —</option>
                            {Object.entries(DEVICE_CONDITION).map(([value, meta]) => (
                                <option key={value} value={value}>
                                    {meta.label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <label className="flex cursor-pointer items-center gap-3 self-end rounded-xl border border-navy-200 bg-white px-4 py-3 transition hover:bg-navy-50">
                        <input
                            type="checkbox"
                            checked={batteriesFlag}
                            onChange={(event) => setBatteriesFlag(event.target.checked)}
                            className="size-4.5 accent-brand-500"
                        />
                        <span className="text-sm font-semibold text-navy-700">
                            البطاريات تحتاج استبدال
                        </span>
                    </label>
                </section>

                {/* ── Narrative ──────────────────────────────── */}
                <section className="space-y-3">
                    <Field label="ما تم رصده">
                        <Textarea
                            value={findings}
                            onChange={(event) => setFindings(event.target.value)}
                            placeholder="وصف الحالة والأعطال الملاحظة…"
                        />
                    </Field>

                    <Field label="ما تم تنفيذه">
                        <Textarea
                            value={actions}
                            onChange={(event) => setActions(event.target.value)}
                            placeholder="الإجراءات التي قام بها الفني…"
                        />
                    </Field>

                    <Field label="التوصيات">
                        <Textarea
                            value={recommendations}
                            onChange={(event) => setRecommendations(event.target.value)}
                            placeholder="ما يُنصح به لاحقًا…"
                        />
                    </Field>
                </section>

                {/* ── Parts ──────────────────────────────────── */}
                <section>
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-navy-800">قطع الغيار المستخدمة</h3>
                        <Button
                            variant="ghost"
                            icon={Plus}
                            className="text-xs"
                            onClick={() => setParts((current) => [...current, { name: '', qty: '1' }])}
                        >
                            إضافة
                        </Button>
                    </div>

                    {parts.length === 0 ? (
                        <p className="rounded-xl bg-navy-50 px-4 py-3 text-xs text-navy-400">
                            لم تُستخدم قطع غيار.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {parts.map((part, index) => (
                                <div key={index} className="flex gap-2">
                                    <Input
                                        value={part.name}
                                        onChange={(event) =>
                                            setParts((current) =>
                                                current.map((row, i) =>
                                                    i === index ? { ...row, name: event.target.value } : row,
                                                ),
                                            )
                                        }
                                        placeholder="اسم القطعة"
                                        className="flex-1"
                                    />
                                    <Input
                                        type="number"
                                        min="0"
                                        value={part.qty}
                                        onChange={(event) =>
                                            setParts((current) =>
                                                current.map((row, i) =>
                                                    i === index ? { ...row, qty: event.target.value } : row,
                                                ),
                                            )
                                        }
                                        className="w-20 text-center"
                                        dir="ltr"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setParts((current) => current.filter((_, i) => i !== index))
                                        }
                                        className="tap grid shrink-0 place-items-center rounded-xl px-3 text-red-500 transition hover:bg-red-50"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Signature (completion only) ────────────── */}
                {isCompletion && (
                    <section>
                        <h3 className="mb-3 text-sm font-bold text-navy-800">توقيع العميل</h3>

                        <Field label="اسم المستلم" className="mb-3">
                            <Input
                                value={signedBy}
                                onChange={(event) => setSignedBy(event.target.value)}
                                placeholder="اسم من استلم العمل"
                            />
                        </Field>

                        {existing?.signature_url && !signature && (
                            <div className="mb-3">
                                <p className="mb-1.5 text-xs text-navy-400">التوقيع المحفوظ:</p>
                                <img
                                    src={existing.signature_url}
                                    alt="توقيع العميل"
                                    className="h-24 rounded-xl border border-navy-200 bg-white object-contain p-2"
                                />
                            </div>
                        )}

                        <SignaturePad onChange={setSignature} />
                    </section>
                )}
            </div>
        </Modal>
    )
}

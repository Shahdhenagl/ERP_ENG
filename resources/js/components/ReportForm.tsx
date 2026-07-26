import { Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { SignaturePad } from '@/components/SignaturePad'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errorMessage } from '@/lib/api'
import clsx from 'clsx'
import {
    ALL_READING_KEYS,
    DEVICE_CONDITION,
    PHASE_READINGS,
    READING_FIELDS,
    SITE_CHECKS,
    SITE_CHECK_OPTIONS,
} from '@/lib/domain'
import { useChecklistItems, useMyStock, useSaveReport } from '@/lib/queries'
import type { ChecklistAnswer, ReportType, Task, TaskReport } from '@/types'

type CheckKey = (typeof SITE_CHECKS)[number]['key']

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
    /** Set when picked off the van; null for a part bought outside stock. */
    item_id?: number | null
    name: string
    qty: string
}

export function ReportForm({ open, onClose, task, type, existing, onSaved }: ReportFormProps) {
    const toast = useToast()
    const save = useSaveReport(task.id)

    const [readings, setReadings] = useState<Record<string, string>>(() =>
        Object.fromEntries(
            ALL_READING_KEYS.map((key) => [
                key,
                existing?.readings[key as keyof TaskReport['readings']]?.toString() ?? '',
            ]),
        ),
    )
    const [checks, setChecks] = useState<Record<CheckKey, string>>(() =>
        Object.fromEntries(
            SITE_CHECKS.map((c) => [c.key, existing?.site_checks?.[c.key] ?? '']),
        ) as Record<CheckKey, string>,
    )

    // The fixed periodic-maintenance checklist — only on a maintenance visit.
    const isPeriodic = task.type === 'maintenance'
    const { data: checklistItems = [] } = useChecklistItems()
    const [ppm, setPpm] = useState<Record<string, { status: string; note: string }>>(() =>
        Object.fromEntries(
            (existing?.ppm_checklist ?? []).map((answer) => [
                answer.label,
                { status: answer.status ?? '', note: answer.note ?? '' },
            ]),
        ),
    )

    const [condition, setCondition] = useState(existing?.device_condition ?? '')
    const [batteriesFlag, setBatteriesFlag] = useState(existing?.batteries_need_replacement ?? false)
    const [findings, setFindings] = useState(existing?.findings ?? '')
    const [actions, setActions] = useState(existing?.actions_taken ?? '')
    const [recommendations, setRecommendations] = useState(existing?.recommendations ?? '')
    const [parts, setParts] = useState<PartRow[]>(
        existing?.parts_used?.map((part) => ({
            item_id: part.item_id ?? null,
            name: part.name,
            qty: String(part.qty ?? 1),
        })) ?? [],
    )

    // What this technician is carrying, so parts can be picked rather than typed.
    const { data: vanStock = [] } = useMyStock()
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
                check_earthing: checks.earthing || null,
                check_environment: checks.environment || null,
                check_charger: checks.charger || null,
                check_accessories: checks.accessories || null,
                ppm_checklist:
                    isPeriodic && checklistItems.length
                        ? checklistItems.map((item): ChecklistAnswer => ({
                              label: item.label,
                              status: (ppm[item.label]?.status || null) as ChecklistAnswer['status'],
                              note: ppm[item.label]?.note || null,
                          }))
                        : null,
                device_condition: condition || null,
                batteries_need_replacement: batteriesFlag,
                findings: findings || null,
                actions_taken: actions || null,
                recommendations: recommendations || null,
                parts_used: parts
                    .filter((part) => part.name.trim())
                    .map((part) => ({
                        item_id: part.item_id ?? null,
                        name: part.name.trim(),
                        qty: Number(part.qty) || 1,
                    })),
                signed_by_name: signedBy || null,
                signature,
            })

            // Filing the completion report closes the job server-side, so say so
            // rather than leaving the technician looking for another button.
            toast.success(
                isCompletion && task.status === 'in_progress'
                    ? 'تم حفظ تقرير الإنهاء وإغلاق المهمة.'
                    : isCompletion
                      ? 'تم حفظ تقرير الإنهاء.'
                      : 'تم حفظ تقرير التشخيص.',
            )
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

                    {/* Voltage per phase — fill L1 for a single-phase unit, all
                        three for a three-phase one. */}
                    <div className="space-y-3">
                        {PHASE_READINGS.map((phase) => (
                            <Field key={phase.label} label={`${phase.label} (فولت)`}>
                                <div className="grid grid-cols-3 gap-2">
                                    {phase.keys.map((key, index) => (
                                        <Input
                                            key={key}
                                            type="number"
                                            inputMode="decimal"
                                            step="0.1"
                                            value={readings[key] ?? ''}
                                            onChange={(event) =>
                                                setReadings((current) => ({
                                                    ...current,
                                                    [key]: event.target.value,
                                                }))
                                            }
                                            placeholder={`L${index + 1}`}
                                            dir="ltr"
                                            className="text-center"
                                        />
                                    ))}
                                </div>
                            </Field>
                        ))}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
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

                {/* ── Site inspection ────────────────────────── */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-navy-800">فحص الموقع</h3>
                    <div className="space-y-2">
                        {SITE_CHECKS.map((check) => (
                            <div
                                key={check.key}
                                className="flex items-center justify-between gap-3 rounded-xl border border-navy-200 bg-white px-3 py-2"
                            >
                                <span className="text-sm font-semibold text-navy-700">{check.label}</span>
                                <div className="flex shrink-0 gap-1">
                                    {(['ok', 'issue', 'na'] as const).map((value) => {
                                        const active = checks[check.key] === value

                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() =>
                                                    setChecks((current) => ({
                                                        ...current,
                                                        [check.key]: active ? '' : value,
                                                    }))
                                                }
                                                className={clsx(
                                                    'tap rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition',
                                                    active
                                                        ? SITE_CHECK_OPTIONS[value].chip
                                                        : 'bg-navy-50 text-navy-400',
                                                )}
                                            >
                                                {SITE_CHECK_OPTIONS[value].label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
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

                {/* ── Periodic checklist (maintenance visits) ── */}
                {isPeriodic && checklistItems.length > 0 && (
                    <section>
                        <h3 className="mb-3 text-sm font-bold text-navy-800">قائمة الفحص الدوري</h3>
                        <div className="space-y-2">
                            {checklistItems.map((item) => {
                                const answer = ppm[item.label] ?? { status: '', note: '' }

                                return (
                                    <div
                                        key={item.id}
                                        className="rounded-xl border border-navy-200 bg-white px-3 py-2"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="min-w-0 text-sm font-semibold text-navy-700">
                                                {item.label}
                                            </span>
                                            <div className="flex shrink-0 gap-1">
                                                {(['ok', 'issue', 'na'] as const).map((value) => {
                                                    const active = answer.status === value

                                                    return (
                                                        <button
                                                            key={value}
                                                            type="button"
                                                            onClick={() =>
                                                                setPpm((current) => ({
                                                                    ...current,
                                                                    [item.label]: {
                                                                        status: active ? '' : value,
                                                                        note: current[item.label]?.note ?? '',
                                                                    },
                                                                }))
                                                            }
                                                            className={clsx(
                                                                'tap rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition',
                                                                active
                                                                    ? SITE_CHECK_OPTIONS[value].chip
                                                                    : 'bg-navy-50 text-navy-400',
                                                            )}
                                                        >
                                                            {SITE_CHECK_OPTIONS[value].label}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {answer.status === 'issue' && (
                                            <Input
                                                value={answer.note}
                                                onChange={(e) =>
                                                    setPpm((current) => ({
                                                        ...current,
                                                        [item.label]: {
                                                            status: current[item.label]?.status ?? 'issue',
                                                            note: e.target.value,
                                                        },
                                                    }))
                                                }
                                                placeholder="ملاحظة عن الملاحظة…"
                                                className="mt-2"
                                            />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                )}

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
                            onClick={() =>
                                setParts((current) => [...current, { item_id: null, name: '', qty: '1' }])
                            }
                        >
                            إضافة
                        </Button>
                    </div>

                    {/* Picking from the van deducts stock; typing a name does not.
                        Both are legitimate — a part bought on the way to site was
                        never in inventory. */}
                    {vanStock.length > 0 && (
                        <p className="mb-2 rounded-xl bg-navy-50 px-3 py-2 text-[11px] text-navy-500">
                            اختيار قطعة من عهدتك يخصمها من رصيدك تلقائيًا.
                        </p>
                    )}

                    {parts.length === 0 ? (
                        <p className="rounded-xl bg-navy-50 px-4 py-3 text-xs text-navy-400">
                            لم تُستخدم قطع غيار.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {parts.map((part, index) => {
                                const onHand = vanStock.find((line) => line.item_id === part.item_id)

                                return (
                                <div key={index} className="space-y-1">
                                <div className="flex gap-2">
                                    {vanStock.length > 0 ? (
                                        <Select
                                            value={part.item_id ? String(part.item_id) : '__free'}
                                            onChange={(event) => {
                                                const value = event.target.value
                                                const line = vanStock.find(
                                                    (row) => String(row.item_id) === value,
                                                )

                                                setParts((current) =>
                                                    current.map((row, i) =>
                                                        i === index
                                                            ? line
                                                                ? { ...row, item_id: line.item_id, name: line.name }
                                                                : { ...row, item_id: null, name: '' }
                                                            : row,
                                                    ),
                                                )
                                            }}
                                            className="flex-1"
                                        >
                                            <option value="__free">— قطعة من خارج العهدة —</option>
                                            {vanStock.map((line) => (
                                                <option key={line.item_id} value={line.item_id}>
                                                    {line.name} (متاح {line.qty} {line.unit})
                                                </option>
                                            ))}
                                        </Select>
                                    ) : (
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
                                    )}
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

                                {/* Catch an over-claim here rather than letting the
                                    server reject the whole report on save. */}
                                {onHand && Number(part.qty) > onHand.qty && (
                                    <p className="px-1 text-[11px] font-medium text-red-600">
                                        المتاح في عهدتك {onHand.qty} {onHand.unit} فقط.
                                    </p>
                                )}
                                </div>
                                )
                            })}
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

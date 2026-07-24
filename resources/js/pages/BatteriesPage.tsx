import clsx from 'clsx'
import { BatteryCharging, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
    Button,
    EmptyState,
    Field,
    Input,
    PageHeader,
    Select,
    SkeletonCard,
    Textarea,
} from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useAssets, useBatteries, useReplaceBattery, useSaveBattery } from '@/lib/queries'
import type { Battery, BatteryStatus } from '@/types'

const STATUS: Record<BatteryStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    replaced: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
    faulty: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

/**
 * Every battery bank, soonest-due first.
 *
 * The number that matters is how long each has left, so it leads the row and
 * colours by urgency. "Due soon" narrows to the banks that need a visit; a
 * replacement closes the old bank and opens a new one in its place.
 */
export function BatteriesPage() {
    const [dueOnly, setDueOnly] = useState(false)
    const { data, isLoading } = useBatteries(dueOnly ? { due_within: 30 } : {})
    const [creating, setCreating] = useState(false)
    const [replacing, setReplacing] = useState<Battery | null>(null)

    return (
        <>
            <PageHeader
                title="إدارة البطاريات"
                subtitle="متابعة بنوك البطاريات ومواعيد استبدالها"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        تسجيل بطارية
                    </Button>
                }
            />

            <div className="mb-4 flex items-center gap-2">
                <button
                    onClick={() => setDueOnly((v) => !v)}
                    className={clsx(
                        'tap rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                        dueOnly
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-white text-navy-500 ring-navy-200',
                    )}
                >
                    تقترب على الانتهاء
                    {data?.meta.due_soon ? ` (${data.meta.due_soon})` : ''}
                </button>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={BatteryCharging}
                    title={dueOnly ? 'لا توجد بطاريات قاربت على الانتهاء' : 'لا توجد بطاريات مسجّلة'}
                    description="سجّل بنك البطاريات لكل جهاز لمتابعة عمره الافتراضي وموعد استبداله."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((battery) => (
                        <BatteryRow
                            key={battery.id}
                            battery={battery}
                            onReplace={() => setReplacing(battery)}
                        />
                    ))}
                </div>
            )}

            {creating && <BatteryForm onClose={() => setCreating(false)} />}
            {replacing && (
                <ReplaceDialog battery={replacing} onClose={() => setReplacing(null)} />
            )}
        </>
    )
}

function BatteryRow({ battery, onReplace }: { battery: Battery; onReplace: () => void }) {
    const remaining = battery.days_until_due

    const dueTone = battery.is_overdue
        ? 'text-red-600'
        : remaining !== null && remaining <= 30
          ? 'text-amber-600'
          : 'text-navy-500'

    return (
        <div className="card p-3.5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-[11px] font-bold text-brand-600">{battery.code}</span>
                        <span className={clsx('badge', STATUS[battery.status])}>{battery.status_label}</span>
                        {battery.replacement_code && (
                            <span className="tabular text-[11px] font-bold text-navy-400">
                                ← {battery.replacement_code}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 truncate text-sm font-bold text-navy-900">
                        {battery.customer ?? '—'}
                        {battery.asset && (
                            <span className="text-navy-400"> · {battery.asset_label || battery.asset}</span>
                        )}
                    </p>
                    <p className="tabular text-[11px] text-navy-400">
                        {[
                            battery.brand,
                            battery.capacity_ah ? `${battery.capacity_ah}Ah` : null,
                            battery.count > 1 ? `×${battery.count}` : null,
                            battery.installed_on ? `رُكّبت ${formatDate(battery.installed_on)}` : null,
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                </div>

                <div className="shrink-0 text-left">
                    {battery.status === 'active' && battery.due_at ? (
                        <>
                            <p className={clsx('tabular text-sm font-extrabold', dueTone)}>
                                {battery.is_overdue
                                    ? `متأخرة ${Math.abs(remaining ?? 0)} يوم`
                                    : `باقٍ ${remaining} يوم`}
                            </p>
                            <p className="tabular text-[10px] text-navy-400">
                                الاستبدال {formatDate(battery.due_at)}
                            </p>
                        </>
                    ) : battery.replaced_on ? (
                        <p className="tabular text-[11px] text-navy-400">
                            استُبدلت {formatDate(battery.replaced_on)}
                        </p>
                    ) : null}
                </div>
            </div>

            {battery.status === 'active' && (
                <div className="mt-3 flex gap-2 border-t border-navy-100 pt-3">
                    <button
                        onClick={onReplace}
                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700"
                    >
                        <RefreshCw className="size-3.5" />
                        استبدال
                    </button>
                </div>
            )}
        </div>
    )
}

/* ── New battery ─────────────────────────────────────────── */

function BatteryForm({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const save = useSaveBattery()
    const { data: assets } = useAssets({ per_page: 500 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        asset_id: '',
        serial_number: '',
        brand: '',
        model: '',
        capacity_ah: '',
        voltage: '',
        count: '1',
        installed_on: new Date().toISOString().slice(0, 10),
        life_months: '24',
        warranty_months: '',
        notes: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title="تسجيل بطارية"
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
                                    asset_id: form.asset_id ? Number(form.asset_id) : null,
                                    serial_number: form.serial_number || null,
                                    brand: form.brand || null,
                                    model: form.model || null,
                                    capacity_ah: form.capacity_ah ? Number(form.capacity_ah) : null,
                                    voltage: form.voltage ? Number(form.voltage) : null,
                                    count: Number(form.count) || 1,
                                    installed_on: form.installed_on,
                                    life_months: Number(form.life_months) || 24,
                                    warranty_months: form.warranty_months
                                        ? Number(form.warranty_months)
                                        : null,
                                    notes: form.notes || null,
                                })
                                toast.success('تم تسجيل البطارية.')
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
                <Field label="الجهاز (UPS)" error={errors.asset_id} hint="يُنسب مالك البطارية من الجهاز">
                    <Select value={form.asset_id} onChange={(e) => set('asset_id')(e.target.value)}>
                        <option value="">بدون ربط</option>
                        {assets?.data.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                                {asset.code} — {asset.brand} {asset.model}
                                {asset.customer ? ` · ${asset.customer}` : ''}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الماركة" error={errors.brand}>
                        <Input value={form.brand} onChange={(e) => set('brand')(e.target.value)} />
                    </Field>
                    <Field label="الموديل" error={errors.model}>
                        <Input value={form.model} onChange={(e) => set('model')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="السعة (Ah)" error={errors.capacity_ah}>
                        <Input type="number" value={form.capacity_ah} onChange={(e) => set('capacity_ah')(e.target.value)} />
                    </Field>
                    <Field label="الجهد (V)" error={errors.voltage}>
                        <Input type="number" value={form.voltage} onChange={(e) => set('voltage')(e.target.value)} />
                    </Field>
                    <Field label="عدد الخلايا" error={errors.count}>
                        <Input type="number" min={1} value={form.count} onChange={(e) => set('count')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="تاريخ التركيب" required error={errors.installed_on}>
                        <Input type="date" value={form.installed_on} onChange={(e) => set('installed_on')(e.target.value)} />
                    </Field>
                    <Field label="العمر المتوقع (شهر)" required error={errors.life_months}>
                        <Input type="number" min={1} value={form.life_months} onChange={(e) => set('life_months')(e.target.value)} />
                    </Field>
                    <Field label="الضمان (شهر)" error={errors.warranty_months}>
                        <Input type="number" value={form.warranty_months} onChange={(e) => set('warranty_months')(e.target.value)} />
                    </Field>
                </div>

                <Field label="الرقم التسلسلي" error={errors.serial_number}>
                    <Input value={form.serial_number} onChange={(e) => set('serial_number')(e.target.value)} dir="ltr" className="text-left" />
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

/* ── Replace ─────────────────────────────────────────────── */

function ReplaceDialog({ battery, onClose }: { battery: Battery; onClose: () => void }) {
    const toast = useToast()
    const replace = useReplaceBattery()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({
        installed_on: new Date().toISOString().slice(0, 10),
        serial_number: '',
        life_months: String(battery.life_months),
        notes: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title={`استبدال بطارية ${battery.code}`}
            description="تُغلق البطارية الحالية ويُفتح بنك جديد يرث بيانات الجهاز والمواصفات."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={replace.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={replace.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await replace.mutateAsync({
                                    id: battery.id,
                                    installed_on: form.installed_on,
                                    serial_number: form.serial_number || null,
                                    life_months: Number(form.life_months) || battery.life_months,
                                    notes: form.notes || null,
                                })
                                toast.success('تم الاستبدال.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر الاستبدال.'))
                            }
                        }}
                    >
                        تأكيد الاستبدال
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="تاريخ التركيب" required error={errors.installed_on}>
                        <Input type="date" value={form.installed_on} onChange={(e) => set('installed_on')(e.target.value)} />
                    </Field>
                    <Field label="العمر المتوقع (شهر)" error={errors.life_months}>
                        <Input type="number" min={1} value={form.life_months} onChange={(e) => set('life_months')(e.target.value)} />
                    </Field>
                </div>
                <Field label="الرقم التسلسلي الجديد" error={errors.serial_number}>
                    <Input value={form.serial_number} onChange={(e) => set('serial_number')(e.target.value)} dir="ltr" className="text-left" />
                </Field>
                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

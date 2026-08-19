import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { ArrowRight, CheckCheck, Layers, Plus, Save, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PageHeader, Select, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { PRIORITY, TASK_TYPE } from '@/lib/domain'
import { useArea } from '@/lib/nav'
import {
    useBulkCreateTasks,
    useCustomerBranches,
    useCustomers,
    useTechnicians,
} from '@/lib/queries'
import type { TaskPriority, TaskType } from '@/types'

/* ── Types ──────────────────────────────────────────────────── */

interface Target {
    id: string          // client-only key
    customer_id: string
    branch_id: string
    label: string       // display label for the row
}

/* ── CustomerBranchRow ───────────────────────────────────────── */

function CustomerBranchRow({
    target,
    customers,
    onChange,
    onRemove,
}: {
    target: Target
    customers: Array<{ id: number; name: string; company: string | null }>
    onChange: (t: Target) => void
    onRemove: () => void
}) {
    const { data: branchList } = useCustomerBranches(
        target.customer_id ? Number(target.customer_id) : undefined,
    )
    const branches = branchList ?? []

    return (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 rounded-xl border border-navy-200 bg-navy-50/40 p-3">
            {/* Customer */}
            <div>
                <label className="mb-1 block text-[11px] font-semibold text-navy-500">العميل</label>
                <select
                    className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    value={target.customer_id}
                    onChange={(e) => {
                        const cid = e.target.value
                        const name = customers.find((c) => String(c.id) === cid)?.name ?? ''
                        onChange({ ...target, customer_id: cid, branch_id: '', label: name })
                    }}
                >
                    <option value="">— اختر العميل —</option>
                    {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}{c.company ? ` — ${c.company}` : ''}
                        </option>
                    ))}
                </select>
            </div>

            {/* Branch */}
            <div>
                <label className="mb-1 block text-[11px] font-semibold text-navy-500">الفرع / الموقع</label>
                <select
                    className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                    value={target.branch_id}
                    disabled={!target.customer_id || branches.length === 0}
                    onChange={(e) => {
                        const bid = e.target.value
                        const bname = branches.find((b) => String(b.id) === bid)?.name ?? ''
                        const cname = customers.find((c) => String(c.id) === target.customer_id)?.name ?? ''
                        onChange({ ...target, branch_id: bid, label: bname ? `${cname} — ${bname}` : cname })
                    }}
                >
                    <option value="">— كل الحساب —</option>
                    {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.name}{(b as any).city ? ` — ${(b as any).city}` : ''}
                        </option>
                    ))}
                </select>
            </div>

            {/* Remove */}
            <button
                type="button"
                onClick={onRemove}
                className="mt-5 grid size-9 place-items-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
                aria-label="حذف"
            >
                <Trash2 className="size-4" />
            </button>
        </div>
    )
}

/* ── BulkTaskForm ────────────────────────────────────────────── */

let targetCounter = 0
function newTarget(): Target {
    return { id: String(++targetCounter), customer_id: '', branch_id: '', label: '' }
}

export function BulkTaskForm() {
    const navigate = useNavigate()
    const toast = useToast()
    const { path } = useArea()

    const { data: customers } = useCustomers({ per_page: 200, active_only: 1 })
    const { data: technicians } = useTechnicians()
    const bulk = useBulkCreateTasks()

    const [assignedTo, setAssignedTo] = useState<string[]>([])
    const [form, setForm] = useState({
        title: '',
        description: '',
        type: 'maintenance' as TaskType,
        priority: 'normal' as TaskPriority,
        scheduled_at: '',
    })
    const [targets, setTargets] = useState<Target[]>([newTarget()])
    const [result, setResult] = useState<{ count: number; message: string } | null>(null)

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((f) => ({ ...f, [key]: value }))

    const addTarget = () => setTargets((t) => [...t, newTarget()])
    const removeTarget = (id: string) => setTargets((t) => t.filter((r) => r.id !== id))
    const updateTarget = (id: string, updated: Target) =>
        setTargets((t) => t.map((r) => (r.id === id ? updated : r)))

    const customerList = customers?.data ?? []

    const validTargets = targets.filter((t) => t.customer_id)

    const handleSubmit = async () => {
        if (!form.title.trim()) {
            toast.info('اكتب عنوان المهمة.')
            return
        }
        if (validTargets.length === 0) {
            toast.info('أضف عميلاً واحداً على الأقل.')
            return
        }

        try {
            const res = await bulk.mutateAsync({
                assigned_to: assignedTo.map(Number),
                title: form.title,
                description: form.description || null,
                type: form.type,
                priority: form.priority,
                scheduled_at: form.scheduled_at || null,
                targets: validTargets.map((t) => ({
                    customer_id: Number(t.customer_id),
                    branch_id: t.branch_id ? Number(t.branch_id) : null,
                    label: t.label,
                })),
            })
            setResult(res)
        } catch (err) {
            toast.error(errorMessage(err, 'تعذّر إنشاء المهام.'))
        }
    }

    /* ── Success screen ─────────────────────────────── */
    if (result) {
        return (
            <div className="mx-auto max-w-lg py-12 text-center">
                <div className="card p-8">
                    <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <CheckCheck className="size-8" />
                    </div>
                    <h2 className="text-xl font-extrabold text-navy-900">تم إنشاء {result.count} مهمة!</h2>
                    <p className="mt-1 text-sm text-navy-400">{result.message}</p>

                    <div className="mt-8 flex flex-col gap-3">
                        <Button block onClick={() => navigate(path('/tasks'))}>
                            {tr('عرض قائمة المهام')}
                        </Button>
                        <Button
                            variant="secondary"
                            block
                            onClick={() => {
                                setResult(null)
                                setTargets([newTarget()])
                            }}
                        >
                            <Plus className="size-4" />
                            {tr('إنشاء دفعة جديدة')}
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <button onClick={() => navigate(-1)} className="btn-ghost -mr-2 mb-3 text-sm">
                <ArrowRight className="size-4" />
                {tr('رجوع')}
            </button>

            <PageHeader
                title="إنشاء مهام متعددة دفعةً واحدة"
                subtitle="نفس النوع والفني — عملاء وفروع مختلفة"
            />

            <div className="space-y-5">
                {/* ── Job fields ───────────────────────────────── */}
                <section className="card p-5">
                    <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-navy-800">
                        <Layers className="size-4 text-navy-400" />
                        تفاصيل المهمة (مشتركة لكل الفروع)
                    </h2>

                    <div className="space-y-4">
                        <Field label="عنوان المهمة" required>
                            <Input
                                value={form.title}
                                onChange={(e) => set('title')(e.target.value)}
                                placeholder="مثال: صيانة دورية — شهر أغسطس"
                            />
                        </Field>

                        <Field label="الوصف">
                            <Textarea
                                value={form.description}
                                onChange={(e) => set('description')(e.target.value)}
                                placeholder="تفاصيل إضافية للفني…"
                                rows={2}
                            />
                        </Field>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="النوع" required>
                                <Select value={form.type} onChange={(e) => set('type')(e.target.value)}>
                                    {Object.entries(TASK_TYPE).map(([v, m]) => (
                                        <option key={v} value={v}>{m.label}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="الأولوية" required>
                                <Select value={form.priority} onChange={(e) => set('priority')(e.target.value)}>
                                    {Object.entries(PRIORITY).map(([v, m]) => (
                                        <option key={v} value={v}>{m.label}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="الموعد">
                                <Input
                                    type="datetime-local"
                                    value={form.scheduled_at}
                                    onChange={(e) => set('scheduled_at')(e.target.value)}
                                    dir="ltr"
                                />
                            </Field>
                        </div>
                    </div>
                </section>

                {/* ── Assignment ───────────────────────────────── */}
                <section className="card p-5">
                    <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-navy-800">
                        <Users className="size-4 text-navy-400" />
                        الفني / الفنيون المسندون (نفسهم لجميع الفروع)
                    </h2>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {technicians?.map((tech) => (
                            <label
                                key={tech.id}
                                className={clsx(
                                    'flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-colors',
                                    assignedTo.includes(String(tech.id))
                                        ? 'border-brand-500 bg-brand-50'
                                        : 'border-navy-200 hover:bg-navy-50',
                                )}
                            >
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-navy-300 text-brand-600 focus:ring-brand-600"
                                    checked={assignedTo.includes(String(tech.id))}
                                    onChange={(e) => {
                                        const id = String(tech.id)
                                        if (e.target.checked) {
                                            setAssignedTo((s) => [...s, id])
                                        } else {
                                            setAssignedTo((s) => s.filter((x) => x !== id))
                                        }
                                    }}
                                />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-navy-800">{tech.name}</p>
                                    <p className="text-[10px] text-navy-400">{tech.open_tasks_count ?? 0} مهمة مفتوحة</p>
                                </div>
                            </label>
                        ))}
                        {!technicians?.length && (
                            <p className="col-span-full text-sm text-navy-400">لا يوجد فنيون متاحون</p>
                        )}
                    </div>
                </section>

                {/* ── Targets (customer + branch rows) ─────────── */}
                <section className="card p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-navy-800">
                            العملاء والفروع
                            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                                {validTargets.length} موقع
                            </span>
                        </h2>
                        <Button variant="secondary" icon={Plus} onClick={addTarget}>
                            {tr('إضافة موقع')}
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {targets.map((target) => (
                            <CustomerBranchRow
                                key={target.id}
                                target={target}
                                customers={customerList}
                                onChange={(updated) => updateTarget(target.id, updated)}
                                onRemove={() => removeTarget(target.id)}
                            />
                        ))}
                    </div>

                    {targets.length === 0 && (
                        <button
                            type="button"
                            onClick={addTarget}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-200 py-5 text-sm text-navy-400 hover:border-brand-400 hover:text-brand-600"
                        >
                            <Plus className="size-4" />
                            إضافة موقع
                        </button>
                    )}
                </section>

                {/* ── Summary bar ──────────────────────────────── */}
                <div className="sticky bottom-4 rounded-2xl border border-navy-200 bg-white/90 p-4 shadow-lg backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-bold text-navy-900">
                                سيتم إنشاء <span className="text-brand-600">{validTargets.length}</span> مهمة
                            </p>
                            {assignedTo.length > 0 && (
                                <p className="mt-0.5 text-xs text-navy-400">
                                    للفني: {technicians
                                        ?.filter((t) => assignedTo.includes(String(t.id)))
                                        .map((t) => t.name)
                                        .join(' و ')}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => navigate(-1)} disabled={bulk.isPending}>
                                {tr('إلغاء')}
                            </Button>
                            <Button
                                icon={Save}
                                loading={bulk.isPending}
                                onClick={handleSubmit}
                                disabled={validTargets.length === 0}
                            >
                                إنشاء {validTargets.length > 1 ? `${validTargets.length} مهام` : 'المهمة'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

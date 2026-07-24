import clsx from 'clsx'
import { CalendarCheck, Clock, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatDate } from '@/lib/format'
import {
    useAttendance,
    useAttendanceSummary,
    useDeleteAttendance,
    useEmployees,
    useSaveAttendance,
} from '@/lib/queries'
import type { Attendance, AttendanceStatus } from '@/types'

const STATUS: Record<AttendanceStatus, { label: string; chip: string }> = {
    present: { label: 'حاضر', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    late: { label: 'متأخر', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    absent: { label: 'غائب', chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    leave: { label: 'إجازة', chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
    holiday: { label: 'عطلة', chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

const now = new Date()

export function AttendanceTab() {
    // `YYYY-MM`, the value an <input type="month"> speaks.
    const [period, setPeriod] = useState(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    )
    const [view, setView] = useState<'summary' | 'log'>('summary')
    const [recording, setRecording] = useState(false)

    const [year, month] = period.split('-').map(Number)
    const filters = { year, month }

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <input
                    type="month"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value)}
                    className="rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm font-bold text-navy-800"
                />
                <Button icon={Plus} onClick={() => setRecording(true)}>
                    تسجيل حضور
                </Button>
            </div>

            <div className="mb-4 flex gap-1 rounded-xl bg-navy-100 p-1">
                {(
                    [
                        ['summary', 'الملخص الشهري'],
                        ['log', 'سجل الحضور'],
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => setView(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                            view === value ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {view === 'summary' ? (
                <SummaryView filters={filters} />
            ) : (
                <LogView filters={filters} />
            )}

            {recording && (
                <RecordDialog defaultDate={`${period}-01`} onClose={() => setRecording(false)} />
            )}

            {view === 'log' && (
                <p className="mt-4 text-center text-[11px] text-navy-400">
                    اضغط على أي يوم لتعديله، والتسجيل على نفس اليوم يصحّح ولا يكرّر.
                </p>
            )}
        </>
    )
}

/* ── Monthly summary ─────────────────────────────────────── */

function SummaryView({ filters }: { filters: { year: number; month: number } }) {
    const { data, isLoading } = useAttendanceSummary(filters)

    if (isLoading) return <SkeletonCard />
    if (!data?.data.length) {
        return (
            <EmptyState
                icon={CalendarCheck}
                title="لا يوجد حضور مسجّل هذا الشهر"
                description="سجّل حضور الموظفين ليظهر الملخص هنا."
            />
        )
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-navy-100">
            <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-navy-50 text-[11px] font-bold text-navy-400">
                    <tr>
                        <th className="px-3 py-2 text-right">الموظف</th>
                        <th className="w-16 px-2 py-2 text-center">حاضر</th>
                        <th className="w-16 px-2 py-2 text-center">متأخر</th>
                        <th className="w-16 px-2 py-2 text-center">غائب</th>
                        <th className="w-16 px-2 py-2 text-center">إجازة</th>
                        <th className="w-20 px-2 py-2 text-center">دقائق تأخير</th>
                        <th className="w-20 px-2 py-2 text-left">ساعات العمل</th>
                    </tr>
                </thead>
                <tbody>
                    {data.data.map((row) => (
                        <tr key={row.employee_id} className="border-t border-navy-100">
                            <td className="px-3 py-2.5">
                                <p className="font-bold text-navy-900">{row.employee}</p>
                                {row.department && (
                                    <p className="text-[11px] text-navy-400">{row.department}</p>
                                )}
                            </td>
                            <td className="tabular px-2 py-2.5 text-center font-bold text-emerald-600">
                                {row.present_days}
                            </td>
                            <td className="tabular px-2 py-2.5 text-center font-bold text-amber-600">
                                {row.late_days}
                            </td>
                            <td className="tabular px-2 py-2.5 text-center font-bold text-red-600">
                                {row.absent_days}
                            </td>
                            <td className="tabular px-2 py-2.5 text-center text-sky-600">
                                {row.leave_days}
                            </td>
                            <td className="tabular px-2 py-2.5 text-center text-navy-500">
                                {row.late_minutes}
                            </td>
                            <td className="tabular px-2 py-2.5 text-left font-extrabold text-navy-900">
                                {row.worked_hours}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

/* ── The day-by-day log ──────────────────────────────────── */

function LogView({ filters }: { filters: { year: number; month: number } }) {
    const { data, isLoading } = useAttendance(filters)
    const [editing, setEditing] = useState<Attendance | null>(null)

    if (isLoading) return <SkeletonCard />
    if (!data?.data.length) {
        return <EmptyState icon={Clock} title="لا توجد سجلات هذا الشهر" />
    }

    return (
        <>
            <div className="space-y-2">
                {data.data.map((record) => {
                    const meta = STATUS[record.status]

                    return (
                        <button
                            key={record.id}
                            onClick={() => setEditing(record)}
                            className="card-interactive block w-full p-3.5 text-right"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-navy-900">{record.employee}</span>
                                        <span className={clsx('badge', meta.chip)}>{meta.label}</span>
                                    </div>
                                    <p className="tabular mt-0.5 text-[11px] text-navy-400">
                                        {formatDate(record.date)}
                                        {record.check_in && ` · ${record.check_in}`}
                                        {record.check_out && ` — ${record.check_out}`}
                                        {record.late_minutes > 0 && ` · تأخير ${record.late_minutes}د`}
                                    </p>
                                </div>
                                {record.worked_hours > 0 && (
                                    <span className="tabular shrink-0 text-sm font-bold text-navy-700">
                                        {record.worked_hours} س
                                    </span>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>

            {editing && (
                <RecordDialog
                    defaultDate={editing.date}
                    existing={editing}
                    onClose={() => setEditing(null)}
                />
            )}
        </>
    )
}

/* ── Record / correct a day ──────────────────────────────── */

function RecordDialog({
    defaultDate,
    existing,
    onClose,
}: {
    defaultDate: string
    existing?: Attendance
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveAttendance()
    const remove = useDeleteAttendance()
    const { data: employees } = useEmployees({ active: 1, per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        employee_id: existing ? String(existing.employee_id) : '',
        date: existing?.date ?? defaultDate,
        status: (existing?.status ?? 'present') as AttendanceStatus,
        check_in: existing?.check_in ?? '',
        check_out: existing?.check_out ?? '',
        late_minutes: existing ? String(existing.late_minutes) : '',
        note: existing?.note ?? '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const worked = !['absent', 'leave', 'holiday'].includes(form.status)

    return (
        <Modal
            open
            onClose={onClose}
            title={existing ? `تعديل حضور — ${existing.employee}` : 'تسجيل حضور'}
            size="sm"
            footer={
                <div className="flex w-full items-center justify-between gap-2">
                    {existing ? (
                        <Button
                            variant="secondary"
                            icon={Trash2}
                            className="text-red-600"
                            disabled={remove.isPending}
                            onClick={async () => {
                                try {
                                    await remove.mutateAsync(existing.id)
                                    toast.success('تم حذف السجل.')
                                    onClose()
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                                }
                            }}
                        >
                            حذف
                        </Button>
                    ) : (
                        <span />
                    )}

                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                            إلغاء
                        </Button>
                        <Button
                            loading={save.isPending}
                            onClick={async () => {
                                setErrors({})
                                try {
                                    await save.mutateAsync({
                                        employee_id: Number(form.employee_id),
                                        date: form.date,
                                        status: form.status,
                                        check_in: worked && form.check_in ? form.check_in : null,
                                        check_out: worked && form.check_out ? form.check_out : null,
                                        late_minutes: form.late_minutes ? Number(form.late_minutes) : 0,
                                        note: form.note || null,
                                    })
                                    toast.success('تم تسجيل الحضور.')
                                    onClose()
                                } catch (caught) {
                                    setErrors(fieldErrors(caught))
                                    toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                                }
                            }}
                        >
                            حفظ
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-4">
                <Field label="الموظف" required error={errors.employee_id}>
                    <Select
                        value={form.employee_id}
                        onChange={(e) => set('employee_id')(e.target.value)}
                        disabled={Boolean(existing)}
                    >
                        <option value="">— اختر —</option>
                        {employees?.data.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                                {employee.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="التاريخ" required error={errors.date}>
                        <Input type="date" value={form.date} onChange={(e) => set('date')(e.target.value)} />
                    </Field>
                    <Field label="الحالة" required error={errors.status}>
                        <Select value={form.status} onChange={(e) => set('status')(e.target.value)}>
                            <option value="present">حاضر</option>
                            <option value="late">متأخر</option>
                            <option value="absent">غائب</option>
                            <option value="leave">إجازة</option>
                            <option value="holiday">عطلة</option>
                        </Select>
                    </Field>
                </div>

                {worked && (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="حضور" error={errors.check_in}>
                            <Input
                                type="time"
                                value={form.check_in}
                                onChange={(e) => set('check_in')(e.target.value)}
                            />
                        </Field>
                        <Field label="انصراف" error={errors.check_out}>
                            <Input
                                type="time"
                                value={form.check_out}
                                onChange={(e) => set('check_out')(e.target.value)}
                            />
                        </Field>
                        <Field label="تأخير (د)" error={errors.late_minutes}>
                            <Input
                                type="number"
                                min={0}
                                value={form.late_minutes}
                                onChange={(e) => set('late_minutes')(e.target.value)}
                            />
                        </Field>
                    </div>
                )}

                <Field label="ملاحظة" error={errors.note}>
                    <Textarea value={form.note} onChange={(e) => set('note')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

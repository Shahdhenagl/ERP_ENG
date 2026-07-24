import clsx from 'clsx'
import { MessageSquare, Plus, Smile, Star } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, PageHeader, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import {
    useCreateSurvey,
    useRespondSurvey,
    useSatisfaction,
    useSatisfactionCandidates,
    useSatisfactionSummary,
} from '@/lib/queries'
import type { SatisfactionSurvey } from '@/types'

type Filter = '' | 'pending' | 'responded'

export function SatisfactionPage() {
    const [filter, setFilter] = useState<Filter>('')
    const { data, isLoading } = useSatisfaction(filter ? { status: filter } : {})
    const { data: summary } = useSatisfactionSummary()
    const [creating, setCreating] = useState(false)
    const [responding, setResponding] = useState<SatisfactionSurvey | null>(null)

    const maxBar = summary ? Math.max(1, ...Object.values(summary.distribution)) : 1

    return (
        <>
            <PageHeader
                title="رضا العملاء"
                subtitle="تقييم العملاء لأوامر العمل المنتهية"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        استطلاع جديد
                    </Button>
                }
            />

            {summary && (
                <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                    <div className="grid grid-cols-3 gap-3">
                        <Stat
                            label="متوسط الرضا"
                            value={summary.average !== null ? summary.average.toFixed(1) : '—'}
                            accent
                        />
                        <Stat label="عدد الردود" value={String(summary.responses)} />
                        <Stat
                            label="نسبة الرد"
                            value={summary.response_rate !== null ? `${summary.response_rate}%` : '—'}
                        />
                    </div>

                    <div className="card p-4">
                        <p className="mb-2 text-[11px] font-bold text-navy-400">توزيع التقييمات</p>
                        <div className="space-y-1.5">
                            {[5, 4, 3, 2, 1].map((star) => {
                                const count = summary.distribution[String(star)] ?? 0
                                return (
                                    <div key={star} className="flex items-center gap-2">
                                        <span className="tabular flex w-8 items-center gap-0.5 text-[11px] font-bold text-navy-500">
                                            {star}
                                            <Star className="size-3 fill-amber-400 text-amber-400" />
                                        </span>
                                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-100">
                                            <div
                                                className="h-full rounded-full bg-amber-400"
                                                style={{ width: `${(count / maxBar) * 100}%` }}
                                            />
                                        </div>
                                        <span className="tabular w-6 text-left text-[11px] text-navy-400">
                                            {count}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-4 flex gap-1 rounded-xl bg-navy-100 p-1">
                {(
                    [
                        ['', 'الكل'],
                        ['pending', `بانتظار الرد${data?.meta.pending ? ` (${data.meta.pending})` : ''}`],
                        ['responded', 'تم التقييم'],
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold transition',
                            filter === value ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Smile}
                    title="لا توجد استطلاعات"
                    description="افتح استطلاعًا لأمر عمل منتهٍ لتسجيل رأي العميل في الخدمة."
                />
            ) : (
                <div className="space-y-2">
                    {data.data.map((survey) => (
                        <div key={survey.id} className="card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {survey.task_code}
                                        </span>
                                        {survey.status === 'responded' ? (
                                            <Stars value={survey.rating ?? 0} />
                                        ) : (
                                            <span className="badge bg-amber-50 text-amber-700">
                                                بانتظار الرد
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 truncate font-bold text-navy-900">
                                        {survey.customer ?? '—'}
                                    </p>
                                    {survey.comment && (
                                        <p className="mt-1 flex items-start gap-1 text-xs text-navy-500">
                                            <MessageSquare className="mt-0.5 size-3 shrink-0" />
                                            {survey.comment}
                                        </p>
                                    )}
                                    {survey.task_title && (
                                        <p className="text-[11px] text-navy-400">{survey.task_title}</p>
                                    )}
                                </div>

                                {survey.status === 'pending' && (
                                    <button
                                        onClick={() => setResponding(survey)}
                                        className="tap shrink-0 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700"
                                    >
                                        تسجيل التقييم
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {creating && <NewSurveyDialog onClose={() => setCreating(false)} />}
            {responding && (
                <RespondDialog survey={responding} onClose={() => setResponding(null)} />
            )}
        </>
    )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="card p-3 text-center">
            <p className="text-[10px] font-bold text-navy-400">{label}</p>
            <p className={clsx('tabular mt-0.5 text-lg font-extrabold', accent ? 'text-amber-500' : 'text-navy-900')}>
                {value}
            </p>
        </div>
    )
}

function Stars({ value }: { value: number }) {
    return (
        <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    className={clsx(
                        'size-3.5',
                        star <= value ? 'fill-amber-400 text-amber-400' : 'text-navy-200',
                    )}
                />
            ))}
        </span>
    )
}

/** A clickable 1–5 picker. */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange(star)}
                    className="tap p-1"
                    aria-label={`${star} نجوم`}
                >
                    <Star
                        className={clsx(
                            'size-7 transition',
                            star <= value ? 'fill-amber-400 text-amber-400' : 'text-navy-200',
                        )}
                    />
                </button>
            ))}
        </div>
    )
}

function RespondDialog({ survey, onClose }: { survey: SatisfactionSurvey; onClose: () => void }) {
    const toast = useToast()
    const respond = useRespondSurvey()
    const [rating, setRating] = useState(survey.rating ?? 0)
    const [comment, setComment] = useState(survey.comment ?? '')

    return (
        <Modal
            open
            onClose={onClose}
            title={`تقييم أمر العمل ${survey.task_code}`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={respond.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={respond.isPending}
                        disabled={!rating}
                        onClick={async () => {
                            try {
                                await respond.mutateAsync({ id: survey.id, rating, comment: comment || undefined })
                                toast.success('تم تسجيل التقييم.')
                                onClose()
                            } catch (caught) {
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
                <Field label="التقييم" required>
                    <StarPicker value={rating} onChange={setRating} />
                </Field>
                <Field label="تعليق العميل">
                    <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

function NewSurveyDialog({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const create = useCreateSurvey()
    const { data: candidates } = useSatisfactionCandidates()
    const [taskId, setTaskId] = useState('')
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title="استطلاع رضا جديد"
            description="اختر أمر عمل منتهيًا لم يُقيَّم بعد."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={create.isPending}
                        disabled={!taskId}
                        onClick={async () => {
                            try {
                                await create.mutateAsync({
                                    task_id: Number(taskId),
                                    rating: rating || undefined,
                                    comment: comment || undefined,
                                })
                                toast.success(rating ? 'تم تسجيل التقييم.' : 'تم فتح الاستطلاع.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر الإنشاء.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="أمر العمل" required>
                    <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                        <option value="">— اختر —</option>
                        {candidates?.map((task) => (
                            <option key={task.id} value={task.id}>
                                {task.code} — {task.customer ?? '—'}
                                {task.completed_at ? ` · ${formatDate(task.completed_at)}` : ''}
                            </option>
                        ))}
                    </Select>
                    {candidates && !candidates.length && (
                        <p className="mt-1 text-[11px] text-navy-400">
                            لا توجد أوامر عمل منتهية بلا استطلاع حاليًا.
                        </p>
                    )}
                </Field>

                <Field label="التقييم (اختياري الآن)">
                    <StarPicker value={rating} onChange={setRating} />
                </Field>
                <Field label="تعليق">
                    <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

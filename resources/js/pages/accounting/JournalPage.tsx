import clsx from 'clsx'
import { Plus, ScrollText, Trash2, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
    Button,
    EmptyState,
    Field,
    Input,
    Select,
    SkeletonCard,
    Textarea,
} from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useAccounts, useEntryAction, useJournalEntries, usePostEntry } from '@/lib/queries'
import { useAccounting } from '@/pages/accounting/AccountingLayout'
import type { JournalEntry } from '@/types'

/**
 * The journal, newest first, with every entry openable to its two sides.
 *
 * Almost everything here was written by a document — an invoice issued, money
 * moved, stock consumed — and reads as evidence of that. The one exception is
 * the hand-written entry, which is why it is the only thing this screen can
 * create, and why it is marked as such wherever it appears.
 */

const SOURCES: Array<[string, string]> = [
    ['', 'كل المصادر'],
    ['manual', 'قيد يدوي'],
    ['invoice', 'فاتورة مبيعات'],
    ['payment', 'سند قبض'],
    ['expense', 'مصروف'],
    ['supplier_payment', 'سند صرف لمورد'],
    ['transfer', 'تحويل بين الخزائن'],
    ['custody', 'عهدة موظف'],
    ['stock', 'حركة مخزون'],
]

export function JournalPage() {
    const { period } = useAccounting()
    const { user } = useAuth()
    const [source, setSource] = useState('')
    const [search, setSearch] = useState('')
    const [open, setOpen] = useState<JournalEntry | null>(null)
    const [composing, setComposing] = useState(false)

    const { data, isLoading } = useJournalEntries({
        ...period.range,
        source,
        search,
        per_page: 40,
    })

    return (
        <>
            <div className="mb-4 flex flex-wrap items-end gap-2">
                <Field label="بحث" className="min-w-40 flex-1">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="رقم القيد أو البيان"
                    />
                </Field>

                <Field label="المصدر" className="min-w-40">
                    <Select value={source} onChange={(e) => setSource(e.target.value)}>
                        {SOURCES.map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </Select>
                </Field>

                {user?.role === 'admin' && (
                    <Button icon={Plus} className="mb-0.5" onClick={() => setComposing(true)}>
                        قيد يدوي
                    </Button>
                )}
            </div>

            {isLoading && !data ? (
                <SkeletonCard />
            ) : !data?.data.length ? (
                <EmptyState icon={ScrollText} title="لا توجد قيود في هذه الفترة" />
            ) : (
                <div className="space-y-2">
                    {data.data.map((entry) => (
                        <button
                            key={entry.id}
                            onClick={() => setOpen(entry)}
                            className="card-interactive w-full p-3.5 text-right"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span
                                            className={clsx(
                                                'badge',
                                                entry.is_manual
                                                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                                                    : 'bg-navy-100 text-navy-600',
                                            )}
                                        >
                                            {entry.source_label}
                                        </span>
                                        {entry.reverses && (
                                            <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                                                عكس {entry.reverses}
                                            </span>
                                        )}
                                        {entry.is_void && (
                                            <span className="badge bg-red-50 text-red-700 ring-1 ring-red-200">
                                                ملغى
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-1 truncate text-sm font-bold text-navy-900">
                                        {entry.memo ?? entry.code}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {entry.code}
                                        {entry.entry_date && ` · ${formatDate(entry.entry_date)}`}
                                        {entry.created_by && ` · ${entry.created_by}`}
                                    </p>
                                </div>

                                <p className="tabular shrink-0 font-extrabold text-navy-900">
                                    {formatMoney(entry.total)}
                                </p>
                            </div>
                        </button>
                    ))}

                    {data.meta.total > data.data.length && (
                        <p className="pt-2 text-center text-xs text-navy-400">
                            يُعرض {data.data.length} من {data.meta.total} قيد — ضيّق الفترة أو
                            المصدر لرؤية الباقي.
                        </p>
                    )}
                </div>
            )}

            {open && <EntryDialog entry={open} onClose={() => setOpen(null)} />}
            {composing && <ComposeDialog onClose={() => setComposing(false)} />}
        </>
    )
}

/* ── One entry, both sides ───────────────────────────────── */

function EntryDialog({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
    const toast = useToast()
    const { user } = useAuth()
    const action = useEntryAction()
    const isAdmin = user?.role === 'admin'

    const run = async (which: 'reverse' | 'void') => {
        try {
            await action.mutateAsync({ id: entry.id, action: which })
            toast.success(which === 'void' ? 'تم إلغاء القيد.' : 'تم عكس القيد.')
            onClose()
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={entry.code}
            description={entry.memo ?? undefined}
            size="lg"
            footer={
                isAdmin && !entry.is_void ? (
                    <>
                        {/* A document's entry is undone by its mirror; only a
                            hand-written one may simply be struck out. */}
                        {entry.is_manual && (
                            <Button
                                variant="ghost"
                                icon={Trash2}
                                className="ml-auto text-red-600"
                                loading={action.isPending}
                                onClick={() => run('void')}
                            >
                                إلغاء القيد
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            icon={Undo2}
                            loading={action.isPending}
                            onClick={() => run('reverse')}
                        >
                            عكس القيد
                        </Button>
                        <Button onClick={onClose}>إغلاق</Button>
                    </>
                ) : (
                    <Button onClick={onClose}>إغلاق</Button>
                )
            }
        >
            <div className="space-y-4">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-navy-500">
                    <span>
                        التاريخ:{' '}
                        <span className="tabular font-bold text-navy-800">
                            {entry.entry_date ? formatDate(entry.entry_date) : '—'}
                        </span>
                    </span>
                    <span>
                        المصدر: <span className="font-bold text-navy-800">{entry.source_label}</span>
                    </span>
                    {entry.created_by && (
                        <span>
                            بواسطة: <span className="font-bold text-navy-800">{entry.created_by}</span>
                        </span>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="doc-table">
                        <thead>
                            <tr>
                                <th className="w-20">الحساب</th>
                                <th>البيان</th>
                                <th className="w-28 text-left">مدين</th>
                                <th className="w-28 text-left">دائن</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entry.lines.map((line) => (
                                <tr key={line.id}>
                                    <td className="tabular text-navy-500">{line.account_code}</td>
                                    <td>
                                        <span className="font-semibold text-navy-800">
                                            {line.account_name}
                                        </span>
                                        {(line.memo || line.cost_center) && (
                                            <span className="block text-[11px] text-navy-400">
                                                {[line.memo, line.cost_center]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </span>
                                        )}
                                    </td>
                                    <td className="tabular text-left font-semibold text-navy-900">
                                        {line.debit > 0 ? formatMoney(line.debit) : '—'}
                                    </td>
                                    <td className="tabular text-left font-semibold text-navy-900">
                                        {line.credit > 0 ? formatMoney(line.credit) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="font-extrabold">
                                <td colSpan={2}>الإجمالي</td>
                                <td className="tabular text-left">{formatMoney(entry.total)}</td>
                                <td className="tabular text-left">{formatMoney(entry.total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </Modal>
    )
}

/* ── Writing one by hand ─────────────────────────────────── */

interface DraftLine {
    account_id: string
    debit: string
    credit: string
    memo: string
}

const BLANK: DraftLine = { account_id: '', debit: '', credit: '', memo: '' }

function ComposeDialog({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const post = usePostEntry()
    const { data: accounts } = useAccounts()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [memo, setMemo] = useState('')
    const [lines, setLines] = useState<DraftLine[]>([{ ...BLANK }, { ...BLANK }])

    const postable = (accounts ?? []).filter((a) => !a.is_group && a.is_active)

    const debit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0)
    const credit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0)
    // A cent of tolerance, the same as the ledger allows.
    const balanced = Math.abs(debit - credit) < 0.005 && debit > 0

    const update = (index: number, patch: Partial<DraftLine>) =>
        setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))

    return (
        <Modal
            open
            onClose={onClose}
            title="قيد يدوي"
            description="القيد الوحيد الذي لا يقف خلفه مستند — فاذكر سببه."
            size="xl"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={post.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={post.isPending}
                        disabled={!balanced}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await post.mutateAsync({
                                    entry_date: date,
                                    memo: memo || null,
                                    lines: lines
                                        .filter((line) => line.account_id)
                                        .map((line) => ({
                                            account_id: Number(line.account_id),
                                            debit: Number(line.debit) || 0,
                                            credit: Number(line.credit) || 0,
                                            memo: line.memo || null,
                                        })),
                                })
                                toast.success('تم ترحيل القيد.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر ترحيل القيد.'))
                            }
                        }}
                    >
                        ترحيل
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="التاريخ" required error={errors.entry_date}>
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </Field>
                    <Field label="البيان" className="sm:col-span-2" error={errors.memo}>
                        <Textarea
                            rows={1}
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                            placeholder="تسوية رصيد افتتاحي"
                        />
                    </Field>
                </div>

                {errors.lines && (
                    <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
                        {errors.lines}
                    </p>
                )}

                <div className="space-y-2">
                    {lines.map((line, index) => (
                        <div
                            key={index}
                            className="grid grid-cols-2 gap-2 rounded-xl bg-navy-50 p-3 sm:grid-cols-12"
                        >
                            <div className="col-span-2 sm:col-span-5">
                                <Select
                                    value={line.account_id}
                                    onChange={(e) => update(index, { account_id: e.target.value })}
                                >
                                    <option value="">— اختر الحساب —</option>
                                    {postable.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {account.code} · {account.name}
                                        </option>
                                    ))}
                                </Select>
                            </div>

                            <div className="sm:col-span-2">
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="مدين"
                                    value={line.debit}
                                    // One side or the other, never both: the net
                                    // is what was meant, so say the net.
                                    onChange={(e) =>
                                        update(index, { debit: e.target.value, credit: '' })
                                    }
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="دائن"
                                    value={line.credit}
                                    onChange={(e) =>
                                        update(index, { credit: e.target.value, debit: '' })
                                    }
                                />
                            </div>

                            <div className="col-span-2 sm:col-span-2">
                                <Input
                                    placeholder="بيان السطر"
                                    value={line.memo}
                                    onChange={(e) => update(index, { memo: e.target.value })}
                                />
                            </div>

                            <div className="flex items-center justify-end sm:col-span-1">
                                {lines.length > 2 && (
                                    <button
                                        onClick={() =>
                                            setLines(lines.filter((_, i) => i !== index))
                                        }
                                        className="tap rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف السطر"
                                    >
                                        <X className="size-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => setLines([...lines, { ...BLANK }])}
                >
                    سطر آخر
                </Button>

                {/* Stated as it is typed rather than discovered on submit: an
                    entry that does not balance is not a thing to be told about
                    afterwards. */}
                <div
                    className={clsx(
                        'flex items-center justify-between rounded-xl p-3 text-sm font-bold',
                        balanced
                            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
                    )}
                >
                    <span>{balanced ? 'القيد متوازن' : 'القيد غير متوازن'}</span>
                    <span className="tabular">
                        مدين {formatMoney(debit)} · دائن {formatMoney(credit)}
                    </span>
                </div>
            </div>
        </Modal>
    )
}

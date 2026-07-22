import clsx from 'clsx'
import { CalendarClock, Pencil, Plus, ScrollText, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContractForm } from '@/components/ContractForm'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { SectionTabs } from '@/components/SectionTabs'
import { Button, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { DEVICE_SECTIONS } from '@/lib/sections'
import { errorMessage } from '@/lib/api'
import { CONTRACT_STATUS, expiryChip } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useContracts, useDeleteContract } from '@/lib/queries'
import type { Contract } from '@/types'

export function ContractList() {
    const toast = useToast()
    const { path } = useArea()

    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [expiringOnly, setExpiringOnly] = useState(false)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<Contract | undefined>()
    const [deleting, setDeleting] = useState<Contract | undefined>()

    const { data, isLoading, isError, refetch } = useContracts({
        search,
        status: status || undefined,
        expiring: expiringOnly ? 1 : undefined,
        per_page: 40,
    })
    const remove = useDeleteContract()

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    const openNew = () => {
        setEditing(undefined)
        setFormOpen(true)
    }

    const handleDelete = async () => {
        if (!deleting) return

        try {
            await remove.mutateAsync(deleting.id)
            toast.success('تم حذف العقد.')
            setDeleting(undefined)
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر حذف العقد.'))
        }
    }

    return (
        <>
            <PageHeader
                title="عقود الصيانة"
                subtitle={data ? `${data.meta.total} عقد` : undefined}
                actions={
                    <Button icon={Plus} onClick={openNew}>
                        عقد جديد
                    </Button>
                }
            />

            <SectionTabs sections={DEVICE_SECTIONS} />

            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={search}
                        onChange={(event) => debounced(event.target.value)}
                        placeholder="ابحث برقم العقد أو اسم العميل…"
                        className="pr-10"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="w-auto"
                    >
                        <option value="">كل الحالات</option>
                        <option value="draft">مسودة</option>
                        <option value="active">ساري</option>
                        <option value="cancelled">ملغي</option>
                    </Select>

                    <button
                        onClick={() => setExpiringOnly((current) => !current)}
                        className={clsx(
                            'tap flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ring-1 transition',
                            expiringOnly
                                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                        )}
                    >
                        <CalendarClock className="size-3.5" />
                        ينتهي خلال شهرين
                    </button>
                </div>
            </div>

            {isError ? (
                <ErrorState message="تعذّر تحميل العقود." onRetry={() => void refetch()} />
            ) : isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonCard key={index} />
                    ))}
                </div>
            ) : !data?.data.length ? (
                <EmptyState
                    icon={ScrollText}
                    title="لا توجد عقود"
                    description="أنشئ عقد صيانة ليتولّى النظام جدولة الزيارات الدورية بدلًا من تتبّعها يدويًا."
                    action={
                        <Button icon={Plus} onClick={openNew}>
                            إنشاء عقد
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {data.data.map((contract) => (
                        <div key={contract.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <Link to={path(`/contracts/${contract.id}`)} className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {contract.code}
                                        </span>
                                        <span
                                            className={clsx(
                                                'badge',
                                                CONTRACT_STATUS[contract.effective_status].chip,
                                            )}
                                        >
                                            {contract.effective_status_label}
                                        </span>
                                        {contract.effective_status === 'active' && (
                                            <span className={clsx('badge', expiryChip(contract.days_remaining))}>
                                                {contract.days_remaining} يوم متبقٍ
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-1.5 truncate font-bold text-navy-900">
                                        {contract.customer?.name ?? contract.label}
                                    </p>

                                    <p className="mt-0.5 truncate text-xs text-navy-500">
                                        {formatDate(contract.starts_on)} — {formatDate(contract.ends_on)}
                                    </p>

                                    <p className="mt-1.5 text-[11px] font-semibold text-navy-400">
                                        {contract.visits_per_year} زيارة سنويًا
                                        {contract.sla_response_hours &&
                                            ` · استجابة خلال ${contract.sla_response_hours} ساعة`}
                                    </p>
                                </Link>

                                <div className="flex shrink-0 gap-1">
                                    <button
                                        onClick={() => {
                                            setEditing(contract)
                                            setFormOpen(true)
                                        }}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="تعديل"
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(contract)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {formOpen && (
                <ContractForm
                    key={editing?.id ?? 'new'}
                    open={formOpen}
                    onClose={() => setFormOpen(false)}
                    contract={editing}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(undefined)}
                onConfirm={handleDelete}
                title="حذف العقد"
                message={`سيتم حذف ${deleting?.code ?? ''} نهائيًا. العقود التي لها مهام مفتوحة لا يمكن حذفها — ألغِ العقد بدلًا من ذلك.`}
                confirmLabel="حذف"
                loading={remove.isPending}
                danger
            />
        </>
    )
}

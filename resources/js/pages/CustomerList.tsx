import {
    Building2,
    FileText,
    MapPin,
    MessageCircle,
    Pencil,
    Phone,
    Plus,
    Search,
    Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CustomerForm } from '@/components/CustomerForm'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, ErrorState, Input, PageHeader, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { telLink } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useCustomers, useDeleteCustomer } from '@/lib/queries'
import type { Customer } from '@/types'

export function CustomerList() {
    const toast = useToast()
    const [search, setSearch] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<Customer | undefined>()
    const [deleting, setDeleting] = useState<Customer | undefined>()

    const { path } = useArea()
    const { data, isLoading, isError, refetch } = useCustomers({ search, per_page: 40 })
    const remove = useDeleteCustomer()

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

    const openEdit = (customer: Customer) => {
        setEditing(customer)
        setFormOpen(true)
    }

    return (
        <>
            <PageHeader
                title="العملاء"
                subtitle={data ? `${data.meta.total} عميل` : undefined}
                actions={
                    <Button icon={Plus} onClick={openNew}>
                        عميل جديد
                    </Button>
                }
            />

            <div className="relative mb-4">
                <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                <Input
                    defaultValue={search}
                    onChange={(event) => debounced(event.target.value)}
                    placeholder="ابحث بالاسم أو الشركة أو رقم الهاتف…"
                    className="pr-10"
                />
            </div>

            {isError ? (
                <ErrorState message="تعذّر تحميل العملاء." onRetry={() => void refetch()} />
            ) : isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonCard key={index} />
                    ))}
                </div>
            ) : !data?.data.length ? (
                <EmptyState
                    icon={Building2}
                    title="لا يوجد عملاء"
                    description="أضف أول عميل لتتمكن من إنشاء المهام."
                    action={
                        <Button icon={Plus} onClick={openNew}>
                            إضافة عميل
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {data.data.map((customer) => (
                        <div key={customer.id} className="card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {customer.code}
                                        </span>
                                        {(customer.tasks_count ?? 0) > 0 && (
                                            <span className="badge bg-navy-50 text-navy-500">
                                                {customer.tasks_count} مهمة
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="mt-1 truncate text-sm font-bold text-navy-900">
                                        {customer.name}
                                    </h3>

                                    {customer.company && (
                                        <p className="truncate text-xs text-navy-400">{customer.company}</p>
                                    )}
                                </div>

                                <div className="flex shrink-0 gap-0.5">
                                    {/* What you send when chasing money. */}
                                    <Link
                                        to={path(`/print/statements/${customer.id}`)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="كشف حساب"
                                    >
                                        <FileText className="size-4" />
                                    </Link>
                                    <button
                                        onClick={() => openEdit(customer)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                        aria-label="تعديل"
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(customer)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            </div>

                            {customer.address && (
                                <p className="mt-3 flex items-start gap-1.5 text-xs text-navy-500">
                                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-navy-300" />
                                    <span className="line-clamp-2">{customer.address}</span>
                                </p>
                            )}

                            <div className="mt-3 grid grid-cols-3 gap-1.5">
                                <a href={telLink(customer.phone)} className="btn-secondary py-2 text-xs">
                                    <Phone className="size-3.5" />
                                    اتصال
                                </a>

                                <a
                                    href={customer.whatsapp_link ?? undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`btn-whatsapp py-2 text-xs ${!customer.whatsapp_link ? 'pointer-events-none opacity-40' : ''}`}
                                >
                                    <MessageCircle className="size-3.5" />
                                    واتساب
                                </a>

                                <a
                                    href={customer.maps_url ?? undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`btn-secondary py-2 text-xs ${!customer.maps_url ? 'pointer-events-none opacity-40' : ''}`}
                                >
                                    <MapPin className="size-3.5" />
                                    الخريطة
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {formOpen && (
                <CustomerForm
                    open
                    onClose={() => setFormOpen(false)}
                    customer={editing}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(undefined)}
                onConfirm={async () => {
                    if (!deleting) return

                    try {
                        await remove.mutateAsync(deleting.id)
                        toast.success('تم حذف العميل.')
                        setDeleting(undefined)
                    } catch (caught) {
                        toast.error(errorMessage(caught))
                    }
                }}
                title="حذف العميل"
                message={`سيتم حذف «${deleting?.name}». لا يمكن الحذف إذا كان لديه مهام مفتوحة.`}
                confirmLabel="حذف"
                danger
                loading={remove.isPending}
            />
        </>
    )
}

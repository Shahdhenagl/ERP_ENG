import clsx from 'clsx'
import {
    Building2,
    ChevronDown,
    FileText,
    MapPin,
    MessageCircle,
    Pencil,
    Phone,
    Plus,
    Search,
    Store,
    Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BranchForm } from '@/components/BranchForm'
import { CustomerForm } from '@/components/CustomerForm'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { telLink } from '@/lib/format'
import { useArea } from '@/lib/nav'
import { useCustomerBranches, useCustomers, useDeleteBranch, useDeleteCustomer } from '@/lib/queries'
import { CUSTOMER_TYPES, type Branch, type ContractStanding, type Customer } from '@/types'

const STANDING_CHIP: Record<ContractStanding, string> = {
    active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    expiring: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    expired: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    none: 'bg-navy-50 text-navy-400 ring-1 ring-navy-200',
}

export function CustomerList() {
    const toast = useToast()
    const [search, setSearch] = useState('')
    const [type, setType] = useState('')
    const [contract, setContract] = useState('')
    const [active, setActive] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<Customer | undefined>()
    const [deleting, setDeleting] = useState<Customer | undefined>()
    const [branchFor, setBranchFor] = useState<Customer | null>(null)
    const [editingBranch, setEditingBranch] = useState<Branch | undefined>()

    const { path } = useArea()
    const { data, isLoading, isError, refetch } = useCustomers({
        search,
        type: type || undefined,
        contract: contract || undefined,
        active: active === '' ? undefined : active,
        per_page: 40,
    })
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

            <div className="relative mb-3">
                <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                <Input
                    defaultValue={search}
                    onChange={(event) => debounced(event.target.value)}
                    placeholder="ابحث بالاسم أو الشركة أو رقم الهاتف…"
                    className="pr-10"
                />
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="نوع المؤسسة">
                    <option value="">كل الأنواع</option>
                    {Object.entries(CUSTOMER_TYPES).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </Select>

                <Select value={contract} onChange={(e) => setContract(e.target.value)} aria-label="حالة العقد">
                    <option value="">كل حالات العقد</option>
                    <option value="active">عقد ساري</option>
                    <option value="expiring">قارب على الانتهاء</option>
                    <option value="expired">عقد منتهي</option>
                    <option value="none">بلا عقد</option>
                </Select>

                <Select value={active} onChange={(e) => setActive(e.target.value)} aria-label="النشاط">
                    <option value="">الكل (نشط وغير نشط)</option>
                    <option value="1">النشطون</option>
                    <option value="0">غير النشطين</option>
                </Select>
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
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tabular text-[11px] font-bold text-brand-600">
                                            {customer.code}
                                        </span>
                                        {customer.type_label && (
                                            <span className="badge bg-brand-50 text-brand-700">
                                                {customer.type_label}
                                            </span>
                                        )}
                                        {customer.contract_standing && customer.contract_standing !== 'none' && (
                                            <span className={clsx('badge', STANDING_CHIP[customer.contract_standing])}>
                                                {customer.contract_standing_label}
                                            </span>
                                        )}
                                        {!customer.is_active && (
                                            <span className="badge bg-navy-100 text-navy-500">غير نشط</span>
                                        )}
                                    </div>

                                    <Link
                                        to={path(`/customers/${customer.id}`)}
                                        className="mt-1 block truncate text-sm font-bold text-navy-900 hover:text-brand-600 hover:underline"
                                    >
                                        {customer.name}
                                    </Link>

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

                            <BranchStrip
                                customer={customer}
                                onAdd={() => {
                                    setEditingBranch(undefined)
                                    setBranchFor(customer)
                                }}
                                onEdit={(branch) => {
                                    setEditingBranch(branch)
                                    setBranchFor(customer)
                                }}
                            />
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

            {/* Rendered once, outside the loop, so opening a branch form does
                not remount every customer card. */}
            {branchFor && (
                <BranchForm
                    key={editingBranch?.id ?? `new-${branchFor.id}`}
                    open
                    onClose={() => {
                        setBranchFor(null)
                        setEditingBranch(undefined)
                    }}
                    customerId={branchFor.id}
                    branch={editingBranch}
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

/**
 * The customer's sites, folded away until asked for. Most accounts have one
 * branch and the row would be noise; the ones that have several are exactly
 * the accounts where knowing which site a device sits at matters.
 */
function BranchStrip({
    customer,
    onAdd,
    onEdit,
}: {
    customer: Customer
    onAdd: () => void
    onEdit: (branch: Branch) => void
}) {
    const toast = useToast()
    const [open, setOpen] = useState(false)
    const [deleting, setDeleting] = useState<Branch | undefined>()

    const { data: branches, isLoading } = useCustomerBranches(open ? customer.id : undefined)
    const remove = useDeleteBranch()

    return (
        <div className="mt-3 border-t border-navy-100 pt-3">
            <button
                onClick={() => setOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-2 text-xs font-bold text-navy-500 transition hover:text-navy-800"
            >
                <span className="flex items-center gap-1.5">
                    <Store className="size-3.5" />
                    الفروع
                </span>
                <ChevronDown
                    className={clsx('size-4 transition-transform', open && 'rotate-180')}
                />
            </button>

            {open && (
                <div className="mt-2 space-y-1.5">
                    {isLoading ? (
                        <p className="text-xs text-navy-400">جارٍ التحميل…</p>
                    ) : (
                        branches?.map((branch) => (
                            <div
                                key={branch.id}
                                className="flex items-start justify-between gap-2 rounded-xl bg-navy-50 p-2.5"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-bold text-navy-800">
                                        {branch.name}
                                        {branch.customer_ref && (
                                            <span className="tabular mr-1.5 font-normal text-navy-400">
                                                ({branch.customer_ref})
                                            </span>
                                        )}
                                    </p>

                                    {branch.address && (
                                        <p className="truncate text-[11px] text-navy-500">
                                            {branch.address}
                                        </p>
                                    )}

                                    <p className="mt-0.5 text-[11px] text-navy-400">
                                        {branch.contact_name && `${branch.contact_name} · `}
                                        {branch.assets_count ?? 0} جهاز
                                        {branch.working_hours && ` · ${branch.working_hours}`}
                                    </p>
                                </div>

                                <div className="flex shrink-0 gap-0.5">
                                    {branch.maps_url && (
                                        <a
                                            href={branch.maps_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="grid place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-white hover:text-navy-700"
                                            aria-label="الخريطة"
                                        >
                                            <MapPin className="size-3.5" />
                                        </a>
                                    )}
                                    <button
                                        onClick={() => {
                                            onEdit(branch)
                                        }}
                                        className="grid place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-white hover:text-navy-700"
                                        aria-label="تعديل الفرع"
                                    >
                                        <Pencil className="size-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(branch)}
                                        className="grid place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف الفرع"
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}

                    <Button
                        variant="ghost"
                        icon={Plus}
                        className="w-full text-xs"
                        onClick={() => {
                            onAdd()
                        }}
                    >
                        إضافة فرع
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(undefined)}
                onConfirm={async () => {
                    if (!deleting) return

                    try {
                        await remove.mutateAsync(deleting.id)
                        toast.success('تم حذف الفرع.')
                        setDeleting(undefined)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر حذف الفرع.'))
                    }
                }}
                title="حذف الفرع"
                message={`سيتم حذف «${deleting?.name}». الفروع التي بها أجهزة أو مهام لا يمكن حذفها.`}
                confirmLabel="حذف"
                danger
                loading={remove.isPending}
            />
        </div>
    )
}

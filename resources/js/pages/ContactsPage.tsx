import clsx from 'clsx'
import { Contact as ContactIcon, Mail, Phone, Plus, Search, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { useContacts, useCustomers, useDeleteContact, useSaveContact } from '@/lib/queries'
import type { Contact } from '@/types'

/**
 * The people at every customer, in one directory.
 *
 * Filter to a customer or search across all of them; the primary contact leads
 * each account. Adding or editing is a dialog — the customer is fixed once
 * chosen, because a contact who changed employer is a new contact, not an edit.
 */
export function ContactsPage() {
    const { data: customerPage } = useCustomers({ per_page: 200 })
    const customers = customerPage?.data ?? []

    const [customerId, setCustomerId] = useState<number | ''>('')
    const [search, setSearch] = useState('')
    const [editing, setEditing] = useState<Contact | null>(null)
    const [creating, setCreating] = useState(false)

    const { data: contacts, isLoading } = useContacts({
        customer_id: customerId || undefined,
        search: search.trim() || undefined,
    })

    const grouped = useMemo(() => {
        const map = new Map<number, { customer: string; rows: Contact[] }>()
        for (const contact of contacts ?? []) {
            const entry = map.get(contact.customer_id) ?? {
                customer: contact.customer ?? '—',
                rows: [],
            }
            entry.rows.push(contact)
            map.set(contact.customer_id, entry)
        }
        return [...map.values()]
    }, [contacts])

    return (
        <>
            <PageHeader
                title="جهات الاتصال"
                subtitle="الأشخاص عند العملاء — من تتصل به ولماذا"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        جهة اتصال
                    </Button>
                }
            />

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <Select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                >
                    <option value="">كل العملاء</option>
                    {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                            {customer.name}
                        </option>
                    ))}
                </Select>
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ابحث بالاسم أو المسمى أو الهاتف…"
                        className="pr-10"
                    />
                </div>
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !grouped.length ? (
                <EmptyState
                    icon={ContactIcon}
                    title="لا توجد جهات اتصال"
                    description="أضف الأشخاص الذين تتعامل معهم عند كل عميل — المهندس، المحاسب، المسؤول."
                />
            ) : (
                <div className="space-y-5">
                    {grouped.map((group) => (
                        <div key={group.customer}>
                            <p className="mb-2 text-xs font-extrabold text-navy-400">{group.customer}</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {group.rows.map((contact) => (
                                    <button
                                        key={contact.id}
                                        onClick={() => setEditing(contact)}
                                        className="card-interactive block w-full p-3.5 text-start"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                                                {contact.name.charAt(0)}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-bold text-navy-900">
                                                        {contact.name}
                                                    </span>
                                                    {contact.is_primary && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                            <Star className="size-3" />
                                                            الأساسي
                                                        </span>
                                                    )}
                                                    {!contact.is_active && (
                                                        <span className="badge bg-slate-100 text-slate-500">
                                                            موقوف
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="truncate text-[11px] text-navy-400">
                                                    {contact.job_title ?? 'جهة اتصال'}
                                                    {contact.department && ` · ${contact.department}`}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-left text-[11px] text-navy-500">
                                                {contact.phone && (
                                                    <p className="tabular flex items-center justify-end gap-1">
                                                        <Phone className="size-3" />
                                                        {contact.phone}
                                                    </p>
                                                )}
                                                {contact.email && (
                                                    <p className="flex items-center justify-end gap-1 truncate">
                                                        <Mail className="size-3" />
                                                        {contact.email}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {(creating || editing) && (
                <ContactDialog
                    contact={editing ?? undefined}
                    customers={customers}
                    defaultCustomerId={customerId || undefined}
                    onClose={() => {
                        setCreating(false)
                        setEditing(null)
                    }}
                />
            )}
        </>
    )
}

function ContactDialog({
    contact,
    customers,
    defaultCustomerId,
    onClose,
}: {
    contact?: Contact
    customers: Array<{ id: number; name: string }>
    defaultCustomerId?: number
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveContact()
    const remove = useDeleteContact()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        customer_id: contact ? String(contact.customer_id) : defaultCustomerId ? String(defaultCustomerId) : '',
        name: contact?.name ?? '',
        job_title: contact?.job_title ?? '',
        department: contact?.department ?? '',
        phone: contact?.phone ?? '',
        whatsapp: contact?.whatsapp ?? '',
        email: contact?.email ?? '',
        is_primary: contact?.is_primary ?? false,
        is_active: contact?.is_active ?? true,
        notes: contact?.notes ?? '',
    })

    const set = (key: keyof typeof form) => (value: string | boolean) =>
        setForm((current) => ({ ...current, [key]: value }))

    return (
        <Modal
            open
            onClose={onClose}
            title={contact ? `تعديل — ${contact.name}` : 'جهة اتصال جديدة'}
            size="sm"
            footer={
                <div className="flex w-full items-center justify-between gap-2">
                    {contact ? (
                        <Button
                            variant="secondary"
                            icon={Trash2}
                            className="text-red-600"
                            disabled={remove.isPending}
                            onClick={async () => {
                                try {
                                    await remove.mutateAsync(contact.id)
                                    toast.success('تم الحذف.')
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
                                        id: contact?.id,
                                        customer_id: Number(form.customer_id),
                                        name: form.name,
                                        job_title: form.job_title || null,
                                        department: form.department || null,
                                        phone: form.phone || null,
                                        whatsapp: form.whatsapp || null,
                                        email: form.email || null,
                                        is_primary: form.is_primary,
                                        is_active: form.is_active,
                                        notes: form.notes || null,
                                    })
                                    toast.success('تم الحفظ.')
                                    onClose()
                                } catch (caught) {
                                    setErrors(fieldErrors(caught))
                                    toast.error(errorMessage(caught, 'تعذّر الحفظ.'))
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
                <Field label="العميل" required error={errors.customer_id}>
                    <Select
                        value={form.customer_id}
                        onChange={(e) => set('customer_id')(e.target.value)}
                        disabled={Boolean(contact)}
                    >
                        <option value="">— اختر —</option>
                        {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                                {customer.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="الاسم" required error={errors.name}>
                    <Input value={form.name} onChange={(e) => set('name')(e.target.value)} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="المسمى الوظيفي" error={errors.job_title}>
                        <Input value={form.job_title} onChange={(e) => set('job_title')(e.target.value)} />
                    </Field>
                    <Field label="الإدارة" error={errors.department}>
                        <Input value={form.department} onChange={(e) => set('department')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الهاتف" error={errors.phone}>
                        <Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="واتساب" error={errors.whatsapp}>
                        <Input value={form.whatsapp} onChange={(e) => set('whatsapp')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                </div>

                <Field label="البريد الإلكتروني" error={errors.email}>
                    <Input value={form.email} onChange={(e) => set('email')(e.target.value)} dir="ltr" className="text-left" />
                </Field>

                <div className="flex flex-wrap gap-4">
                    <Toggle
                        label="جهة الاتصال الأساسية"
                        checked={form.is_primary}
                        onChange={(v) => set('is_primary')(v)}
                    />
                    <Toggle
                        label="نشط"
                        checked={form.is_active}
                        onChange={(v) => set('is_active')(v)}
                    />
                </div>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

function Toggle({
    label,
    checked,
    onChange,
}: {
    label: string
    checked: boolean
    onChange: (value: boolean) => void
}) {
    return (
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-navy-700">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className={clsx('size-4 accent-brand-600')}
            />
            {label}
        </label>
    )
}

import clsx from 'clsx'
import { KeyRound, Pencil, Plus, Save, Search, Trash2, UserCircle2, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { PermissionMatrix } from '@/components/PermissionMatrix'
import { SectionTabs } from '@/components/SectionTabs'
import { Button, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { ADMIN_SECTIONS } from '@/lib/sections'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDeleteUser, useSaveUser, useUsers } from '@/lib/queries'
import type { Role, User } from '@/types'

const ROLE_STYLES: Record<Role, string> = {
    admin: 'bg-navy-900 text-white',
    manager: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
    technician: 'bg-navy-50 text-navy-600 ring-1 ring-navy-200',
}

export function UserList() {
    const toast = useToast()
    const { user: currentUser } = useAuth()
    const [search, setSearch] = useState('')
    const [role, setRole] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<User | undefined>()
    const [deleting, setDeleting] = useState<User | undefined>()
    const [permissionsFor, setPermissionsFor] = useState<User | null>(null)

    const { data, isLoading, isError, refetch } = useUsers({ search, role, per_page: 50 })
    const remove = useDeleteUser()

    const timer = useRef<number>(0)
    const debounced = (value: string) => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setSearch(value), 350)
    }

    useEffect(() => () => window.clearTimeout(timer.current), [])

    return (
        <>
            <PageHeader
                title="المستخدمون"
                subtitle={data ? `${data.meta.total} مستخدم` : undefined}
                actions={
                    <Button
                        icon={Plus}
                        onClick={() => {
                            setEditing(undefined)
                            setFormOpen(true)
                        }}
                    >
                        مستخدم جديد
                    </Button>
                }
            />

            <SectionTabs sections={ADMIN_SECTIONS} />

            <div className="mb-4 flex gap-2">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                    <Input
                        defaultValue={search}
                        onChange={(event) => debounced(event.target.value)}
                        placeholder="ابحث بالاسم أو البريد أو الهاتف…"
                        className="pr-10"
                    />
                </div>

                <Select
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="w-40 shrink-0"
                >
                    <option value="">كل الأدوار</option>
                    <option value="admin">مدير النظام</option>
                    <option value="manager">مدير</option>
                    <option value="technician">فني</option>
                </Select>
            </div>

            {isError ? (
                <ErrorState message="تعذّر تحميل المستخدمين." onRetry={() => void refetch()} />
            ) : isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonCard key={index} />
                    ))}
                </div>
            ) : !data?.data.length ? (
                <EmptyState icon={Users} title="لا يوجد مستخدمون مطابقون" />
            ) : (
                <div className="card divide-y divide-navy-100">
                    {data.data.map((user) => (
                        <div key={user.id} className="flex items-center gap-3 p-4">
                            <div
                                className={clsx(
                                    'grid size-11 shrink-0 place-items-center rounded-xl font-bold',
                                    user.is_active ? 'bg-navy-50 text-navy-600' : 'bg-navy-50 text-navy-300',
                                )}
                            >
                                {user.name.charAt(0)}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="truncate text-sm font-bold text-navy-900">{user.name}</h3>
                                    <span className={clsx('badge', ROLE_STYLES[user.role])}>
                                        {user.role_label}
                                    </span>
                                    {!user.is_active && (
                                        <span className="badge bg-red-50 text-red-600">موقوف</span>
                                    )}
                                </div>

                                <p className="truncate text-xs text-navy-400" dir="ltr">
                                    {user.email}
                                    {user.phone ? ` · ${user.phone}` : ''}
                                </p>

                                {user.role === 'technician' && (
                                    <p className="mt-0.5 text-[11px] font-semibold text-brand-600">
                                        {user.open_tasks_count ?? 0} مهمة مفتوحة
                                    </p>
                                )}
                            </div>

                            <div className="flex shrink-0 gap-0.5">
                                <button
                                    onClick={() => setPermissionsFor(user)}
                                    className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                    aria-label="الصلاحيات"
                                >
                                    <KeyRound className="size-4" />
                                </button>

                                <button
                                    onClick={() => {
                                        setEditing(user)
                                        setFormOpen(true)
                                    }}
                                    className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                    aria-label="تعديل"
                                >
                                    <Pencil className="size-4" />
                                </button>

                                {user.id !== currentUser?.id && (
                                    <button
                                        onClick={() => setDeleting(user)}
                                        className="tap grid place-items-center rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {formOpen && (
                <UserFormDialog
                    open
                    onClose={() => setFormOpen(false)}
                    user={editing}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(undefined)}
                onConfirm={async () => {
                    if (!deleting) return

                    try {
                        await remove.mutateAsync(deleting.id)
                        toast.success('تم حذف المستخدم.')
                        setDeleting(undefined)
                    } catch (caught) {
                        toast.error(errorMessage(caught))
                    }
                }}
                title="حذف المستخدم"
                message={`سيتم حذف «${deleting?.name}». لا يمكن حذف فني لديه مهام مفتوحة.`}
                confirmLabel="حذف"
                danger
                loading={remove.isPending}
            />

            {permissionsFor && (
                <PermissionMatrix
                    user={permissionsFor}
                    onClose={() => setPermissionsFor(null)}
                />
            )}
        </>
    )
}

function UserFormDialog({
    open,
    onClose,
    user,
}: {
    open: boolean
    onClose: () => void
    user?: User
}) {
    const toast = useToast()
    const save = useSaveUser(user?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: user?.name ?? '',
        email: user?.email ?? '',
        password: '',
        role: (user?.role ?? 'technician') as Role,
        phone: user?.phone ?? '',
        whatsapp: user?.whatsapp ?? '',
        job_title: user?.job_title ?? '',
        is_active: user?.is_active ?? true,
    })

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm((current) => ({ ...current, [key]: value }))

    const handleSave = async () => {
        setErrors({})

        try {
            await save.mutateAsync({
                ...form,
                password: form.password || undefined,
                phone: form.phone || null,
                whatsapp: form.whatsapp || null,
                job_title: form.job_title || null,
            })

            toast.success(user ? 'تم تحديث المستخدم.' : 'تم إنشاء المستخدم.')
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ المستخدم.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={user ? 'تعديل المستخدم' : 'مستخدم جديد'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button icon={Save} loading={save.isPending} onClick={handleSave}>
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الاسم" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(event) => set('name', event.target.value)}
                        autoFocus
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="البريد الإلكتروني" required error={errors.email}>
                        <Input
                            type="email"
                            value={form.email}
                            onChange={(event) => set('email', event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field
                        label="كلمة المرور"
                        required={!user}
                        hint={user ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية.' : '٨ أحرف على الأقل.'}
                        error={errors.password}
                    >
                        <Input
                            type="password"
                            value={form.password}
                            onChange={(event) => set('password', event.target.value)}
                            dir="ltr"
                            className="text-left"
                            autoComplete="new-password"
                        />
                    </Field>

                    <Field label="الدور" required error={errors.role}>
                        <Select
                            value={form.role}
                            onChange={(event) => set('role', event.target.value as Role)}
                        >
                            <option value="technician">فني</option>
                            <option value="manager">مدير</option>
                            <option value="admin">مدير النظام</option>
                        </Select>
                    </Field>

                    <Field label="المسمى الوظيفي" error={errors.job_title}>
                        <Input
                            value={form.job_title}
                            onChange={(event) => set('job_title', event.target.value)}
                            placeholder="فني أول UPS"
                        />
                    </Field>

                    <Field label="رقم الهاتف" error={errors.phone}>
                        <Input
                            value={form.phone}
                            onChange={(event) => set('phone', event.target.value)}
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>

                    <Field
                        label="رقم واتساب"
                        hint="اتركه فارغًا لاستخدام رقم الهاتف."
                        error={errors.whatsapp}
                    >
                        <Input
                            value={form.whatsapp}
                            onChange={(event) => set('whatsapp', event.target.value)}
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-200 px-4 py-3 transition hover:bg-navy-50">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(event) => set('is_active', event.target.checked)}
                        className="size-4.5 accent-brand-500"
                    />
                    <span className="flex items-center gap-2 text-sm font-semibold text-navy-700">
                        <UserCircle2 className="size-4 text-navy-300" />
                        الحساب نشط ويمكنه تسجيل الدخول
                    </span>
                </label>
            </div>
        </Modal>
    )
}

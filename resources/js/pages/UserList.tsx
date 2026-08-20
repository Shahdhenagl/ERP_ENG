import clsx from 'clsx'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { tr } from '@/lib/i18n'
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
import {
    useDeleteUser,
    useJobRoles,
    usePermissionCatalogue,
    useSavePermissions,
    useSaveUser,
    useUserPermissions,
    useUsers,
} from '@/lib/queries'
import type { Role, User } from '@/types'

const ROLE_STYLES: Record<Role, string> = {
    admin: 'bg-ink text-white',
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

    const [view, setView] = useViewMode('users')
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
                        {tr('مستخدم جديد')}
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

            <div className="mb-3 flex justify-end">
                <ViewToggle view={view} onChange={setView} />
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
            ) : view === 'table' ? (
                <DataTable
                    minWidth="52rem"
                    headers={[
                        'الاسم',
                        { label: 'الدور', className: 'w-40' },
                        'البريد الإلكتروني',
                        { label: 'الهاتف', className: 'w-32' },
                        { label: 'الحالة', className: 'w-24' },
                    ]}
                >
                    {data.data.map((user) => (
                        <tr key={user.id} className="border-t border-navy-100 hover:bg-navy-50/60">
                            <td className="px-3 py-2.5 font-semibold text-navy-800">{user.name}</td>
                            <td className="px-3 py-2.5">
                                <span className={clsx('badge', ROLE_STYLES[user.role])}>
                                    {user.effective_role_label ?? user.position_label ?? user.role_label}
                                </span>
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600" dir="ltr">
                                <span className="block text-start">{user.email}</span>
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600" dir="ltr">
                                <span className="block text-start">{user.phone ?? '—'}</span>
                            </td>
                            <td className="px-3 py-2.5">
                                {user.is_active ? (
                                    <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                        نشط
                                    </span>
                                ) : (
                                    <span className="badge bg-red-50 text-red-600">موقوف</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </DataTable>
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
                                        {user.effective_role_label ?? user.position_label ?? user.role_label}
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
    const savePermissions = useSavePermissions(user?.id)
    const { data: roles } = useJobRoles()
    const { data: catalogue } = usePermissionCatalogue()
    const { data: currentPermissions, isLoading: permissionsLoading } = useUserPermissions(user?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({})

    const [form, setForm] = useState({
        name: user?.name ?? '',
        email: user?.email ?? '',
        password: '',
        position: user?.position ?? '',
        phone: user?.phone ?? '',
        whatsapp: user?.whatsapp ?? '',
        job_title: user?.job_title ?? '',
        is_active: user?.is_active ?? true,
    })

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm((current) => ({ ...current, [key]: value }))

    const allPermissionKeys = catalogue?.groups.flatMap((group) => group.permissions.map((permission) => permission.key)) ?? []
    const selectedRole = roles?.roles.find((role) => role.key === form.position)
    const isAdminRole = selectedRole?.base_role === 'admin'

    useEffect(() => {
        if (currentPermissions) {
            setPermissionDraft(Object.fromEntries(currentPermissions.effective.map((key) => [key, true])))
            return
        }

        if (!user && selectedRole) {
            const defaults = selectedRole.permissions.length > 0
                ? selectedRole.permissions
                : selectedRole.base_role === 'admin'
                    ? allPermissionKeys
                    : []
            setPermissionDraft(Object.fromEntries(defaults.map((key) => [key, true])))
        }
    }, [allPermissionKeys.join('|'), currentPermissions, selectedRole, user])

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                ...form,
                password: form.password || undefined,
                phone: form.phone || null,
                whatsapp: form.whatsapp || null,
                job_title: form.job_title || null,
            })
            const savedUser = (saved as User & { data?: User }).data ?? saved as User

            if (savedUser?.id && catalogue && !isAdminRole) {
                await savePermissions.mutateAsync({
                    userId: savedUser.id,
                    permissions: permissionDraft,
                })
            }

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
                        {tr('إلغاء')}
                    </Button>
                    <Button icon={Save} loading={save.isPending} onClick={handleSave}>
                        {tr('حفظ')}
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

                    <Field
                        label="الدور"
                        required
                        error={errors.position ?? errors.role}
                        hint="الدور يحدد التطبيق والصلاحيات — ويُعرَّف من شاشة الأدوار"
                    >
                        <Select
                            value={form.position}
                            onChange={(event) => {
                                const position = event.target.value
                                set('position', position)
                                const nextRole = roles?.roles.find((role) => role.key === position)
                                if (!user && nextRole) {
                                    const defaults = nextRole.permissions.length > 0
                                        ? nextRole.permissions
                                        : nextRole.base_role === 'admin'
                                            ? allPermissionKeys
                                            : []
                                    setPermissionDraft(Object.fromEntries(defaults.map((key) => [key, true])))
                                }
                            }}
                        >
                            <option value="">— اختر الدور —</option>
                            {(roles?.roles ?? []).map((role) => (
                                <option key={role.key} value={role.key}>
                                    {role.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="مسمى إضافي (اختياري)" error={errors.job_title}>
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

                {catalogue && (
                    <section className="space-y-3 rounded-2xl border border-navy-100 bg-surface p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-extrabold text-navy-800">صلاحيات الموديولات</h3>
                                <p className="mt-1 text-[11px] leading-relaxed text-navy-400">
                                    كل عنوان يمثل موديول، والخيارات تحته هي الـSub-modules التي يمكن منحها لهذا المستخدم.
                                </p>
                            </div>
                            {isAdminRole && <span className="badge bg-amber-50 text-amber-700">مدير النظام: وصول كامل</span>}
                        </div>

                        {permissionsLoading && user ? (
                            <p className="rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-500">جاري تحميل الصلاحيات الحالية…</p>
                        ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                                {catalogue.groups.map((group) => {
                                    const keys = group.permissions.map((permission) => permission.key)
                                    const all = keys.every((key) => permissionDraft[key])

                                    return (
                                        <section key={group.group} className="overflow-hidden rounded-xl border border-navy-100">
                                            <div className="flex items-center justify-between bg-navy-50 px-3 py-2">
                                                <h4 className="text-xs font-extrabold text-navy-800">{group.group}</h4>
                                                <button
                                                    type="button"
                                                    disabled={isAdminRole}
                                                    onClick={() => setPermissionDraft((current) => ({
                                                        ...current,
                                                        ...Object.fromEntries(keys.map((key) => [key, !all])),
                                                    }))}
                                                    className="tap rounded-lg bg-surface px-2 py-1 text-[10px] font-bold text-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {all ? 'إلغاء الكل' : 'تحديد الكل'}
                                                </button>
                                            </div>
                                            <div className="divide-y divide-navy-50">
                                                {group.permissions.map((permission) => (
                                                    <label key={permission.key} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-navy-50/60">
                                                        <input
                                                            type="checkbox"
                                                            checked={isAdminRole || Boolean(permissionDraft[permission.key])}
                                                            disabled={isAdminRole}
                                                            onChange={(event) => setPermissionDraft((current) => ({
                                                                ...current,
                                                                [permission.key]: event.target.checked,
                                                            }))}
                                                            className="size-3.5"
                                                        />
                                                        <span className="text-xs font-semibold text-navy-700">{permission.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </section>
                                    )
                                })}
                            </div>
                        )}
                    </section>
                )}

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-200 px-4 py-3 transition hover:bg-navy-50">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(event) => set('is_active', event.target.checked)}
                        className="size-4.5 accent-brand-500"
                    />
                    <span className="flex items-center gap-2 text-sm font-semibold text-navy-700">
                        <UserCircle2 className="size-4 text-navy-300" />
                        {tr('الحساب نشط ويمكنه تسجيل الدخول')}
                    </span>
                </label>
            </div>
        </Modal>
    )
}

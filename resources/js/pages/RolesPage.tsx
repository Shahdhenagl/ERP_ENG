import clsx from 'clsx'
import { Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { useArea } from '@/lib/nav'
import { useDeleteJobRole, useJobRoles, useSaveJobRole } from '@/lib/queries'
import type { JobRole, JobRoleCatalogue, Role } from '@/types'

/**
 * The roles the company runs on, and what each may do.
 *
 * The permissions on offer are fixed in code — one is only real if a route
 * checks it, and offering a tick nothing enforces would be a restriction that
 * was never applied. Which of them a job carries is another question entirely,
 * and it belongs to whoever runs the company: a role is named here, ticked
 * here, and everyone holding it moves the moment it is saved.
 */

/** Which application the role opens — the office one, or the field app. */
const BASE_ROLES: Array<{ value: Role; label: string; hint: string }> = [
    { value: 'manager', label: 'موظف مكتب', hint: 'النظام على الويب، بالصلاحيات المحددة' },
    { value: 'technician', label: 'فني ميداني', hint: 'تطبيق الفني فقط' },
    { value: 'admin', label: 'مدير النظام', hint: 'كل شيء، ولا يمكن تقييده' },
]

export function RolesPage() {
    const { path } = useArea()
    const { data, isLoading } = useJobRoles()
    const [editing, setEditing] = useState<JobRole | 'new' | null>(null)
    const [removing, setRemoving] = useState<JobRole | null>(null)

    const toast = useToast()
    const remove = useDeleteJobRole()

    return (
        <>
            <PageHeader
                title="الأدوار والصلاحيات"
                subtitle="عرّف دورًا، سمّه، وحدد ما يستطيع فعله"
                actions={
                    <>
                        <Link to={path('/users')} className="btn-secondary text-xs">
                            <Users className="size-4" />
                            المستخدمون
                        </Link>
                        <Button onClick={() => setEditing('new')} className="text-xs">
                            <Plus className="size-4" />
                            دور جديد
                        </Button>
                    </>
                }
            />

            <p className="mb-4 rounded-xl bg-navy-50 px-3 py-2.5 text-xs leading-relaxed text-navy-500">
                تعديل صلاحيات الدور ينتقل فورًا إلى كل من يحمله. ولمنح مستخدم بعينه استثناءً
                — صلاحية زائدة أو منزوعة — افتح ملفه من شاشة المستخدمين؛ الاستثناء يبقى معه.
            </p>

            {isLoading || !data ? (
                <SkeletonCard />
            ) : data.roles.length === 0 ? (
                <EmptyState
                    icon={ShieldCheck}
                    title="لا توجد أدوار"
                    description="ابدأ بإنشاء دور وحدد صلاحياته."
                    action={<Button onClick={() => setEditing('new')}>دور جديد</Button>}
                />
            ) : (
                <div className="grid gap-3 md:grid-cols-2">
                    {data.roles.map((role) => (
                        <RoleCard
                            key={role.id}
                            role={role}
                            catalogue={data}
                            onEdit={() => setEditing(role)}
                            onDelete={() => setRemoving(role)}
                        />
                    ))}
                </div>
            )}

            {editing && data && (
                <RoleEditor
                    role={editing === 'new' ? null : editing}
                    catalogue={data}
                    onClose={() => setEditing(null)}
                />
            )}

            <ConfirmDialog
                open={Boolean(removing)}
                title={`حذف الدور «${removing?.name}»؟`}
                message="لن يتأثر أحد ما دام الدور غير مسند لأي مستخدم."
                confirmLabel="حذف"
                danger
                loading={remove.isPending}
                onClose={() => setRemoving(null)}
                onConfirm={async () => {
                    if (!removing) return

                    try {
                        await remove.mutateAsync(removing.id)
                        toast.success('تم حذف الدور.')
                        setRemoving(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر حذف الدور.'))
                    }
                }}
            />
        </>
    )
}

function RoleCard({
    role,
    catalogue,
    onEdit,
    onDelete,
}: {
    role: JobRole
    catalogue: JobRoleCatalogue
    onEdit: () => void
    onDelete: () => void
}) {
    const total = catalogue.groups.reduce((sum, group) => sum + group.permissions.length, 0)
    const isAdmin = role.base_role === 'admin'

    return (
        <div className="card p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-navy-900">{role.name}</p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                            className={clsx(
                                'badge',
                                role.base_role === 'technician'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : isAdmin
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-navy-100 text-navy-600',
                            )}
                        >
                            {role.base_role_label}
                        </span>

                        <span className="tabular badge bg-navy-50 text-navy-500">
                            {isAdmin ? 'كل الصلاحيات' : `${role.permissions.length} من ${total}`}
                        </span>

                        <span className="tabular badge bg-navy-50 text-navy-500">
                            {role.users_count} مستخدم
                        </span>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <button
                        onClick={onEdit}
                        className="tap grid place-items-center rounded-lg p-2 text-navy-500 transition hover:bg-navy-50"
                        aria-label="تعديل الدور"
                    >
                        <Pencil className="size-4" />
                    </button>

                    <button
                        onClick={onDelete}
                        disabled={role.users_count > 0}
                        className="tap grid place-items-center rounded-lg p-2 text-red-500 transition hover:bg-red-50 disabled:opacity-30"
                        aria-label="حذف الدور"
                        title={role.users_count > 0 ? 'الدور مسند إلى مستخدمين' : undefined}
                    >
                        <Trash2 className="size-4" />
                    </button>
                </div>
            </div>

            <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-navy-400">
                {role.permissions.length === 0
                    ? 'بدون صلاحيات إضافية — شاشاته الخاصة فقط.'
                    : catalogue.groups
                          .flatMap((group) => group.permissions)
                          .filter((permission) => role.permissions.includes(permission.key))
                          .map((permission) => permission.label)
                          .join(' · ')}
            </p>
        </div>
    )
}

function RoleEditor({
    role,
    catalogue,
    onClose,
}: {
    role: JobRole | null
    catalogue: JobRoleCatalogue
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveJobRole()

    const [name, setName] = useState(role?.name ?? '')
    const [baseRole, setBaseRole] = useState<Role>(role?.base_role ?? 'manager')
    const [picked, setPicked] = useState<string[]>(role?.permissions ?? [])
    const [errors, setErrors] = useState<Record<string, string>>({})

    // An admin holds everything by definition, so a tick list would be a
    // choice that isn't one. Say so instead of showing a dead screen.
    const isAdmin = baseRole === 'admin'

    useEffect(() => {
        if (isAdmin) {
            setPicked(catalogue.groups.flatMap((group) => group.permissions.map((p) => p.key)))
        }
    }, [isAdmin, catalogue])

    const toggle = (key: string) =>
        setPicked((current) =>
            current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
        )

    return (
        <Modal
            open
            onClose={onClose}
            title={role ? `تعديل الدور «${role.name}»` : 'دور جديد'}
            description="اختر التطبيق الذي يفتحه الدور، ثم علّم ما يستطيع فعله."
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await save.mutateAsync({
                                    id: role?.id,
                                    name: name.trim(),
                                    base_role: baseRole,
                                    permissions: picked,
                                })
                                toast.success(role ? 'تم حفظ الدور.' : 'تم إنشاء الدور.')
                                onClose()
                            } catch (caught) {
                                const bag = (
                                    caught as {
                                        response?: { data?: { errors?: Record<string, string[]> } }
                                    }
                                ).response?.data?.errors

                                if (bag) {
                                    setErrors(
                                        Object.fromEntries(
                                            Object.entries(bag).map(([key, list]) => [key, list[0]]),
                                        ),
                                    )
                                }

                                toast.error(errorMessage(caught, 'تعذّر حفظ الدور.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="اسم الدور" error={errors.name} required>
                        <Input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="مثال: أمين المخزن"
                            autoFocus
                        />
                    </Field>

                    <Field
                        label="التطبيق"
                        error={errors.base_role}
                        hint={BASE_ROLES.find((option) => option.value === baseRole)?.hint}
                        required
                    >
                        <Select
                            value={baseRole}
                            onChange={(event) => setBaseRole(event.target.value as Role)}
                        >
                            {BASE_ROLES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>

                {isAdmin ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
                        مدير النظام يملك كل الصلاحيات ولا يمكن تقييده. لدور محدود الصلاحيات
                        اختر «موظف مكتب».
                    </p>
                ) : (
                    <>
                        {errors.permissions && (
                            <p className="text-xs font-semibold text-red-600">
                                {errors.permissions}
                            </p>
                        )}

                        {catalogue.groups.map((group) => {
                            const inGroup = group.permissions.map((permission) => permission.key)
                            const all = inGroup.every((key) => picked.includes(key))

                            return (
                                <section
                                    key={group.group}
                                    className="overflow-hidden rounded-2xl border border-navy-100"
                                >
                                    <div className="flex items-center justify-between bg-navy-50 px-4 py-2.5">
                                        <h3 className="text-sm font-extrabold text-navy-800">
                                            {group.group}
                                        </h3>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPicked((current) =>
                                                    all
                                                        ? current.filter(
                                                              (key) => !inGroup.includes(key),
                                                          )
                                                        : [...new Set([...current, ...inGroup])],
                                                )
                                            }
                                            className="tap rounded-lg bg-surface px-2.5 py-1 text-[11px] font-bold text-navy-600"
                                        >
                                            {all ? 'إلغاء الكل' : 'تحديد الكل'}
                                        </button>
                                    </div>

                                    <div className="divide-y divide-navy-50">
                                        {group.permissions.map((permission) => {
                                            const on = picked.includes(permission.key)

                                            return (
                                                <label
                                                    key={permission.key}
                                                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-navy-50/60"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={on}
                                                        onChange={() => toggle(permission.key)}
                                                        className="size-4"
                                                    />

                                                    <span
                                                        className={clsx(
                                                            'min-w-0 flex-1 text-sm font-semibold',
                                                            on ? 'text-navy-900' : 'text-navy-400',
                                                        )}
                                                    >
                                                        {permission.label}
                                                    </span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </section>
                            )
                        })}
                    </>
                )}
            </div>
        </Modal>
    )
}

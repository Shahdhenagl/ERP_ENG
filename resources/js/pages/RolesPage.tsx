import { Check, Minus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, SkeletonCard } from '@/components/ui'
import { useArea } from '@/lib/nav'
import { usePermissionCatalogue } from '@/lib/queries'
import type { Role } from '@/types'

/**
 * The roles and what each may do by default, read as one matrix.
 *
 * The catalogue and the per-role defaults both come from the same endpoint the
 * per-user editor uses, so this is the reference the editor overrides against:
 * a tick here is what the role grants before anyone changes a single user.
 * Changing an individual still lives on the Users screen — this only explains
 * the baseline it starts from.
 */
const ROLES: Array<{ key: Role; label: string; hint: string }> = [
    { key: 'admin', label: 'مدير النظام', hint: 'كل شيء' },
    { key: 'manager', label: 'مدير', hint: 'التشغيل اليومي' },
    { key: 'technician', label: 'فني', hint: 'المهام الميدانية' },
]

export function RolesPage() {
    const { path } = useArea()
    const { data: catalogue, isLoading } = usePermissionCatalogue()

    return (
        <>
            <PageHeader
                title="الأدوار والصلاحيات"
                subtitle="ما يمنحه كل دور افتراضيًا — قبل أي استثناء على مستوى المستخدم"
                actions={
                    <Link to={path('/users')} className="btn-secondary text-xs">
                        <Users className="size-4" />
                        إدارة المستخدمين
                    </Link>
                }
            />

            <p className="mb-4 rounded-xl bg-navy-50 px-3 py-2.5 text-xs leading-relaxed text-navy-500">
                هذه صلاحيات الدور الافتراضية. لمنح مستخدم بعينه صلاحية إضافية أو منعها،
                افتح ملفه من شاشة المستخدمين — الاستثناء يبقى معه ولا يتأثر بتغيير الدور.
            </p>

            {isLoading || !catalogue ? (
                <SkeletonCard />
            ) : (
                <div className="space-y-5">
                    {catalogue.groups.map((group) => (
                        <div
                            key={group.group}
                            className="overflow-hidden rounded-2xl border border-navy-100"
                        >
                            <div className="bg-navy-50 px-4 py-2.5 text-sm font-extrabold text-navy-800">
                                {group.group}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[420px] text-sm">
                                    <thead className="text-[11px] font-bold text-navy-400">
                                        <tr className="border-b border-navy-100">
                                            <th className="px-4 py-2 text-right">الصلاحية</th>
                                            {ROLES.map((role) => (
                                                <th key={role.key} className="w-28 px-2 py-2 text-center">
                                                    {role.label}
                                                    <span className="block text-[10px] font-medium text-navy-300">
                                                        {role.hint}
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.permissions.map((permission) => (
                                            <tr
                                                key={permission.key}
                                                className="border-b border-navy-100 last:border-0"
                                            >
                                                <td className="px-4 py-2.5 font-semibold text-navy-800">
                                                    {permission.label}
                                                    <span className="tabular block text-[10px] font-normal text-navy-300">
                                                        {permission.key}
                                                    </span>
                                                </td>
                                                {ROLES.map((role) => {
                                                    const granted = catalogue.defaults[role.key]?.includes(
                                                        permission.key,
                                                    )

                                                    return (
                                                        <td key={role.key} className="px-2 py-2.5 text-center">
                                                            {granted ? (
                                                                <Check className="mx-auto size-4 text-emerald-600" />
                                                            ) : (
                                                                <Minus className="mx-auto size-4 text-navy-200" />
                                                            )}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

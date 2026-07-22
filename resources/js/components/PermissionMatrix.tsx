import clsx from 'clsx'
import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { usePermissionCatalogue, useSavePermissions, useUserPermissions } from '@/lib/queries'
import type { User } from '@/types'

/**
 * What one user may do.
 *
 * Three states are shown, not two: on, off, and — the important one —
 * *inherited*. An administrator has to be able to tell a tick that came with
 * the role from a tick somebody set deliberately, because changing the role
 * later moves the first and leaves the second exactly where it is.
 */
export function PermissionMatrix({ user, onClose }: { user: User; onClose: () => void }) {
    const toast = useToast()
    const save = useSavePermissions(user.id)
    const { data: catalogue } = usePermissionCatalogue()
    const { data: current, isLoading } = useUserPermissions(user.id)

    const [draft, setDraft] = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (current) {
            const effective: Record<string, boolean> = {}

            for (const group of catalogue?.groups ?? []) {
                for (const permission of group.permissions) {
                    effective[permission.key] = current.effective.includes(permission.key)
                }
            }

            setDraft(effective)
        }
    }, [current, catalogue])

    if (isLoading || !catalogue || !current) return <SkeletonCard />

    const isDefault = (key: string) => current.defaults.includes(key)
    const changed = (key: string) => draft[key] !== isDefault(key)

    return (
        <Modal
            open
            onClose={onClose}
            title={`صلاحيات ${user.name}`}
            description={`الدور «${user.role_label}» يمنح ما هو مُعلَّم تلقائيًا — والتعديل هنا استثناء عليه.`}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            try {
                                await save.mutateAsync({ permissions: draft })
                                toast.success('تم حفظ الصلاحيات.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر حفظ الصلاحيات.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-navy-50 p-3">
                    <p className="text-[11px] text-navy-500">
                        الأزرق = ممنوح بالدور · الكهرماني = استثناء تم ضبطه يدويًا
                    </p>

                    <button
                        onClick={() => {
                            const reset: Record<string, boolean> = {}

                            for (const group of catalogue.groups) {
                                for (const permission of group.permissions) {
                                    reset[permission.key] = isDefault(permission.key)
                                }
                            }

                            setDraft(reset)
                        }}
                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-navy-600"
                    >
                        <RotateCcw className="size-3.5" />
                        إرجاع لصلاحيات الدور
                    </button>
                </div>

                {catalogue.groups.map((group) => (
                    <section key={group.group}>
                        <h3 className="mb-2 text-sm font-bold text-navy-800">{group.group}</h3>

                        <div className="space-y-1.5">
                            {group.permissions.map((permission) => {
                                const on = draft[permission.key] ?? false
                                const overridden = changed(permission.key)

                                return (
                                    <label
                                        key={permission.key}
                                        className={clsx(
                                            'flex cursor-pointer items-center gap-3 rounded-xl p-3 transition',
                                            overridden ? 'bg-amber-50' : 'bg-navy-50',
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={on}
                                            onChange={(e) =>
                                                setDraft((current) => ({
                                                    ...current,
                                                    [permission.key]: e.target.checked,
                                                }))
                                            }
                                            className="size-4"
                                        />

                                        <span className="min-w-0 flex-1">
                                            <span
                                                className={clsx(
                                                    'block text-sm font-semibold',
                                                    on ? 'text-navy-900' : 'text-navy-400',
                                                )}
                                            >
                                                {permission.label}
                                            </span>
                                            <span className="tabular block text-[10px] text-navy-400" dir="ltr">
                                                {permission.key}
                                            </span>
                                        </span>

                                        {overridden && (
                                            <span className="badge shrink-0 bg-amber-100 text-amber-800">
                                                {on ? 'مُضاف' : 'مسحوب'}
                                            </span>
                                        )}
                                    </label>
                                )
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </Modal>
    )
}

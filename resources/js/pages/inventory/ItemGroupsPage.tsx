import { Boxes, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useDeleteItemGroup, useItemGroups, useSaveItemGroup } from '@/lib/queries'
import type { ItemGroup } from '@/types'

/** The six named colours the API allows, with a swatch for each. */
const COLOURS: Record<string, string> = {
    amber: '#f59e0b',
    blue: '#3b82f6',
    emerald: '#10b981',
    violet: '#8b5cf6',
    red: '#ef4444',
    slate: '#64748b',
}

/**
 * The groups items are filed under — batteries, spare parts, and whatever the
 * store adds. Add, rename, or retire a group; a group with items in it cannot
 * be deleted, only stopped.
 */
export function ItemGroupsPage() {
    const toast = useToast()
    const { data: groups, isLoading } = useItemGroups()
    const remove = useDeleteItemGroup()
    const [editing, setEditing] = useState<ItemGroup | null>(null)
    const [creating, setCreating] = useState(false)

    return (
        <>
            <PageHeader
                title="المجموعات / الماركات"
                subtitle="تصنيف الأصناف"
                actions={
                    <Button icon={Plus} onClick={() => setCreating(true)}>
                        مجموعة جديدة
                    </Button>
                }
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !groups?.length ? (
                <EmptyState icon={Boxes} title="لا توجد مجموعات" />
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {groups.map((group) => (
                        <div key={group.id} className="card flex items-center gap-3 p-3.5">
                            <span
                                className="size-9 shrink-0 rounded-lg"
                                style={{ background: COLOURS[group.colour ?? ''] ?? '#e2e8f0' }}
                            />
                            <button
                                onClick={() => setEditing(group)}
                                className="min-w-0 flex-1 text-right"
                            >
                                <p className="font-bold text-navy-900">{group.name}</p>
                                <p className="text-[11px] text-navy-400">
                                    {group.items_count} صنف
                                    {group.is_system && ' · أساسية'}
                                    {!group.is_active && ' · موقوفة'}
                                </p>
                            </button>
                            {!group.is_system && group.items_count === 0 && (
                                <button
                                    onClick={async () => {
                                        try {
                                            await remove.mutateAsync(group.id)
                                            toast.success('تم الحذف.')
                                        } catch (caught) {
                                            toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                                        }
                                    }}
                                    className="tap grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600"
                                    aria-label="حذف"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {(creating || editing) && (
                <GroupDialog
                    group={editing ?? undefined}
                    onClose={() => {
                        setCreating(false)
                        setEditing(null)
                    }}
                />
            )}
        </>
    )
}

function GroupDialog({ group, onClose }: { group?: ItemGroup; onClose: () => void }) {
    const toast = useToast()
    const save = useSaveItemGroup()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState({
        name: group?.name ?? '',
        colour: group?.colour ?? 'slate',
        sort: group ? String(group.sort) : '0',
        is_active: group?.is_active ?? true,
    })

    return (
        <Modal
            open
            onClose={onClose}
            title={group ? `تعديل — ${group.name}` : 'مجموعة جديدة'}
            size="sm"
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
                                    id: group?.id,
                                    name: form.name,
                                    colour: form.colour,
                                    sort: Number(form.sort) || 0,
                                    is_active: form.is_active,
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
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الاسم" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                    <Field label="اللون" error={errors.colour}>
                        <Select
                            value={form.colour}
                            onChange={(e) => setForm((f) => ({ ...f, colour: e.target.value }))}
                        >
                            <option value="slate">رمادي</option>
                            <option value="blue">أزرق</option>
                            <option value="emerald">أخضر</option>
                            <option value="amber">كهرماني</option>
                            <option value="violet">بنفسجي</option>
                            <option value="red">أحمر</option>
                        </Select>
                    </Field>
                    <Field label="الترتيب" error={errors.sort}>
                        <Input
                            type="number"
                            value={form.sort}
                            onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))}
                        />
                    </Field>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-navy-700">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                        className="size-4 accent-brand-600"
                    />
                    نشطة
                </label>
            </div>
        </Modal>
    )
}

import { Pencil, Plus, Star, Trash2, Warehouse as WarehouseIcon } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatQty } from '@/lib/domain'
import { useDeleteWarehouse, useSaveWarehouse, useWarehouses } from '@/lib/queries'
import type { WarehouseSummary } from '@/types'

/**
 * The company's stores. Technician custody appears here too, read-only —
 * it is a stock location, but it is filled by handing goods over rather than
 * by editing a form.
 */
export function WarehousesPage() {
    const toast = useToast()
    const { data: warehouses, isLoading } = useWarehouses()
    const remove = useDeleteWarehouse()

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<WarehouseSummary | undefined>()
    const [deleting, setDeleting] = useState<WarehouseSummary | undefined>()

    const stores = warehouses?.filter((w) => w.type === 'store') ?? []
    const vans = warehouses?.filter((w) => w.type === 'van') ?? []

    if (isLoading) return <SkeletonCard />

    return (
        <>
            <div className="mb-4">
                <Button
                    icon={Plus}
                    onClick={() => {
                        setEditing(undefined)
                        setFormOpen(true)
                    }}
                >
                    مخزن جديد
                </Button>
            </div>

            <section>
                <h2 className="mb-2 text-sm font-bold text-navy-700">المخازن</h2>

                {stores.length === 0 ? (
                    <EmptyState icon={WarehouseIcon} title="لا توجد مخازن" />
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {stores.map((warehouse) => (
                            <div key={warehouse.id} className="card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1.5 truncate font-bold text-navy-900">
                                            {warehouse.name}
                                            {warehouse.is_default && (
                                                <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                                            )}
                                        </p>
                                        {warehouse.address && (
                                            <p className="truncate text-xs text-navy-400">
                                                {warehouse.address}
                                            </p>
                                        )}
                                        {warehouse.keeper && (
                                            <p className="text-xs text-navy-400">
                                                أمين المخزن: {warehouse.keeper}
                                            </p>
                                        )}
                                    </div>

                                    <p className="tabular shrink-0 text-lg font-extrabold text-brand-600">
                                        {formatQty(warehouse.total_qty)}
                                    </p>
                                </div>

                                <div className="mt-3 flex gap-1 border-t border-navy-100 pt-3">
                                    <Button
                                        variant="ghost"
                                        icon={Pencil}
                                        className="text-xs"
                                        onClick={() => {
                                            setEditing(warehouse)
                                            setFormOpen(true)
                                        }}
                                    >
                                        تعديل
                                    </Button>

                                    {!warehouse.is_default && (
                                        <Button
                                            variant="ghost"
                                            icon={Trash2}
                                            className="text-xs text-red-600"
                                            onClick={() => setDeleting(warehouse)}
                                        >
                                            حذف
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {vans.length > 0 && (
                <section className="mt-6">
                    <h2 className="mb-2 text-sm font-bold text-navy-700">عهد الفنيين</h2>
                    <p className="mb-2 text-xs text-navy-400">
                        تُملأ بتسليم العهدة وتُفرَّغ بصرف القطع على المهام — لا تُحرَّر يدويًا.
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {vans.map((warehouse) => (
                            <div key={warehouse.id} className="card p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-navy-900">
                                            {warehouse.holder ?? warehouse.name}
                                        </p>
                                        <p className="text-xs text-navy-400">{warehouse.type_label}</p>
                                    </div>
                                    <p className="tabular shrink-0 text-lg font-extrabold text-brand-600">
                                        {formatQty(warehouse.total_qty)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {formOpen && (
                <StoreForm
                    key={editing?.id ?? 'new'}
                    warehouse={editing}
                    onClose={() => setFormOpen(false)}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(undefined)}
                onConfirm={async () => {
                    if (!deleting) return

                    try {
                        await remove.mutateAsync(deleting.id)
                        toast.success('تم حذف المخزن.')
                        setDeleting(undefined)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر حذف المخزن.'))
                    }
                }}
                title="حذف المخزن"
                message={`سيتم حذف «${deleting?.name}». المخازن التي بها رصيد لا يمكن حذفها.`}
                confirmLabel="حذف"
                loading={remove.isPending}
                danger
            />
        </>
    )
}

function StoreForm({
    warehouse,
    onClose,
}: {
    warehouse?: WarehouseSummary
    onClose: () => void
}) {
    const toast = useToast()
    const save = useSaveWarehouse(warehouse?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [name, setName] = useState(warehouse?.name ?? '')
    const [address, setAddress] = useState(warehouse?.address ?? '')
    const [keeper, setKeeper] = useState(warehouse?.keeper ?? '')
    const [makeDefault, setMakeDefault] = useState(false)

    return (
        <Modal
            open
            onClose={onClose}
            title={warehouse ? `تعديل ${warehouse.name}` : 'مخزن جديد'}
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
                                    name,
                                    address: address || null,
                                    keeper: keeper || null,
                                    make_default: makeDefault,
                                })
                                toast.success(warehouse ? 'تم حفظ المخزن.' : 'تم فتح المخزن.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر حفظ المخزن.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="اسم المخزن" required error={errors.name}>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="مخزن الإسكندرية"
                    />
                </Field>

                <Field label="العنوان" error={errors.address}>
                    <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
                </Field>

                <Field label="أمين المخزن" error={errors.keeper}>
                    <Input value={keeper} onChange={(e) => setKeeper(e.target.value)} />
                </Field>

                {!warehouse?.is_default && (
                    <label className="flex items-start gap-2 text-sm font-semibold text-navy-700">
                        <input
                            type="checkbox"
                            checked={makeDefault}
                            onChange={(e) => setMakeDefault(e.target.checked)}
                            className="mt-0.5 size-4 rounded border-navy-300"
                        />
                        <span>
                            اجعله المخزن الافتراضي
                            <span className="block text-xs font-normal text-navy-400">
                                الوارد يدخل إليه ويُصرف منه ما لم يُحدَّد غير ذلك
                            </span>
                        </span>
                    </label>
                )}
            </div>
        </Modal>
    )
}

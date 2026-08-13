import { useMemo, useState } from 'react'
import { Banknote, Pencil, Printer, RotateCcw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DataTable } from '@/components/ViewToggle'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, PageHeader, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { formatMoney } from '@/lib/domain'
import { formatSmart } from '@/lib/format'
import {
    useCashMovements,
    useDeleteCashMovement,
    useReverseSupplierPayment,
    useUpdateCashMovement,
} from '@/lib/queries'
import { useArea } from '@/lib/nav'
import type { CashMovementRow } from '@/types'

/**
 * Money out — supplier payments, expenses and advances, presented as a
 * voucher register. Manual vouchers can be corrected or deleted; supplier
 * payments remain immutable and are cancelled by an auditable reverse entry.
 */
export function PaymentsOutPage() {
    const { path } = useArea()
    const toast = useToast()
    const { data, isLoading } = useCashMovements({ per_page: 80 })
    const remove = useDeleteCashMovement()
    const reverseSupplier = useReverseSupplierPayment()
    const [editing, setEditing] = useState<CashMovementRow | null>(null)
    const [deleting, setDeleting] = useState<CashMovementRow | null>(null)
    const [reversingSupplier, setReversingSupplier] = useState<CashMovementRow | null>(null)

    const rows = useMemo(() => (data ?? []).filter((movement) => movement.direction === 'out'), [data])
    const total = useMemo(() => rows.reduce((sum, movement) => sum + movement.amount, 0), [rows])

    return (
        <>
            <PageHeader
                title="سند صرف"
                subtitle={rows.length ? `${rows.length} سند · ${formatMoney(total)}` : 'المدفوعات والمصروفات'}
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={Banknote}
                    title="لا توجد سندات صرف"
                    description="مدفوعات الموردين والمصروفات والتحويلات الصادرة تظهر هنا."
                />
            ) : (
                <DataTable
                    minWidth="70rem"
                    headers={[
                        { label: 'الرقم', className: 'w-24' },
                        { label: 'النوع', className: 'w-32' },
                        'الجهة / البيان',
                        { label: 'الخزينة', className: 'w-36' },
                        { label: 'التاريخ', className: 'w-36' },
                        { label: 'المبلغ', className: 'w-32 text-end' },
                        { label: 'الإجراءات', className: 'w-36 text-center' },
                    ]}
                >
                    {rows.map((movement) => {
                        const manualVoucher = ['expense', 'external_deposit'].includes(movement.source)
                        const supplierVoucher = movement.source === 'supplier_payment'
                        const statement = movement.customer ?? movement.category ?? movement.note ?? '—'

                        return (
                            <tr key={movement.id} className="border-t border-navy-100 hover:bg-navy-50/60">
                                <td className="tabular px-3 py-2.5 font-bold text-brand-600">#{movement.id}</td>
                                <td className="px-3 py-2.5">
                                    <span className="badge bg-navy-100 text-navy-600">{movement.source_label}</span>
                                </td>
                                <td className="max-w-sm px-3 py-2.5">
                                    <p className="truncate font-semibold text-navy-800" title={statement}>
                                        {statement}
                                    </p>
                                    {movement.actor && (
                                        <p className="mt-0.5 truncate text-[11px] text-navy-400">{movement.actor}</p>
                                    )}
                                </td>
                                <td className="px-3 py-2.5 text-navy-600">{movement.box ?? '—'}</td>
                                <td className="tabular px-3 py-2.5 text-navy-600">
                                    {movement.created_at ? formatSmart(movement.created_at) : '—'}
                                </td>
                                <td className="tabular px-3 py-2.5 text-end font-bold text-red-600">
                                    −{formatMoney(movement.amount)}
                                </td>
                                <td className="px-3 py-2.5">
                                    <div className="flex items-center justify-center gap-1">
                                        {manualVoucher && (
                                            <>
                                                <Link
                                                    to={path(`/print/cash-vouchers/${movement.id}`)}
                                                    target="_blank"
                                                    className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                                    aria-label="طباعة سند الصرف"
                                                    title="طباعة"
                                                >
                                                    <Printer className="size-4" />
                                                </Link>
                                                <button
                                                    onClick={() => setEditing(movement)}
                                                    className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                                    aria-label="تعديل سند الصرف"
                                                    title="تعديل"
                                                >
                                                    <Pencil className="size-4" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleting(movement)}
                                                    className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                                    aria-label="حذف سند الصرف"
                                                    title="حذف"
                                                >
                                                    <Trash2 className="size-4" />
                                                </button>
                                            </>
                                        )}
                                        {supplierVoucher && movement.supplier_payment_id && !movement.supplier_payment_is_cancelled && (
                                            <>
                                                <Link
                                                    to={path(`/print/payment-vouchers/${movement.supplier_payment_id}`)}
                                                    target="_blank"
                                                    className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                                                    aria-label="طباعة سند صرف المورد"
                                                    title="طباعة"
                                                >
                                                    <Printer className="size-4" />
                                                </Link>
                                                <button
                                                    onClick={() => setReversingSupplier(movement)}
                                                    className="tap grid size-8 place-items-center rounded-lg text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                                    aria-label="إلغاء سند صرف المورد"
                                                    title="إلغاء بقيد عكسي"
                                                >
                                                    <RotateCcw className="size-4" />
                                                </button>
                                            </>
                                        )}
                                        {supplierVoucher && movement.supplier_payment_is_cancelled && (
                                            <span className="badge bg-red-50 text-red-600">ملغى</span>
                                        )}
                                        {!manualVoucher && !(supplierVoucher && movement.supplier_payment_id) && (
                                            <span className="text-xs text-navy-300">—</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </DataTable>
            )}

            {editing && <EditCashVoucherModal movement={editing} onClose={() => setEditing(null)} />}

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                onConfirm={async () => {
                    if (!deleting) return
                    try {
                        await remove.mutateAsync(deleting.id)
                        toast.success('تم حذف السند والقيود المرتبطة به.')
                        setDeleting(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر حذف السند.'))
                    }
                }}
                title="حذف سند الصرف"
                message={`سيُحذف سند ${deleting ? `#${deleting.id}` : ''} والقيود المرتبطة به. لا يمكن حذف سند تمّت تسويته.`}
                confirmLabel="حذف السند"
                loading={remove.isPending}
                danger
            />

            <ConfirmDialog
                open={Boolean(reversingSupplier)}
                onClose={() => setReversingSupplier(null)}
                onConfirm={async () => {
                    if (!reversingSupplier?.supplier_payment_id) return
                    try {
                        await reverseSupplier.mutateAsync(reversingSupplier.supplier_payment_id)
                        toast.success('تم إلغاء سند المورد بقيد عكسي.')
                        setReversingSupplier(null)
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر إلغاء سند المورد.'))
                    }
                }}
                title="إلغاء سند صرف المورد"
                message={`سيُعكس ${reversingSupplier ? formatMoney(reversingSupplier.amount) : ''} إلى الخزينة بقيد عكسي. لا يُحذف السجل المحاسبي.`}
                confirmLabel="إلغاء السند"
                loading={reverseSupplier.isPending}
                danger
            />
        </>
    )
}

/** A manual voucher keeps its amount, date and cash box immutable after posting. */
function EditCashVoucherModal({ movement, onClose }: { movement: CashMovementRow; onClose: () => void }) {
    const toast = useToast()
    const update = useUpdateCashMovement()
    const [category, setCategory] = useState(movement.category ?? '')
    const [note, setNote] = useState(movement.note ?? '')

    return (
        <Modal
            open
            onClose={onClose}
            title={`تعديل سند #${movement.id}`}
            description={`${formatMoney(movement.amount)} — لا يمكن تغيير القيمة أو التاريخ أو الخزينة بعد ترحيل السند.`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={update.isPending}
                        onClick={async () => {
                            try {
                                await update.mutateAsync({
                                    id: movement.id,
                                    category: category || null,
                                    note: note || null,
                                })
                                toast.success('تم حفظ التعديل.')
                                onClose()
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر حفظ التعديل.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="التصنيف">
                    <Input value={category} onChange={(event) => setCategory(event.target.value)} />
                </Field>
                <Field label="البيان">
                    <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

import clsx from 'clsx'
import { Banknote, HandCoins, HardDrive, Package, Undo2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Field, Input, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney, formatQty } from '@/lib/domain'
import {
    useAssets,
    useCashBoxes,
    useCustody,
    useCustodyCash,
    useCustodyDevice,
    useTechnicians,
} from '@/lib/queries'
import type { CustodyStatement } from '@/types'

/**
 * What each technician is answerable for: money, stock and devices in one
 * place. Three separate screens would answer three questions; a manager only
 * ever asks one — "what is محمود holding".
 */
export function CustodyPage() {
    const { data: statements, isLoading } = useCustody()
    const [cashFor, setCashFor] = useState<CustodyStatement | null>(null)
    const [deviceOpen, setDeviceOpen] = useState(false)

    if (isLoading) return <SkeletonCard />

    if (!statements?.length) {
        return (
            <EmptyState
                icon={HandCoins}
                title="لا يوجد فنيون"
                description="أضف فنيين لتتمكن من تسليم العهد."
            />
        )
    }

    const totalOut = statements.reduce((sum, s) => sum + s.total_value, 0)

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-navy-500">
                    إجمالي العهد المفتوحة:{' '}
                    <strong className="tabular text-navy-900">{formatMoney(totalOut)}</strong>
                </p>

                <Button variant="secondary" icon={HardDrive} onClick={() => setDeviceOpen(true)}>
                    تسليم جهاز
                </Button>
            </div>

            <div className="space-y-3">
                {statements.map((statement) => (
                    <div key={statement.technician.id} className="card p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-bold text-navy-900">{statement.technician.name}</p>
                                {statement.technician.job_title && (
                                    <p className="text-xs text-navy-400">
                                        {statement.technician.job_title}
                                    </p>
                                )}
                            </div>

                            <div className="shrink-0 text-left">
                                <p className="text-[10px] font-bold text-navy-400">إجمالي العهدة</p>
                                <p
                                    className={clsx(
                                        'tabular font-extrabold',
                                        statement.total_value > 0 ? 'text-navy-900' : 'text-navy-300',
                                    )}
                                >
                                    {formatMoney(statement.total_value)}
                                </p>
                            </div>
                        </div>

                        {/* The three forms, side by side rather than stacked —
                            the comparison between them is the point. */}
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <Slot
                                icon={Banknote}
                                label="نقدية"
                                value={formatMoney(statement.cash.balance)}
                                active={statement.cash.balance > 0}
                            />
                            <Slot
                                icon={Package}
                                label={`${statement.stock.lines.length} صنف`}
                                value={formatMoney(statement.stock.value)}
                                active={statement.stock.lines.length > 0}
                            />
                            <Slot
                                icon={HardDrive}
                                label="أجهزة"
                                value={String(statement.devices.length)}
                                active={statement.devices.length > 0}
                            />
                        </div>

                        {statement.stock.lines.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {statement.stock.lines.map((line) => (
                                    <span
                                        key={line.item_id}
                                        className="rounded-lg bg-navy-50 px-2 py-0.5 text-[11px] text-navy-600"
                                    >
                                        {line.name}: {formatQty(line.qty)} {line.unit}
                                    </span>
                                ))}
                            </div>
                        )}

                        {statement.devices.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                                {statement.devices.map((device) => (
                                    <DeviceRow key={device.id} device={device} />
                                ))}
                            </div>
                        )}

                        <div className="mt-3 border-t border-navy-100 pt-3">
                            <Button
                                variant="ghost"
                                icon={Wallet}
                                className="text-xs"
                                onClick={() => setCashFor(statement)}
                            >
                                عهدة نقدية
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {cashFor && <CashDialog statement={cashFor} onClose={() => setCashFor(null)} />}
            {deviceOpen && <DeviceDialog onClose={() => setDeviceOpen(false)} />}
        </>
    )
}

function Slot({
    icon: Icon,
    label,
    value,
    active,
}: {
    icon: typeof Banknote
    label: string
    value: string
    active: boolean
}) {
    return (
        <div
            className={clsx(
                'rounded-xl p-2.5',
                active ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-navy-50',
            )}
        >
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-navy-400">
                <Icon className="size-3.5" />
                {label}
            </p>
            <p
                className={clsx(
                    'tabular mt-0.5 font-bold',
                    active ? 'text-navy-900' : 'text-navy-300',
                )}
            >
                {value}
            </p>
        </div>
    )
}

function DeviceRow({ device }: { device: CustodyStatement['devices'][number] }) {
    const toast = useToast()
    const action = useCustodyDevice()

    return (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-navy-50 p-2.5">
            <div className="min-w-0">
                <p className="truncate text-xs font-bold text-navy-800">
                    {device.asset}
                    {device.serial && (
                        <span className="tabular mr-1.5 font-normal text-navy-400">
                            {device.serial}
                        </span>
                    )}
                </p>
                <p className="text-[11px] text-navy-400">
                    {device.reason_label}
                    {device.taken_from && ` · من ${device.taken_from}`}
                    {' · '}
                    <span className={clsx(device.days_held > 14 && 'font-bold text-amber-600')}>
                        {device.days_held} يوم
                    </span>
                </p>
            </div>

            <button
                onClick={async () => {
                    try {
                        await action.mutateAsync({ id: device.id, action: 'return' })
                        toast.success('تم تسجيل التسليم.')
                    } catch (caught) {
                        toast.error(errorMessage(caught, 'تعذّر التسجيل.'))
                    }
                }}
                className="tap grid shrink-0 place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-white hover:text-emerald-600"
                aria-label="تسليم الجهاز"
            >
                <Undo2 className="size-4" />
            </button>
        </div>
    )
}

/* ── Handing money out and taking it back ────────────────── */

function CashDialog({
    statement,
    onClose,
}: {
    statement: CustodyStatement
    onClose: () => void
}) {
    const toast = useToast()
    const cash = useCustodyCash()
    const { data: boxes } = useCashBoxes()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [direction, setDirection] = useState<'advance' | 'return'>('advance')
    const [amount, setAmount] = useState('')
    const [boxId, setBoxId] = useState('')
    const [note, setNote] = useState('')

    // A technician's own float is not somewhere to move money from or to.
    const companyBoxes = boxes?.filter((box) => box.type !== 'custody') ?? []

    return (
        <Modal
            open
            onClose={onClose}
            title={`عهدة ${statement.technician.name} النقدية`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={cash.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={cash.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await cash.mutateAsync({
                                    user_id: statement.technician.id,
                                    cash_box_id: Number(boxId || companyBoxes[0]?.id),
                                    amount: Number(amount),
                                    direction,
                                    note: note || null,
                                })
                                toast.success(
                                    direction === 'advance' ? 'تم صرف العهدة.' : 'تم رد العهدة.',
                                )
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تنفيذ العملية.'))
                            }
                        }}
                    >
                        تنفيذ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-4 text-sm">
                    <span className="text-navy-500">الرصيد الحالي معه</span>
                    <span className="tabular font-extrabold text-navy-900">
                        {formatMoney(statement.cash.balance)}
                    </span>
                </div>

                <Field label="العملية" required>
                    <Select
                        value={direction}
                        onChange={(e) => setDirection(e.target.value as 'advance' | 'return')}
                    >
                        <option value="advance">صرف عهدة للفني</option>
                        <option value="return">رد عهدة من الفني</option>
                    </Select>
                </Field>

                <Field label="المبلغ" required error={errors.amount}>
                    <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <Field
                    label={direction === 'advance' ? 'من خزينة' : 'إلى خزينة'}
                    required
                    error={errors.cash_box_id}
                >
                    <Select value={boxId} onChange={(e) => setBoxId(e.target.value)}>
                        {companyBoxes.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.name} ({formatMoney(box.balance)})
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="ملاحظات" error={errors.note}>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </Field>
            </div>
        </Modal>
    )
}

/* ── Handing a device over ───────────────────────────────── */

function DeviceDialog({ onClose }: { onClose: () => void }) {
    const toast = useToast()
    const action = useCustodyDevice()
    const { data: technicians } = useTechnicians()
    const { data: assetPage } = useAssets({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [assetId, setAssetId] = useState('')
    const [userId, setUserId] = useState('')
    const [reason, setReason] = useState('workshop_repair')
    const [takenFrom, setTakenFrom] = useState('')
    const [note, setNote] = useState('')

    return (
        <Modal
            open
            onClose={onClose}
            title="تسليم جهاز لعهدة فني"
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={action.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={action.isPending}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await action.mutateAsync({
                                    action: 'take',
                                    payload: {
                                        asset_id: Number(assetId),
                                        user_id: Number(userId),
                                        reason,
                                        taken_from: takenFrom || null,
                                        note: note || null,
                                    },
                                })
                                toast.success('تم تسجيل العهدة.')
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر تسجيل العهدة.'))
                            }
                        }}
                    >
                        تسجيل
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="الجهاز" required error={errors.asset_id}>
                    <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                        <option value="">— اختر الجهاز —</option>
                        {assetPage?.data.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                                {asset.label}
                                {asset.customer ? ` — ${asset.customer.name}` : ''}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="الفني" required error={errors.user_id}>
                    <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                        <option value="">— اختر الفني —</option>
                        {technicians?.map((technician) => (
                            <option key={technician.id} value={technician.id}>
                                {technician.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="السبب" required error={errors.reason}>
                    <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                        <option value="workshop_repair">إصلاح بالورشة</option>
                        <option value="installation">للتركيب</option>
                        <option value="inspection">للفحص</option>
                        <option value="other">أخرى</option>
                    </Select>
                </Field>

                <Field label="مأخوذ من" error={errors.taken_from} hint="الموقع أو المخزن">
                    <Input value={takenFrom} onChange={(e) => setTakenFrom(e.target.value)} />
                </Field>

                <Field label="ملاحظات" error={errors.note}>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </Field>
            </div>
        </Modal>
    )
}

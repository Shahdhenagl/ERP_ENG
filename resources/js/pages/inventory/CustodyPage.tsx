import clsx from 'clsx'
import { tr } from '@/lib/i18n'
import { Banknote, HandCoins, HardDrive, Package, Undo2, Wallet } from 'lucide-react'
import { useState } from 'react'
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
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatMoney, formatQty } from '@/lib/domain'
import { useAssets, useCashBoxes, useCustody, useCustodyCash, useCustodyDevice, useUsers } from '@/lib/queries'
import type { CustodyStatement } from '@/types'

/**
 * What each technician is answerable for: money, stock and devices in one
 * place. Three separate screens would answer three questions; a manager only
 * ever asks one — "what is محمود holding".
 */
export function CustodyPage() {
    const [view, setView] = useViewMode('custody')
    const { data: statements, isLoading } = useCustody()
    // A card's holder when topping up their float; a standalone advance to anyone
    // when null-but-open.
    const [cashFor, setCashFor] = useState<CustodyStatement | null>(null)
    const [cashOpen, setCashOpen] = useState(false)
    const [deviceOpen, setDeviceOpen] = useState(false)

    const totalOut = (statements ?? []).reduce((sum, s) => sum + s.total_value, 0)

    return (
        <>
            {/* The two ways custody goes out live in the header, always reachable —
                a float to anyone on staff, or a device — so a first advance never
                depends on the person already having a card. */}
            <PageHeader
                title="عهد الموظفين"
                subtitle={`إجمالي العهد المفتوحة: ${formatMoney(totalOut)}`}
                actions={
                    <>
                        <ViewToggle view={view} onChange={setView} />
                        <Button icon={Wallet} onClick={() => setCashOpen(true)}>
                            {tr('صرف عهدة نقدية')}
                        </Button>
                        <Button
                            variant="secondary"
                            icon={HardDrive}
                            onClick={() => setDeviceOpen(true)}
                        >
                            {tr('تسليم جهاز')}
                        </Button>
                    </>
                }
            />

            {isLoading ? (
                <SkeletonCard />
            ) : !statements?.length ? (
                <EmptyState
                    icon={HandCoins}
                    title="لا توجد عهد مفتوحة"
                    description="اصرف عهدة نقدية أو سلّم جهازًا لأي موظف ليظهر هنا بما في عهدته."
                />
            ) : view === 'table' ? (
                // One row per person, which is the comparison a custody list is
                // read for; what is inside each holding stays on the cards.
                <DataTable
                    minWidth="52rem"
                    headers={[
                        'الموظف',
                        { label: 'نقدية', className: 'w-32 text-end' },
                        { label: 'أصناف', className: 'w-20' },
                        { label: 'قيمة المخزون', className: 'w-32 text-end' },
                        { label: 'أجهزة', className: 'w-20' },
                        { label: 'إجمالي العهدة', className: 'w-32 text-end' },
                        { label: '', className: 'w-12' },
                    ]}
                >
                    {statements.map((statement) => (
                        <tr
                            key={statement.technician.id}
                            className="border-t border-navy-100 hover:bg-navy-50/60"
                        >
                            <td className="px-3 py-2.5">
                                <p className="font-bold text-navy-900">
                                    {statement.technician.name}
                                </p>
                                {statement.technician.job_title && (
                                    <p className="text-[11px] text-navy-400">
                                        {statement.technician.job_title}
                                    </p>
                                )}
                            </td>
                            <td
                                className={clsx(
                                    'tabular px-3 py-2.5 text-end',
                                    statement.cash.balance > 0
                                        ? 'font-bold text-navy-900'
                                        : 'text-navy-300',
                                )}
                            >
                                {formatMoney(statement.cash.balance)}
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600">
                                {statement.stock.lines.length}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end text-navy-600">
                                {formatMoney(statement.stock.value)}
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-600">
                                {statement.devices.length}
                            </td>
                            <td className="tabular px-3 py-2.5 text-end font-extrabold text-navy-900">
                                {formatMoney(statement.total_value)}
                            </td>
                            <td className="px-3 py-2.5">
                                <button
                                    onClick={() => setCashFor(statement)}
                                    className="tap grid place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-navy-50 hover:text-brand-600"
                                    aria-label="عهدة نقدية"
                                >
                                    <Wallet className="size-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                </DataTable>
            ) : (
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
                                {tr('عهدة نقدية')}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
            )}

            {(cashOpen || cashFor) && (
                <CashDialog
                    statement={cashFor}
                    onClose={() => {
                        setCashOpen(false)
                        setCashFor(null)
                    }}
                />
            )}
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
                className="tap grid shrink-0 place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-surface hover:text-emerald-600"
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
    statement: CustodyStatement | null
    onClose: () => void
}) {
    const toast = useToast()
    const cash = useCustodyCash()
    const { data: boxes } = useCashBoxes()
    // The recipient is only picked for a fresh advance; a card already names them.
    const { data: userPage } = useUsers(statement ? {} : { active_only: 1, per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const holder = statement?.technician
    const [userId, setUserId] = useState(holder ? String(holder.id) : '')
    // A fresh advance only ever hands money out; a return is against a held float.
    const [direction, setDirection] = useState<'advance' | 'return'>('advance')
    const [amount, setAmount] = useState('')
    const [boxId, setBoxId] = useState('')
    const [note, setNote] = useState('')

    // A custody float is not somewhere to move company money from or to.
    const companyBoxes = boxes?.filter((box) => box.type !== 'custody') ?? []

    return (
        <Modal
            open
            onClose={onClose}
            title={holder ? `عهدة ${holder.name} النقدية` : 'صرف عهدة نقدية'}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={cash.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button
                        loading={cash.isPending}
                        disabled={!userId || !amount}
                        onClick={async () => {
                            setErrors({})

                            try {
                                await cash.mutateAsync({
                                    user_id: Number(userId),
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
                        {tr('تنفيذ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {holder ? (
                    <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-4 text-sm">
                        <span className="text-navy-500">الرصيد الحالي معه</span>
                        <span className="tabular font-extrabold text-navy-900">
                            {formatMoney(statement!.cash.balance)}
                        </span>
                    </div>
                ) : (
                    // Any active user, whatever their role, may be given a float.
                    <Field label="الموظف" required error={errors.user_id}>
                        <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                            <option value="">— اختر الموظف —</option>
                            {userPage?.data.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name}
                                    {(user.effective_role_label ?? user.position_label ?? user.role_label) ? ` — ${user.effective_role_label ?? user.position_label ?? user.role_label}` : ''}
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}

                {holder && (
                    <Field label="العملية" required>
                        <Select
                            value={direction}
                            onChange={(e) => setDirection(e.target.value as 'advance' | 'return')}
                        >
                            <option value="advance">صرف عهدة</option>
                            <option value="return">رد عهدة</option>
                        </Select>
                    </Field>
                )}

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
    const { data: userPage } = useUsers({ active_only: 1, per_page: 200 })
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
            title="تسليم جهاز لعهدة موظف"
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={action.isPending}>
                        {tr('إلغاء')}
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
                        {tr('تسجيل')}
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

                <Field label="الموظف" required error={errors.user_id}>
                    <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                        <option value="">— اختر الموظف —</option>
                        {userPage?.data.map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.name}
                                {(user.effective_role_label ?? user.position_label ?? user.role_label) ? ` — ${user.effective_role_label ?? user.position_label ?? user.role_label}` : ''}
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

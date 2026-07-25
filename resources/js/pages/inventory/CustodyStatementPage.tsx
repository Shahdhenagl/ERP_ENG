import { HardDrive, Package, Receipt, Users, Wallet } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, Field, PageHeader, Select, SkeletonCard } from '@/components/ui'
import { formatMoney, formatQty } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { useCustody, useCustodyStatement } from '@/lib/queries'

/**
 * One employee's whole custody account: the cash float, the stock in their van,
 * and the devices in their hands — with the single figure for how much the
 * company is exposed with them.
 */
export function CustodyStatementPage() {
    const { data: statements } = useCustody()
    const [userId, setUserId] = useState<number | null>(null)

    const { data, isLoading } = useCustodyStatement(userId ?? undefined)

    return (
        <>
            <PageHeader title="كشف حساب الموظف" subtitle="النقدية والمخزون والأجهزة في عهدة الموظف" />

            <div className="mb-4 max-w-md">
                <Field label="الموظف">
                    <Select
                        value={userId ?? ''}
                        onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">اختر الموظف…</option>
                        {statements?.map((s) => (
                            <option key={s.technician.id} value={s.technician.id}>
                                {s.technician.name}
                            </option>
                        ))}
                    </Select>
                </Field>
            </div>

            {!userId ? (
                <EmptyState
                    icon={Users}
                    title="اختر موظفًا لعرض عهدته"
                    description="ستظهر النقدية والمخزون والأجهزة التي في عهدته وإجمالي المسؤولية."
                />
            ) : isLoading || !data ? (
                <SkeletonCard />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <Tile icon={Wallet} label="نقدية" value={formatMoney(data.cash.balance)} />
                        <Tile icon={Package} label="مخزون" value={formatMoney(data.stock.value)} />
                        <Tile icon={HardDrive} label="أجهزة" value={String(data.devices.length)} />
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-navy-50 px-4 py-3">
                        <span className="text-xs font-bold text-navy-400">إجمالي المسؤولية</span>
                        <span className="tabular text-lg font-extrabold text-navy-900">
                            {formatMoney(data.total_value)}
                        </span>
                    </div>

                    {Boolean(data.stock.lines.length) && (
                        <section>
                            <p className="mb-2 text-xs font-extrabold text-navy-400">المخزون في العهدة</p>
                            <div className="overflow-hidden rounded-2xl border border-navy-100">
                                {data.stock.lines.map((line) => (
                                    <div
                                        key={line.item_id}
                                        className="flex items-center justify-between gap-3 border-b border-navy-100 p-3 last:border-0"
                                    >
                                        <p className="truncate text-sm font-bold text-navy-900">{line.name}</p>
                                        <p className="tabular shrink-0 text-xs text-navy-500">
                                            {formatQty(line.qty)} {line.unit} · {formatMoney(line.value)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {Boolean(data.devices.length) && (
                        <section>
                            <p className="mb-2 text-xs font-extrabold text-navy-400">الأجهزة في العهدة</p>
                            <div className="space-y-2">
                                {data.devices.map((device) => (
                                    <div key={device.id} className="card p-3">
                                        <p className="truncate text-sm font-bold text-navy-900">
                                            {device.asset}
                                            {device.serial && (
                                                <span className="tabular mr-1.5 text-[11px] text-navy-400">
                                                    {device.serial}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-[11px] text-navy-400">
                                            {device.reason_label}
                                            {device.customer && ` · ${device.customer}`}
                                            {device.taken_at && ` · منذ ${formatDate(device.taken_at)}`}
                                            {typeof device.days_held === 'number' && ` · ${device.days_held} يوم`}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {Boolean(data.expenses?.length) && (
                        <section>
                            <p className="mb-2 text-xs font-extrabold text-navy-400">مصروفات العهدة</p>
                            <div className="space-y-2">
                                {data.expenses!.map((expense) => (
                                    <div
                                        key={expense.id}
                                        className="card flex items-center justify-between gap-3 p-3"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            {expense.receipt_url ? (
                                                <a
                                                    href={expense.receipt_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="shrink-0"
                                                >
                                                    <img
                                                        src={expense.receipt_url}
                                                        alt="إيصال"
                                                        className="size-12 rounded-lg border border-navy-200 object-cover"
                                                    />
                                                </a>
                                            ) : (
                                                <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-300">
                                                    <Receipt className="size-5" />
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-navy-900">
                                                    {expense.category ?? 'مصروف'}
                                                </p>
                                                <p className="truncate text-[11px] text-navy-400">
                                                    {formatDate(expense.created_at)}
                                                    {expense.note && ` · ${expense.note}`}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="tabular shrink-0 font-extrabold text-navy-900">
                                            {formatMoney(expense.amount)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </>
    )
}

function Tile({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Wallet
    label: string
    value: string
}) {
    return (
        <div className="card p-3">
            <Icon className="mx-auto size-5 text-navy-400" />
            <p className="mt-1 text-[10px] font-bold text-navy-400">{label}</p>
            <p className="tabular text-sm font-extrabold text-navy-900">{value}</p>
        </div>
    )
}

import clsx from 'clsx'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { PeriodPicker, usePeriod, type PeriodState } from '@/components/PeriodPicker'
import { SectionTabs } from '@/components/SectionTabs'
import { useToast } from '@/components/Toast'
import { Button, PageHeader } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/domain'
import { errorMessage } from '@/lib/api'
import { useAccountingSummary, useRepostLedger } from '@/lib/queries'

/**
 * The shell every accounting section sits in: the period they are all read
 * through, the headline figures, and a sub-nav.
 *
 * The period lives here rather than in each screen because a trial balance and
 * an income statement for two different windows, side by side in one module,
 * is a way to be quietly wrong about the month.
 */

interface AccountingContext {
    period: PeriodState
}

export function useAccounting(): AccountingContext {
    return useOutletContext<AccountingContext>()
}

const SECTIONS = [
    ['/accounting/accounts', 'دليل الحسابات'],
    ['/accounting/journal', 'القيود اليومية'],
    ['/accounting/ledger', 'الأستاذ العام'],
    ['/accounting/trial-balance', 'ميزان المراجعة'],
    ['/accounting/income-statement', 'قائمة الدخل'],
    ['/accounting/balance-sheet', 'الميزانية'],
    ['/accounting/cost-centers', 'مراكز التكلفة'],
] as const

export function AccountingLayout() {
    const period = usePeriod('year')
    const { data: summary } = useAccountingSummary(period.range)
    const { user } = useAuth()

    const unposted = summary
        ? summary.unposted.invoices +
          summary.unposted.cash_movements +
          summary.unposted.stock_movements
        : 0

    return (
        <>
            <PageHeader
                title="المحاسبة المالية"
                subtitle={summary ? `صافي الفترة ${formatMoney(summary.net_profit)}` : undefined}
            />

            <SectionTabs sections={SECTIONS} always />

            <PeriodPicker period={period} presets={['month', 'quarter', 'year', 'all']} />

            {summary && (
                <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="الإيرادات" value={formatMoney(summary.revenue)} tone="up" />
                    <Stat label="المصروفات" value={formatMoney(summary.expenses)} tone="down" />
                    <Stat
                        label="صافي الربح"
                        value={formatMoney(summary.net_profit)}
                        tone={summary.net_profit >= 0 ? 'up' : 'down'}
                    />
                    <Stat label="إجمالي الأصول" value={formatMoney(summary.assets)} tone="brand" />
                </div>
            )}

            {/* The ledger is derived from the documents, and a posting that
                failed is logged rather than thrown so operations never stop.
                That trade is only honest if the gap it can leave is visible. */}
            {summary && (unposted > 0 || !summary.balanced) && (
                <Notice
                    unposted={unposted}
                    balanced={summary.balanced}
                    canRepost={user?.role === 'admin'}
                />
            )}

            <Outlet context={{ period } satisfies AccountingContext} />
        </>
    )
}

function Stat({
    label,
    value,
    tone,
}: {
    label: string
    value: string
    tone: 'up' | 'down' | 'brand'
}) {
    const colour = {
        up: 'text-emerald-700',
        down: 'text-red-700',
        brand: 'text-brand-700',
    }[tone]

    return (
        <div className="card p-4">
            <p className="text-[11px] font-bold text-navy-400">{label}</p>
            <p className={clsx('tabular mt-1 text-lg font-extrabold', colour)}>{value}</p>
        </div>
    )
}

function Notice({
    unposted,
    balanced,
    canRepost,
}: {
    unposted: number
    balanced: boolean
    canRepost: boolean
}) {
    const toast = useToast()
    const repost = useRepostLedger()

    return (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <div className="flex min-w-0 items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-600" />
                <div className="min-w-0 text-sm">
                    {unposted > 0 && (
                        <p className="font-bold text-amber-900">
                            {unposted} مستند لم يصل إلى دفتر اليومية بعد.
                        </p>
                    )}
                    {!balanced && (
                        <p className="font-bold text-amber-900">
                            الميزانية غير متوازنة — راجع القيود اليدوية.
                        </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-amber-700">
                        التقارير أدناه تقرأ من دفتر اليومية، فقد تكون ناقصة حتى يتم الترحيل.
                    </p>
                </div>
            </div>

            {canRepost && unposted > 0 && (
                <Button
                    variant="secondary"
                    icon={RefreshCw}
                    loading={repost.isPending}
                    onClick={async () => {
                        try {
                            const result = await repost.mutateAsync()
                            toast.success(result.message)
                        } catch (caught) {
                            toast.error(errorMessage(caught, 'تعذّر الترحيل.'))
                        }
                    }}
                >
                    ترحيل الآن
                </Button>
            )}
        </div>
    )
}

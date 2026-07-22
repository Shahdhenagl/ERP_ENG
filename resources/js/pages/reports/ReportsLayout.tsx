import { Download } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { PeriodPicker, usePeriod, type PeriodState } from '@/components/PeriodPicker'
import { SectionTabs } from '@/components/SectionTabs'
import { useToast } from '@/components/Toast'
import { Button, PageHeader } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { downloadReport } from '@/lib/queries'

/**
 * The shell every report sits in: the window they are read through, and the
 * export.
 *
 * The period lives here rather than in each screen because two reports for two
 * different windows, side by side in one module, is a way to be quietly wrong
 * about the month.
 *
 * Only the reports that are actually about a period take the picker — stock,
 * custody and the two expiry lists are about *now*, and a date range on them
 * would be a control that does nothing.
 */

interface ReportsContext {
    period: PeriodState
}

export function useReports(): ReportsContext {
    return useOutletContext<ReportsContext>()
}

const SECTIONS = [
    ['/reports/sales', 'المبيعات'],
    ['/reports/profit', 'الأرباح'],
    ['/reports/stock', 'المخزون'],
    ['/reports/custody', 'العهد'],
    ['/reports/contracts', 'العقود'],
    ['/reports/warranties', 'الضمانات'],
] as const

/** Which report the current URL is on, and whether a period applies to it. */
const REPORT_BY_PATH: Record<string, { name: string; periodic: boolean }> = {
    sales: { name: 'sales', periodic: true },
    profit: { name: 'profitability', periodic: true },
    stock: { name: 'stock', periodic: false },
    custody: { name: 'custody', periodic: false },
    contracts: { name: 'contracts', periodic: false },
    warranties: { name: 'warranties', periodic: false },
}

export function ReportsLayout() {
    const period = usePeriod('month')
    const location = useLocation()
    const toast = useToast()
    const [exporting, setExporting] = useState(false)

    const section = location.pathname.split('/').pop() ?? 'sales'
    const report = REPORT_BY_PATH[section] ?? REPORT_BY_PATH.sales

    return (
        <>
            <PageHeader
                title="التقارير"
                subtitle="كل رقم هنا مقروء من الموديول صاحبه، لا محسوب مرة ثانية"
                actions={
                    <Button
                        variant="secondary"
                        icon={Download}
                        loading={exporting}
                        onClick={async () => {
                            setExporting(true)

                            try {
                                await downloadReport(
                                    report.name,
                                    report.periodic ? period.range : {},
                                )
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر تصدير التقرير.'))
                            } finally {
                                setExporting(false)
                            }
                        }}
                    >
                        تصدير Excel
                    </Button>
                }
            />

            <SectionTabs sections={SECTIONS} always />

            {report.periodic && (
                <PeriodPicker period={period} presets={['month', 'quarter', 'year', 'all']} />
            )}

            <Outlet context={{ period } satisfies ReportsContext} />
        </>
    )
}

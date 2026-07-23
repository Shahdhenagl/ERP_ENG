import { Navigate, useParams } from 'react-router-dom'
import { SectionTabs } from '@/components/SectionTabs'
import { PageHeader } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { AdvancesTab } from '@/pages/hr/AdvancesTab'
import { EmployeesTab } from '@/pages/hr/EmployeesTab'
import { LeaveTab } from '@/pages/hr/LeaveTab'
import { PayrollTab } from '@/pages/hr/PayrollTab'

/**
 * The people module, its sections reached from the sidebar rather than a strip
 * of tabs.
 *
 * Employees and leave are one job; advances and payroll are another, because
 * one is about who works here and the other about paying them — and the
 * permissions split the same way. A user with only `hr.manage` sees the first
 * two and lands on them. The section strip stays only where there is no sidebar
 * to carry it — a manager on a phone — and hides for the admin who has one.
 */
type Key = 'employees' | 'leave' | 'advances' | 'payroll'

const TABS: Array<{ key: Key; label: string; permission: string; to: string }> = [
    { key: 'employees', label: 'الموظفون', permission: 'hr.manage', to: '/hr/employees' },
    { key: 'leave', label: 'الإجازات', permission: 'hr.manage', to: '/hr/leave' },
    { key: 'advances', label: 'السلف', permission: 'payroll.manage', to: '/hr/advances' },
    { key: 'payroll', label: 'الرواتب', permission: 'payroll.manage', to: '/hr/payroll' },
]

export function HrPage() {
    const { can } = useAuth()
    const { tab } = useParams<{ tab: Key }>()

    const allowed = TABS.filter((entry) => can(entry.permission))
    const active = allowed.find((entry) => entry.key === tab) ?? allowed[0]

    if (!active) return null
    // Bare /hr resolves to the first section the user may see.
    if (active.key !== tab) return <Navigate to={active.key} replace />

    return (
        <>
            <PageHeader title="الموارد البشرية" subtitle="الموظفون والإجازات والسلف والرواتب" />

            <SectionTabs sections={allowed.map((entry) => [entry.to, entry.label] as const)} />

            {active.key === 'employees' && <EmployeesTab />}
            {active.key === 'leave' && <LeaveTab />}
            {active.key === 'advances' && <AdvancesTab />}
            {active.key === 'payroll' && <PayrollTab />}
        </>
    )
}

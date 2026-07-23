import clsx from 'clsx'
import { useState } from 'react'
import { PageHeader } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { AdvancesTab } from '@/pages/hr/AdvancesTab'
import { EmployeesTab } from '@/pages/hr/EmployeesTab'
import { LeaveTab } from '@/pages/hr/LeaveTab'
import { PayrollTab } from '@/pages/hr/PayrollTab'

/**
 * The people module, in four tabs.
 *
 * Employees and leave are one job; advances and payroll are another, because
 * one is about who works here and the other is about paying them — and the
 * permissions split the same way. A user with only `hr.manage` sees the first
 * two and not the last two.
 */
type Tab = 'employees' | 'leave' | 'advances' | 'payroll'

const TABS: Array<[Tab, string, string]> = [
    ['employees', 'الموظفون', 'hr.manage'],
    ['leave', 'الإجازات', 'hr.manage'],
    ['advances', 'السلف', 'payroll.manage'],
    ['payroll', 'الرواتب', 'payroll.manage'],
]

export function HrPage() {
    const { can } = useAuth()
    const tabs = TABS.filter(([, , permission]) => can(permission))
    const [tab, setTab] = useState<Tab>(tabs[0]?.[0] ?? 'employees')

    return (
        <>
            <PageHeader title="الموارد البشرية" subtitle="الموظفون والإجازات والسلف والرواتب" />

            <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl bg-navy-100 p-1">
                {tabs.map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => setTab(value)}
                        className={clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-xs font-bold whitespace-nowrap transition',
                            tab === value ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'employees' && <EmployeesTab />}
            {tab === 'leave' && <LeaveTab />}
            {tab === 'advances' && <AdvancesTab />}
            {tab === 'payroll' && <PayrollTab />}
        </>
    )
}

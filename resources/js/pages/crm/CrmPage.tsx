import clsx from 'clsx'
import { useState } from 'react'
import { PageHeader } from '@/components/ui'
import { FollowUpsTab } from '@/pages/crm/FollowUpsTab'
import { LeadsTab } from '@/pages/crm/LeadsTab'

/**
 * The front of the funnel, in two tabs.
 *
 * Leads is the pipeline — who might buy, and where each stands. Follow-ups is
 * the discipline that moves them along: the calls and visits promised by a
 * date. One is the map, the other is the walking.
 */
type Tab = 'leads' | 'follow-ups'

const TABS: Array<[Tab, string]> = [
    ['leads', 'العملاء المحتملون'],
    ['follow-ups', 'المتابعات'],
]

export function CrmPage() {
    const [tab, setTab] = useState<Tab>('leads')

    return (
        <>
            <PageHeader title="العملاء المحتملون" subtitle="خط الأنابيب والمتابعات" />

            <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl bg-navy-100 p-1">
                {TABS.map(([value, label]) => (
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

            {tab === 'leads' && <LeadsTab />}
            {tab === 'follow-ups' && <FollowUpsTab />}
        </>
    )
}

import { PageHeader } from '@/components/ui'
import { FollowUpsTab } from '@/pages/crm/FollowUpsTab'

/**
 * The discipline that moves the pipeline: the calls and visits promised by a
 * date. Split out of the CRM screen into its own sidebar destination so the
 * chase list is one click from anywhere, not a tab behind leads.
 */
export function FollowUpsPage() {
    return (
        <>
            <PageHeader title="متابعة العملاء" subtitle="المكالمات والزيارات الموعودة بموعدها" />
            <FollowUpsTab />
        </>
    )
}

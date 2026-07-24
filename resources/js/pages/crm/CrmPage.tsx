import { PageHeader } from '@/components/ui'
import { LeadsTab } from '@/pages/crm/LeadsTab'

/**
 * The pipeline: who might buy, and where each stands.
 *
 * Follow-ups used to sit here as a second tab; it is now its own sidebar
 * destination (متابعة العملاء), so this screen is leads alone — no in-page tab
 * strip duplicating what the sidebar already lists.
 */
export function CrmPage() {
    return (
        <>
            <PageHeader title="فرص البيع" subtitle="خط الأنابيب — من قد يشتري وأين وصل" />
            <LeadsTab />
        </>
    )
}

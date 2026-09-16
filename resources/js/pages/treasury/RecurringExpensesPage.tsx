import { PageHeader } from '@/components/ui'
import { RecurringExpensesSection } from '@/pages/treasury/RecurringExpensesSection'

export function RecurringExpensesPage() {
    return (
        <>
            <PageHeader
                title="المصروفات الدورية"
                subtitle="إدارة المصروفات الثابتة ومواعيد استحقاقها وسدادها"
            />
            <RecurringExpensesSection standalone />
        </>
    )
}

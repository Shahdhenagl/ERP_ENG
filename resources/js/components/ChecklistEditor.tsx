import { ListChecks, Plus, Trash2 } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Input, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { useChecklistItems, useDeleteChecklistItem, useSaveChecklistItem } from '@/lib/queries'

/**
 * The fixed periodic-maintenance checklist, the manager's to define. The points
 * added here are what every technician sees to tick on a routine visit.
 */
export function ChecklistEditor() {
    const toast = useToast()
    const { data: items, isLoading } = useChecklistItems(true)
    const save = useSaveChecklistItem()
    const remove = useDeleteChecklistItem()

    const [label, setLabel] = useState('')

    const add = async () => {
        if (!label.trim()) return
        try {
            await save.mutateAsync({ label: label.trim() })
            setLabel('')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر إضافة البند.'))
        }
    }

    return (
        <section className="card p-5">
            <div className="mb-1 flex items-center gap-2">
                <ListChecks className="size-4 text-navy-400" />
                <h2 className="text-sm font-bold text-navy-800">قائمة الفحص الدوري</h2>
            </div>
            <p className="mb-4 text-[11px] text-navy-400">
                {tr('بنود الفحص التي يعلّم عليها الفني في كل زيارة صيانة دورية.')}
            </p>

            {isLoading ? (
                <SkeletonCard />
            ) : (
                <>
                    <div className="space-y-2">
                        {items?.length ? (
                            items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 px-3 py-2"
                                >
                                    <span className="min-w-0 truncate text-sm font-semibold text-navy-700">
                                        {item.label}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await remove.mutateAsync(item.id)
                                            } catch (caught) {
                                                toast.error(errorMessage(caught, 'تعذّر الحذف.'))
                                            }
                                        }}
                                        className="tap grid shrink-0 place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                                        aria-label="حذف"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="rounded-xl bg-navy-50 px-3 py-3 text-center text-xs text-navy-400">
                                {tr('لا توجد بنود بعد. أضف أول بند فحص.')}
                            </p>
                        )}
                    </div>

                    <div className="mt-3 flex gap-2">
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                            placeholder="بند فحص جديد (فحص المراوح، شد التوصيلات…)"
                            className="flex-1"
                        />
                        <Button icon={Plus} loading={save.isPending} onClick={add}>
                            {tr('إضافة')}
                        </Button>
                    </div>
                </>
            )}
        </section>
    )
}

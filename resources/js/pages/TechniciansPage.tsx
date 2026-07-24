import { HardHat, Phone, Search, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, Input, PageHeader, SkeletonCard } from '@/components/ui'
import { useTechnicians } from '@/lib/queries'

/**
 * The field team, read-only.
 *
 * A row per technician with what a dispatcher needs at a glance: how to reach
 * them and how loaded they are right now — the count of tasks still open on
 * their plate. Assigning and editing live where people are managed; this is the
 * roster the service desk reads before it hands out the next job.
 */
export function TechniciansPage() {
    const { data: technicians, isLoading } = useTechnicians()
    const [search, setSearch] = useState('')

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase()
        const list = technicians ?? []

        if (!term) return list

        return list.filter(
            (tech) =>
                tech.name.toLowerCase().includes(term) ||
                (tech.phone ?? '').includes(term) ||
                (tech.job_title ?? '').toLowerCase().includes(term),
        )
    }, [technicians, search])

    return (
        <>
            <PageHeader
                title="الفنيون"
                subtitle={technicians ? `${technicians.length} فني` : undefined}
            />

            <div className="relative mb-4">
                <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-300" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ابحث بالاسم أو الهاتف أو المسمى…"
                    className="pr-10"
                />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={HardHat}
                    title="لا يوجد فنيون"
                    description="يظهر هنا كل من له دور فني ونشط في النظام."
                />
            ) : (
                <div className="space-y-2">
                    {rows.map((tech) => (
                        <div key={tech.id} className="card flex items-center gap-3 p-3.5">
                            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                                {tech.name.charAt(0)}
                            </span>

                            <div className="min-w-0 flex-1">
                                <p className="truncate font-bold text-navy-900">{tech.name}</p>
                                <p className="truncate text-xs text-navy-400">
                                    {tech.job_title ?? 'فني'}
                                    {tech.phone && (
                                        <>
                                            {' · '}
                                            <span className="tabular inline-flex items-center gap-1">
                                                <Phone className="size-3" />
                                                {tech.phone}
                                            </span>
                                        </>
                                    )}
                                </p>
                            </div>

                            <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-navy-50 px-3 py-1 text-xs font-bold text-navy-600"
                                title="مهام مفتوحة على الفني"
                            >
                                <Wrench className="size-3.5" />
                                {tech.open_tasks_count ?? 0} مهمة
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

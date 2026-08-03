import { HardHat, Phone, Search, Wrench } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Input, PageHeader, SkeletonCard } from '@/components/ui'
import { DataTable, useViewMode, ViewToggle } from '@/components/ViewToggle'
import { useArea } from '@/lib/nav'
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
    const { path } = useArea()
    const [view, setView] = useViewMode('technicians')
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

            <div className="mb-3 flex justify-end">
                <ViewToggle view={view} onChange={setView} />
            </div>

            {isLoading ? (
                <SkeletonCard />
            ) : !rows.length ? (
                <EmptyState
                    icon={HardHat}
                    title="لا يوجد فنيون"
                    description="يظهر هنا كل من له دور فني ونشط في النظام."
                />
            ) : view === 'table' ? (
                <DataTable
                    minWidth="42rem"
                    headers={[
                        tr('الفني'),
                        'المسمى',
                        'الهاتف',
                        { label: tr('مهام مفتوحة'), className: 'w-28' },
                    ]}
                >
                    {rows.map((tech) => (
                        <tr key={tech.id} className="border-t border-navy-100 hover:bg-navy-50/60">
                            <td className="px-3 py-2.5">
                                <Link
                                    to={path(`/technicians/${tech.id}`)}
                                    className="block truncate font-semibold text-navy-800"
                                >
                                    {tech.name}
                                </Link>
                            </td>
                            <td className="px-3 py-2.5 text-navy-600">{tech.job_title ?? 'فني'}</td>
                            <td className="tabular px-3 py-2.5 text-navy-600" dir="ltr">
                                <span className="block text-start">{tech.phone ?? '—'}</span>
                            </td>
                            <td className="tabular px-3 py-2.5 text-navy-700">
                                {tech.open_tasks_count ?? 0}
                            </td>
                        </tr>
                    ))}
                </DataTable>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((tech) => (
                        <Link
                            key={tech.id}
                            to={path(`/technicians/${tech.id}`)}
                            className="card-interactive flex items-center gap-3 p-3.5"
                        >
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
                        </Link>
                    ))}
                </div>
            )}
        </>
    )
}

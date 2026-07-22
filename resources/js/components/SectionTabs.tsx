import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useArea } from '@/lib/nav'

/**
 * The sub-sections of a module, for the screens that have no sidebar.
 *
 * The bottom bar carries top-level destinations alone, so without this strip a
 * nested section would be unreachable. It hides only where the sidebar is
 * genuinely there to replace it — an admin above `lg`; a manager keeps it at
 * every width, because a manager never gets a sidebar at all.
 *
 * `always` is for a module whose sections the sidebar does *not* list. The
 * accounting module has seven and the sidebar shows three; the warranty module
 * has two and the sidebar shows none, because it is itself nested one level
 * down. Hiding the strip there does not fall back to the sidebar — it removes
 * the only way in, which is exactly the regression this flag exists to stop.
 */
export function SectionTabs({
    sections,
    always = false,
}: {
    sections: ReadonlyArray<readonly [string, string]>
    always?: boolean
}) {
    const { path } = useArea()
    const { user } = useAuth()

    return (
        <div
            className={clsx(
                'mb-4 flex gap-1 overflow-x-auto rounded-xl bg-navy-100 p-1',
                ! always && user?.role === 'admin' && 'lg:hidden',
            )}
        >
            {sections.map(([to, label]) => (
                <NavLink
                    key={to}
                    to={path(to)}
                    className={({ isActive }) =>
                        clsx(
                            'tap flex-1 rounded-lg px-3 py-2 text-center text-xs font-bold whitespace-nowrap transition',
                            isActive ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500',
                        )
                    }
                >
                    {label}
                </NavLink>
            ))}
        </div>
    )
}

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
 */
export function SectionTabs({ sections }: { sections: ReadonlyArray<readonly [string, string]> }) {
    const { path } = useArea()
    const { user } = useAuth()

    return (
        <div
            className={clsx(
                'mb-4 flex gap-1 overflow-x-auto rounded-xl bg-navy-100 p-1',
                user?.role === 'admin' && 'lg:hidden',
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

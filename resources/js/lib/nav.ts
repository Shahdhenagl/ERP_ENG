import { useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import type { Role } from '@/types'

/**
 * Each role lives under its own URL space. Admin and manager share one because
 * the API draws the same line (`canDispatch`); admin-only pages are nested
 * inside it rather than split off into a third area.
 */
const AREA: Record<Role, string> = {
    admin: '/manager',
    manager: '/manager',
    technician: '/tech',
}

export function areaFor(role: Role): string {
    return AREA[role]
}

interface Area {
    /** '/tech' or '/manager' */
    base: string
    /** Prefixes an in-area path: path('/tasks') → '/tech/tasks' */
    path: (suffix: string) => string
}

export function useArea(): Area {
    const { user } = useAuth()

    return useMemo(() => {
        const base = user ? AREA[user.role] : '/manager'

        return {
            base,
            path: (suffix: string) => (suffix === '/' || suffix === '' ? base : `${base}${suffix}`),
        }
    }, [user])
}

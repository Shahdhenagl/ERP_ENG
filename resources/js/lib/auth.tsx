import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, tokenStore } from '@/lib/api'
import type { User } from '@/types'

interface AuthValue {
    user: User | null
    loading: boolean
    login: (email: string, password: string) => Promise<User>
    logout: () => Promise<void>
    refresh: () => Promise<void>
    /** admin or manager — the roles that dispatch work */
    canDispatch: boolean
    isAdmin: boolean
    isTechnician: boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        if (!tokenStore.get()) {
            setUser(null)
            setLoading(false)

            return
        }

        try {
            const { data } = await api.get<{ data: User }>('/me')
            setUser(data.data)
        } catch {
            // 401 is already handled by the interceptor; anything else just
            // means we start logged out.
            tokenStore.clear()
            setUser(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const login = useCallback(async (email: string, password: string) => {
        const { data } = await api.post<{ token: string; user: User }>('/login', {
            email,
            password,
            device_name: navigator.userAgent.slice(0, 100),
        })

        tokenStore.set(data.token)
        setUser(data.user)

        return data.user
    }, [])

    const logout = useCallback(async () => {
        try {
            await api.post('/logout')
        } catch {
            // Logging out locally matters more than the round trip succeeding.
        }

        tokenStore.clear()
        setUser(null)
    }, [])

    const value = useMemo<AuthValue>(
        () => ({
            user,
            loading,
            login,
            logout,
            refresh,
            canDispatch: user?.role === 'admin' || user?.role === 'manager',
            isAdmin: user?.role === 'admin',
            isTechnician: user?.role === 'technician',
        }),
        [user, loading, login, logout, refresh],
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
    const context = useContext(AuthContext)

    if (!context) {
        throw new Error('useAuth must be used inside <AuthProvider>')
    }

    return context
}

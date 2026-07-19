import axios, { AxiosError } from 'axios'

const TOKEN_KEY = 'ce.token'

export const tokenStore = {
    get: () => localStorage.getItem(TOKEN_KEY),
    set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
    clear: () => localStorage.removeItem(TOKEN_KEY),
}

export const api = axios.create({
    baseURL: '/api',
    headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
    const token = tokenStore.get()

    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }

    return config
})

api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        // A dead token means the session is over — bounce to login rather than
        // letting every screen render its own "unauthorised" error.
        if (error.response?.status === 401) {
            tokenStore.clear()

            if (!window.location.pathname.startsWith('/login')) {
                window.location.href = '/login'
            }
        }

        return Promise.reject(error)
    },
)

/** Pull a human-readable message out of a Laravel error response. */
export function errorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع.'): string {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data as
            | { message?: string; errors?: Record<string, string[]> }
            | undefined

        const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined

        return firstFieldError ?? data?.message ?? fallback
    }

    return fallback
}

/** Field-level validation errors, keyed by input name. */
export function fieldErrors(error: unknown): Record<string, string> {
    if (!axios.isAxiosError(error)) return {}

    const errors = (error.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors

    if (!errors) return {}

    return Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages[0]]))
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { EN } from '@/locales/en'

/**
 * Two languages, one direction switch.
 *
 * Arabic is the source: every string in the app is written in it, and English
 * is a lookup laid over the top. A key that has no English yet falls through to
 * the Arabic it was written as — which is what makes translating this system a
 * few hundred strings at a time possible at all. A half-finished dictionary
 * shows Arabic where it is thin, never an empty box or a raw key.
 *
 * The direction moves with the language, because a right-to-left English page
 * is not a partially translated page, it is a broken one.
 */
export type Locale = 'ar' | 'en'

const STORAGE_KEY = 'locale'

export function storedLocale(): Locale {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar'
}

function paint(locale: Locale) {
    const root = document.documentElement

    root.lang = locale
    root.dir = locale === 'en' ? 'ltr' : 'rtl'
    // The backend answers in the caller's language — statuses, validation
    // messages, the labels on a printed document. Set here rather than per
    // request so nothing can be sent without it.
    api.defaults.headers.common['Accept-Language'] = locale
}

// Set at module load, not in an effect: the first queries fire while the tree
// is still mounting, and a request that goes out without the header would come
// back in the wrong language and sit in the cache.
paint(storedLocale())

/**
 * The translator, without a hook.
 *
 * Switching language reloads the page, so the answer cannot change while the
 * app is running — which means a plain function is as correct here as a hook,
 * and it can be called from anywhere: a bare line of JSX text, a helper
 * outside a component, a map defined at module scope. Roughly a thousand
 * strings sit in exactly those places, reachable no other way short of
 * restructuring the file they live in.
 */
export function tr(arabic: string): string {
    return storedLocale() === 'en' ? (EN[arabic] ?? arabic) : arabic
}

interface I18nValue {
    locale: Locale
    dir: 'rtl' | 'ltr'
    setLocale: (locale: Locale) => void
    /** Arabic in, the current language out. */
    t: (arabic: string) => string
}

const I18nContext = createContext<I18nValue>({
    locale: 'ar',
    dir: 'rtl',
    setLocale: () => {},
    t: (arabic) => arabic,
})

export function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(storedLocale)

    useEffect(() => paint(locale), [locale])

    const setLocale = (next: Locale) => {
        localStorage.setItem(STORAGE_KEY, next)
        setLocaleState(next)
        // A hard reload rather than a re-render: half this app's text arrives
        // from the server — status names, unit labels, error messages — and
        // those are already cached in the client under the old language.
        // Switching in place would leave the two halves disagreeing.
        window.location.reload()
    }

    const t = (arabic: string) => (locale === 'en' ? (EN[arabic] ?? arabic) : arabic)

    return (
        <I18nContext.Provider
            value={{ locale, dir: locale === 'en' ? 'ltr' : 'rtl', setLocale, t }}
        >
            {children}
        </I18nContext.Provider>
    )
}

export function useI18n() {
    return useContext(I18nContext)
}

/**
 * The translator on its own, for the many call sites that want nothing else.
 *
 *   const t = useT()
 *   <h1>{t('المستخدمون')}</h1>
 */
export function useT() {
    return useContext(I18nContext).t
}

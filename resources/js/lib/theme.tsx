import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Light, dark, or whatever the device says.
 *
 * `system` is the default rather than `light`, because a phone that switches
 * itself at sunset is already telling us what the person wants, and an app
 * that ignores it is the only bright rectangle left on the screen.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

/** Read once, outside React: the same value the boot script in the page used. */
export function storedChoice(): ThemeChoice {
    const saved = localStorage.getItem(STORAGE_KEY)

    return saved === 'light' || saved === 'dark' ? saved : 'system'
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
    if (choice !== 'system') return choice

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function paint(choice: ThemeChoice): 'light' | 'dark' {
    const applied = resolve(choice)

    document.documentElement.dataset.theme = applied
    // The browser chrome on a phone reads this, and a light status bar over a
    // dark page is the tell that a PWA is a web page in a costume.
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', applied === 'dark' ? '#0b1220' : '#0b1b3a')

    return applied
}

interface ThemeValue {
    /** What was chosen — including `system`. */
    choice: ThemeChoice
    /** What that resolves to right now. */
    theme: 'light' | 'dark'
    setChoice: (choice: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeValue>({
    choice: 'system',
    theme: 'light',
    setChoice: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [choice, setChoiceState] = useState<ThemeChoice>(storedChoice)
    const [theme, setTheme] = useState<'light' | 'dark'>(() => resolve(storedChoice()))

    useEffect(() => {
        setTheme(paint(choice))

        // Following the device means following it while the app is open, not
        // only at the moment it loaded.
        if (choice !== 'system') return

        const query = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = () => setTheme(paint('system'))

        query.addEventListener('change', onChange)

        return () => query.removeEventListener('change', onChange)
    }, [choice])

    const setChoice = (next: ThemeChoice) => {
        // `system` is stored as the absence of a preference, so a device that
        // changes its mind later is still obeyed.
        if (next === 'system') localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, next)

        setChoiceState(next)
    }

    return (
        <ThemeContext.Provider value={{ choice, theme, setChoice }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    return useContext(ThemeContext)
}

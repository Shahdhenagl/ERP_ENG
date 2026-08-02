import clsx from 'clsx'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemeChoice } from '@/lib/theme'

const CHOICES: Array<{ value: ThemeChoice; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'فاتح', icon: Sun },
    { value: 'dark', label: 'داكن', icon: Moon },
    { value: 'system', label: 'حسب الجهاز', icon: Monitor },
]

/**
 * One button in the bar: it shows what you are in and switches to the other.
 *
 * The third choice — follow the device — is not on the button, because a
 * three-way cycle leaves you guessing what the next tap does. It lives on the
 * settings screen, where a choice can carry its explanation.
 */
export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setChoice } = useTheme()
    const dark = theme === 'dark'

    return (
        <button
            onClick={() => setChoice(dark ? 'light' : 'dark')}
            className={clsx(
                'tap grid shrink-0 place-items-center rounded-xl p-2 text-navy-500 transition hover:bg-navy-100',
                className,
            )}
            aria-label={dark ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
            title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}
        >
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
    )
}

/** All three choices, for a settings screen with room to explain them. */
export function ThemePicker() {
    const { choice, setChoice } = useTheme()

    return (
        <div className="flex gap-1.5 rounded-2xl bg-navy-100 p-1.5">
            {CHOICES.map((option) => {
                const on = choice === option.value

                return (
                    <button
                        key={option.value}
                        onClick={() => setChoice(option.value)}
                        className={clsx(
                            'tap flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition',
                            on
                                ? 'bg-surface text-navy-900 shadow-sm'
                                : 'text-navy-500 hover:text-navy-700',
                        )}
                    >
                        <option.icon className="size-4" />
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}

import clsx from 'clsx'
import { Languages } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

/**
 * Arabic or English, one tap.
 *
 * The button shows the language you would switch *to*, in that language, which
 * is the only labelling that survives not being able to read the current one.
 */
export function LanguageToggle({ className }: { className?: string }) {
    const { locale, setLocale } = useI18n()
    const next = locale === 'ar' ? 'en' : 'ar'

    return (
        <button
            onClick={() => setLocale(next)}
            className={clsx(
                'tap flex shrink-0 items-center gap-1 rounded-xl px-2 py-2 text-navy-500 transition hover:bg-navy-100',
                className,
            )}
            aria-label={next === 'en' ? 'Switch to English' : 'التبديل إلى العربية'}
            title={next === 'en' ? 'English' : 'العربية'}
        >
            <Languages className="size-5" />
            <span className="text-[11px] font-extrabold">{next === 'en' ? 'EN' : 'ع'}</span>
        </button>
    )
}

/** Both languages side by side, for a settings screen. */
export function LanguagePicker() {
    const { locale, setLocale } = useI18n()

    return (
        <div className="flex gap-1.5 rounded-2xl bg-navy-100 p-1.5">
            {(['ar', 'en'] as const).map((option) => (
                <button
                    key={option}
                    onClick={() => setLocale(option)}
                    className={clsx(
                        'tap flex-1 rounded-xl px-3 py-2 text-xs font-bold transition',
                        locale === option
                            ? 'bg-surface text-navy-900 shadow-sm'
                            : 'text-navy-500 hover:text-navy-700',
                    )}
                >
                    {option === 'ar' ? 'العربية' : 'English'}
                </button>
            ))}
        </div>
    )
}

import { useEffect, useState } from 'react'

/** Tailwind's `sm` breakpoint, so JS and CSS agree on where a phone ends. */
const PHONE = '(max-width: 639px)'

/**
 * Whether this is a phone-sized screen.
 *
 * Used where the answer is not a style but a decision — a table with eight
 * columns is not a narrow table on a phone, it is the wrong control, so the
 * screen offers cards and does not ask.
 */
export function useIsPhone(): boolean {
    const [phone, setPhone] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches,
    )

    useEffect(() => {
        const query = window.matchMedia(PHONE)
        const update = () => setPhone(query.matches)

        query.addEventListener('change', update)

        return () => query.removeEventListener('change', update)
    }, [])

    return phone
}

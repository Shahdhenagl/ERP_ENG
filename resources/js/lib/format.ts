import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns'
import { ar } from 'date-fns/locale'

function toDate(value: string | null | undefined): Date | null {
    if (!value) return null

    const date = parseISO(value)

    return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value: string | null | undefined): string {
    const date = toDate(value)

    return date ? format(date, 'yyyy/MM/dd — HH:mm') : '—'
}

export function formatDate(value: string | null | undefined): string {
    const date = toDate(value)

    return date ? format(date, 'yyyy/MM/dd') : '—'
}

export function formatTime(value: string | null | undefined): string {
    const date = toDate(value)

    return date ? format(date, 'HH:mm') : '—'
}

/** "اليوم 14:30" / "أمس 09:00" / "2026/07/12 — 11:00" */
export function formatSmart(value: string | null | undefined): string {
    const date = toDate(value)

    if (!date) return '—'
    if (isToday(date)) return `اليوم ${format(date, 'HH:mm')}`
    if (isTomorrow(date)) return `غدًا ${format(date, 'HH:mm')}`
    if (isYesterday(date)) return `أمس ${format(date, 'HH:mm')}`

    return format(date, 'yyyy/MM/dd — HH:mm')
}

/** "منذ ٣ ساعات" */
export function formatRelative(value: string | null | undefined): string {
    const date = toDate(value)

    return date ? formatDistanceToNow(date, { addSuffix: true, locale: ar }) : '—'
}

/** True when a scheduled job is already past due. */
export function isOverdue(value: string | null | undefined): boolean {
    const date = toDate(value)

    return date ? date.getTime() < Date.now() : false
}

/** Value for a `datetime-local` input. */
export function toDateTimeLocal(value: string | null | undefined): string {
    const date = toDate(value)

    return date ? format(date, "yyyy-MM-dd'T'HH:mm") : ''
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Dial-able tel: link. */
export function telLink(phone: string | null | undefined): string | undefined {
    return phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined
}

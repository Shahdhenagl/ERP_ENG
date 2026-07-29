/**
 * A money amount written out in Arabic — the تفقيط on a document.
 *
 * The figure is what a document is checked against; the words are what stop it
 * being altered after signing, which is why they sit on every invoice, quote
 * and voucher that leaves the building.
 */

const ONES = [
    '',
    'واحد',
    'اثنان',
    'ثلاثة',
    'أربعة',
    'خمسة',
    'ستة',
    'سبعة',
    'ثمانية',
    'تسعة',
    'عشرة',
    'أحد عشر',
    'اثنا عشر',
    'ثلاثة عشر',
    'أربعة عشر',
    'خمسة عشر',
    'ستة عشر',
    'سبعة عشر',
    'ثمانية عشر',
    'تسعة عشر',
]

const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']

const HUNDREDS = [
    '',
    'مئة',
    'مئتان',
    'ثلاثمئة',
    'أربعمئة',
    'خمسمئة',
    'ستمئة',
    'سبعمئة',
    'ثمانمئة',
    'تسعمئة',
]

/** Singular, dual and plural of each scale — Arabic counts them differently. */
const SCALES: Array<[singular: string, dual: string, plural: string]> = [
    ['', '', ''],
    ['ألف', 'ألفان', 'آلاف'],
    ['مليون', 'مليونان', 'ملايين'],
    ['مليار', 'ملياران', 'مليارات'],
]

/** 0–999 in words. */
function underThousand(value: number): string {
    const parts: string[] = []
    const hundreds = Math.floor(value / 100)
    const rest = value % 100

    if (hundreds) parts.push(HUNDREDS[hundreds])

    if (rest) {
        if (rest < 20) {
            parts.push(ONES[rest])
        } else {
            const unit = rest % 10
            const ten = Math.floor(rest / 10)

            // Arabic says the unit before the ten: واحد وعشرون, not عشرون وواحد.
            parts.push(unit ? `${ONES[unit]} و${TENS[ten]}` : TENS[ten])
        }
    }

    return parts.join(' و')
}

/** A whole number in words, grouped in thousands. */
export function numberToArabicWords(value: number): string {
    const whole = Math.floor(Math.abs(value))

    if (whole === 0) return 'صفر'

    const groups: number[] = []
    let rest = whole

    while (rest > 0) {
        groups.push(rest % 1000)
        rest = Math.floor(rest / 1000)
    }

    const parts: string[] = []

    // Highest scale first, so the reading order matches the figure.
    for (let scale = groups.length - 1; scale >= 0; scale--) {
        const group = groups[scale]

        if (group === 0) continue

        if (scale === 0) {
            parts.push(underThousand(group))

            continue
        }

        const [singular, dual, plural] = SCALES[scale] ?? ['', '', '']

        if (group === 1) {
            parts.push(singular)
        } else if (group === 2) {
            parts.push(dual)
        } else if (group <= 10) {
            // Three to ten take the plural: ثلاثة آلاف.
            parts.push(`${underThousand(group)} ${plural}`)
        } else {
            // Eleven and up take the singular: أحد عشر ألفًا.
            parts.push(`${underThousand(group)} ${singular}`)
        }
    }

    return parts.join(' و')
}

/**
 * The full line a document carries: the pounds, the piastres if there are any,
 * and the closing that says nothing follows.
 */
export function amountInWords(amount: number, currency = 'جنيه'): string {
    const safe = Number.isFinite(amount) ? Math.abs(amount) : 0
    const pounds = Math.floor(safe)
    // Rounded, not truncated: 0.005 short of a piastre is a rounding artefact,
    // and the figure beside it is rounded the same way.
    const piastres = Math.round((safe - pounds) * 100)

    // Rounding the piastres can carry into the pounds — 1999.999 is two thousand.
    const carried = piastres === 100 ? pounds + 1 : pounds
    const remainder = piastres === 100 ? 0 : piastres

    const parts = [`${numberToArabicWords(carried)} ${currency}`]

    if (remainder > 0) {
        parts.push(`${numberToArabicWords(remainder)} قرشًا`)
    }

    return `فقط ${parts.join(' و')} لا غير`
}

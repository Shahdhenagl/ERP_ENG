/**
 * Download a table as a spreadsheet.
 *
 * CSV rather than a real .xlsx: Excel opens it directly, it is a few lines
 * instead of a megabyte of dependency, and the file stays readable by anything
 * else. The BOM is not optional — without it Excel reads UTF-8 Arabic as
 * mojibake, which is the only way this feature can visibly fail.
 */
export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): void {
    const escape = (value: string | number | null | undefined): string => {
        const text = value == null ? '' : String(value)

        // Quote whenever the value could otherwise break the row apart, and
        // double any quote inside it — the CSV escape for a literal quote.
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }

    const body = [headers, ...rows]
        .map((row) => row.map(escape).join(','))
        .join('\r\n')

    const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()

    URL.revokeObjectURL(url)
}

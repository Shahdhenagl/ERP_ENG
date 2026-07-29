import { FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui'
import { downloadCsv } from '@/lib/csv'

/**
 * Export what the filters describe, not the page on screen.
 *
 * `rows` is async so a list can fetch the whole filtered set before writing the
 * file. A spreadsheet of the visible forty out of four hundred is worse than no
 * spreadsheet: it looks complete.
 */
export function ExportButton({
    filename,
    headers,
    rows,
    disabled,
    label = 'تصدير Excel',
}: {
    filename: string
    headers: string[]
    rows: () => Promise<Array<Array<string | number | null | undefined>>>
    disabled?: boolean
    label?: string
}) {
    const [busy, setBusy] = useState(false)

    return (
        <Button
            variant="secondary"
            icon={FileSpreadsheet}
            loading={busy}
            disabled={disabled}
            onClick={async () => {
                setBusy(true)

                try {
                    const data = await rows()
                    const stamp = new Date().toISOString().slice(0, 10)

                    downloadCsv(`${filename}-${stamp}`, headers, data)
                } finally {
                    setBusy(false)
                }
            }}
        >
            {label}
        </Button>
    )
}

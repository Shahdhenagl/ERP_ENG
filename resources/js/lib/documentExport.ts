import html2canvas from 'html2canvas'

function safeFilename(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
}

export async function downloadDocumentJpg(element: HTMLElement, filename: string): Promise<void> {
    await document.fonts.ready
    const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        logging: false,
    })

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94))
    if (!blob) throw new Error('تعذّر تجهيز صورة العرض.')

    downloadBlob(blob, `${safeFilename(filename)}.jpg`)
}

export function downloadDocumentWord(element: HTMLElement, filename: string): void {
    const stylesheet = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.href ?? ''
    const html = `<!doctype html>
<html dir="rtl">
<head>
<meta charset="utf-8">
<base href="${document.baseURI}">
<link rel="stylesheet" href="${stylesheet}">
<style>body{background:#fff!important;margin:0}.doc-sheet{box-shadow:none!important;margin:0!important;max-width:none!important}</style>
</head>
<body>${element.outerHTML}</body>
</html>`

    downloadBlob(
        new Blob([html], { type: 'application/msword' }),
        `${safeFilename(filename)}.doc`,
    )
}

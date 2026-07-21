import { ArrowRight, Printer } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLoader } from '@/components/ui'
import { useSettings } from '@/lib/queries'

/**
 * The paper every printed document sits on: letterhead, body, footer.
 *
 * Printing goes through the browser rather than a PDF library. dompdf and its
 * peers break Arabic — letters fall out of their joined forms and the
 * direction flips — and the browser that already renders this app correctly
 * needs no help to print it. The user saves a PDF from the print dialog.
 */
export function DocumentShell({
    title,
    subtitle,
    children,
    footer,
}: {
    title: string
    subtitle?: string
    children: ReactNode
    footer?: ReactNode
}) {
    const navigate = useNavigate()
    const { data: settings, isLoading } = useSettings()

    // The tab name becomes the suggested filename when saving as PDF, so it is
    // worth being the document's own name rather than the app's.
    useEffect(() => {
        const previous = document.title
        document.title = title

        return () => {
            document.title = previous
        }
    }, [title])

    if (isLoading || !settings) return <PageLoader />

    return (
        <div className="min-h-dvh bg-navy-100 py-6 print:bg-white print:py-0" dir="rtl">
            <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4">
                <button onClick={() => navigate(-1)} className="btn-ghost text-sm">
                    <ArrowRight className="size-4" />
                    رجوع
                </button>

                <button onClick={() => window.print()} className="btn-primary">
                    <Printer className="size-4" />
                    طباعة
                </button>
            </div>

            <article className="doc-sheet shadow-[var(--shadow-panel)] print:shadow-none">
                {/* ── Letterhead ─────────────────────────────── */}
                <header className="doc-keep flex items-start justify-between gap-6 border-b-2 border-navy-900 pb-4">
                    <div className="flex items-center gap-3">
                        <img src="/brand/logo-mark.png" alt="" className="size-14 object-contain" />
                        <div>
                            <p className="text-lg leading-tight font-extrabold text-navy-900">
                                {settings.company_name}
                            </p>
                            {settings.company_tagline && (
                                <p className="text-[11px] text-navy-500">{settings.company_tagline}</p>
                            )}
                        </div>
                    </div>

                    <div className="text-left text-[11px] leading-relaxed text-navy-600">
                        {settings.company_address && <p>{settings.company_address}</p>}
                        {settings.company_phone && <p dir="ltr">{settings.company_phone}</p>}
                        {settings.company_email && <p dir="ltr">{settings.company_email}</p>}
                        {settings.company_tax_id && (
                            <p>
                                الرقم الضريبي: <span dir="ltr">{settings.company_tax_id}</span>
                            </p>
                        )}
                    </div>
                </header>

                <div className="doc-keep mt-5 mb-5 text-center">
                    <h1 className="text-xl font-extrabold text-navy-900">{title}</h1>
                    {subtitle && <p className="mt-0.5 text-sm text-navy-500">{subtitle}</p>}
                </div>

                {children}

                <footer className="mt-8 border-t border-navy-200 pt-3 text-center text-[10px] text-navy-400">
                    {footer}
                    <p className="mt-1">
                        {settings.company_name}
                        {settings.company_commercial_id && ` · س.ت ${settings.company_commercial_id}`}
                    </p>
                </footer>
            </article>
        </div>
    )
}

/** Two-column block of labelled values — the party a document is addressed to. */
export function DocumentParty({
    heading,
    rows,
}: {
    heading: string
    rows: Array<[string, string | null | undefined]>
}) {
    return (
        <div className="doc-keep rounded-lg bg-navy-50 p-3">
            <p className="mb-1.5 text-[11px] font-bold text-navy-400">{heading}</p>
            {rows
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                    <p key={label} className="text-[13px] text-navy-800">
                        <span className="text-navy-400">{label}: </span>
                        {value}
                    </p>
                ))}
        </div>
    )
}

/** The money summary that closes an invoice or a quotation. */
export function DocumentTotals({
    rows,
    total,
    totalLabel = 'الإجمالي',
}: {
    rows: Array<[string, string]>
    total: string
    totalLabel?: string
}) {
    return (
        <div className="doc-keep mt-4 flex justify-start">
            <div className="w-64 space-y-1 text-[13px]">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between text-navy-600">
                        <span>{label}</span>
                        <span className="tabular">{value}</span>
                    </div>
                ))}
                <div className="flex justify-between border-t-2 border-navy-900 pt-1.5 font-extrabold text-navy-900">
                    <span>{totalLabel}</span>
                    <span className="tabular">{total}</span>
                </div>
            </div>
        </div>
    )
}

/** Signature strip — printed documents get signed. */
export function DocumentSignatures({ labels }: { labels: string[] }) {
    return (
        <div className="doc-keep mt-10 flex justify-between gap-8">
            {labels.map((label) => (
                <div key={label} className="flex-1 text-center">
                    <div className="mb-1 border-b border-navy-300 pb-10" />
                    <p className="text-[11px] text-navy-500">{label}</p>
                </div>
            ))}
        </div>
    )
}

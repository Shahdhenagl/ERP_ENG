import { Construction } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useLocation } from 'react-router-dom'
import { useArea } from '@/lib/nav'
import { menuLabelForPath } from '@/lib/menu'

/**
 * The landing for every screen the sidebar lists but the app has not built yet.
 *
 * It names the screen the user reached for — pulled from the same menu tree the
 * sidebar renders — so the click lands somewhere deliberate rather than bouncing
 * back to the dashboard as an unrecognised route would.
 */
export function ComingSoon() {
    const location = useLocation()
    const { base } = useArea()

    // Strip the area prefix (/manager or /tech) to match the menu's within-area
    // paths; the pathname the sidebar linked is what names the screen.
    const within = location.pathname.startsWith(base)
        ? location.pathname.slice(base.length) || '/'
        : location.pathname

    const label = menuLabelForPath(within)

    return (
        <div className="grid min-h-[60vh] place-items-center px-4">
            <div className="max-w-md text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                    <Construction className="size-8" />
                </span>

                <h1 className="mt-5 text-lg font-extrabold text-navy-900">
                    {label ?? 'هذه الشاشة'} — قيد التطوير
                </h1>

                <p className="mt-2 text-sm leading-relaxed text-navy-500">
                    الشاشة موجودة في خريطة النظام وسيتم تفعيلها قريبًا. البنية جاهزة،
                    وباقي ربط الواجهة بها.
                </p>

                <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                    {tr('قريبًا')}
                </span>
            </div>
        </div>
    )
}

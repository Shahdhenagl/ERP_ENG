import { Stamp, Trash2, Upload } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useRef } from 'react'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { useSaveStamp, useSettings } from '@/lib/queries'

/**
 * The company seal, uploaded once and stamped on approved offers.
 *
 * A seal is not decoration: it says the company stands behind the figure on
 * the page. So it goes on the document only after somebody has approved it,
 * and it lives here rather than being pasted onto a quotation by hand, where
 * it would be one careless paste away from appearing on a draft.
 */
export function StampSetting() {
    const toast = useToast()
    const { data: settings } = useSettings()
    const save = useSaveStamp()
    const picker = useRef<HTMLInputElement>(null)

    const url = settings?.company_stamp_url

    return (
        <section className="card p-5">
            <h2 className="mb-1 text-sm font-bold text-navy-800">ختم الشركة</h2>
            <p className="mb-3 text-[11px] leading-relaxed text-navy-400">
                {tr('يُطبع على عرض السعر بعد اعتماده فقط — لا يظهر على مسودة. يفضَّل ملف PNG بخلفية شفافة حتى يجلس فوق سطر التوقيع.')}
            </p>

            <div className="flex items-center gap-4">
                <div className="grid size-28 shrink-0 place-items-center rounded-2xl border border-dashed border-navy-200 bg-navy-50">
                    {url ? (
                        <img src={url} alt="ختم الشركة" className="max-h-24 max-w-24 object-contain" />
                    ) : (
                        <Stamp className="size-8 text-navy-300" />
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <input
                        ref={picker}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (event) => {
                            const file = event.target.files?.[0]
                            // Cleared straight away so picking the same file
                            // twice still fires a change.
                            event.target.value = ''
                            if (!file) return

                            try {
                                await save.mutateAsync(file)
                                toast.success('تم حفظ الختم.')
                            } catch (caught) {
                                toast.error(errorMessage(caught, 'تعذّر رفع الختم.'))
                            }
                        }}
                    />

                    <Button
                        variant="secondary"
                        icon={Upload}
                        loading={save.isPending}
                        onClick={() => picker.current?.click()}
                        className="text-xs"
                    >
                        {url ? 'استبدال الختم' : 'رفع الختم'}
                    </Button>

                    {url && (
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    await save.mutateAsync(null)
                                    toast.success('تم حذف الختم.')
                                } catch (caught) {
                                    toast.error(errorMessage(caught, 'تعذّر حذف الختم.'))
                                }
                            }}
                            className="tap inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-red-600 transition hover:bg-red-50"
                        >
                            <Trash2 className="size-3.5" />
                            {tr('حذف')}
                        </button>
                    )}
                </div>
            </div>
        </section>
    )
}

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { DocumentShell } from '@/components/DocumentShell'
import { ErrorState } from '@/components/ui'
import { useDraft } from '@/lib/queries'

export function DraftPrint() {
    const { id } = useParams<{ id: string }>()
    const { data: draft, isError, refetch } = useDraft(id)
    const [language, setLanguage] = useState<'ar' | 'en'>('ar')
    if (isError) return <ErrorState message="تعذر تحميل المسودة." onRetry={() => void refetch()} />
    if (!draft) return null
    const isEnglish = language === 'en' && Boolean(draft.content_en)
    const title = isEnglish ? draft.title_en || draft.title : draft.title
    const content = isEnglish ? draft.content_en : draft.content
    const direction = isEnglish ? 'ltr' : draft.direction
    return <DocumentShell title={title} subtitle={isEnglish ? draft.category.name_en || draft.category.name : draft.category.name} exportFormats bilingualFooter>
        <div className="no-print mb-5 flex justify-center gap-2">
            <button className={`rounded-lg px-4 py-2 text-xs font-bold ${language === 'ar' ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-600'}`} onClick={() => setLanguage('ar')}>عربي</button>
            <button disabled={!draft.content_en} className={`rounded-lg px-4 py-2 text-xs font-bold ${language === 'en' ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-600'} disabled:opacity-40`} onClick={() => setLanguage('en')}>English</button>
        </div>
        <section className="draft-print-content" dir={direction} style={{ fontFamily: draft.font_family, fontSize: `${draft.font_size}px`, color: draft.text_color }} dangerouslySetInnerHTML={{ __html: content || '' }} />
    </DocumentShell>
}

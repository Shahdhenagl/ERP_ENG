import { useRef, useState } from 'react'
import { FileText, FolderPlus, Pencil, Plus, Printer, Save, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useArea } from '@/lib/nav'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Input, PageHeader, Select, SkeletonCard, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import {
    useDeleteDraft,
    useDeleteDraftCategory,
    useDraftCategories,
    useDrafts,
    useSaveDraft,
    useSaveDraftCategory,
} from '@/lib/queries'
import type { Draft, DraftCategory } from '@/types'

const FONTS = ['Cairo', 'Arial', 'Tahoma', 'Georgia']

export function DraftsPage() {
    const { path } = useArea()
    const navigate = useNavigate()
    const toast = useToast()
    const { data: categories } = useDraftCategories()
    const [categoryId, setCategoryId] = useState<number | undefined>()
    const { data, isLoading } = useDrafts(categoryId ? { category_id: categoryId } : {})
    const [editing, setEditing] = useState<Draft | null>(null)
    const [creating, setCreating] = useState(false)
    const [categoryForm, setCategoryForm] = useState(false)
    const del = useDeleteDraft()
    const delCategory = useDeleteDraftCategory()

    const remove = async (draft: Draft) => {
        if (!window.confirm(`حذف المسودة «${draft.title}»؟`)) return
        try { await del.mutateAsync(draft.id); toast.success('تم حذف المسودة.') } catch (e) { toast.error(errorMessage(e, 'تعذر الحذف.')) }
    }

    const removeCategory = async (category: DraftCategory) => {
        if ((category.drafts_count ?? 0) > 0) return toast.error('لا يمكن حذف تصنيف يحتوي على مسودات.')
        if (!window.confirm(`حذف التصنيف «${category.name}»؟`)) return
        try { await delCategory.mutateAsync(category.id); toast.success('تم حذف التصنيف.') } catch (e) { toast.error(errorMessage(e, 'تعذر الحذف.')) }
    }

    return <>
        <PageHeader title="المسودات" subtitle="نماذج وخطابات قابلة للتعديل والطباعة على مقاس A4" actions={<div className="flex gap-2"><Button variant="secondary" icon={FolderPlus} onClick={() => setCategoryForm(true)}>تصنيف جديد</Button><Button icon={Plus} onClick={() => setCreating(true)}>مسودة جديدة</Button></div>} />
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            <button className={`rounded-xl px-4 py-2 text-sm font-bold ${!categoryId ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-600'}`} onClick={() => setCategoryId(undefined)}>كل التصنيفات</button>
            {categories?.map((c) => <div key={c.id} className="flex items-center gap-1 rounded-xl bg-navy-100 ps-4 text-sm font-bold text-navy-700"><button onClick={() => setCategoryId(c.id)} className="py-2">{c.name} <span className="text-xs text-navy-400">({c.drafts_count ?? 0})</span></button><button aria-label="حذف التصنيف" className="p-2 text-navy-400 hover:text-red-600" onClick={() => void removeCategory(c)}><Trash2 className="size-3.5" /></button></div>)}
        </div>
        {isLoading ? <SkeletonCard /> : !data?.data.length ? <EmptyState icon={FileText} title="لا توجد مسودات" description="أنشئ أول خطاب أو نموذج من الزر أعلاه." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.data.map((draft) => <article key={draft.id} className="card p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-[11px] font-bold text-brand-600">{draft.category?.name}</span><h2 className="mt-1 font-extrabold text-navy-900">{draft.title}</h2><p className="mt-1 line-clamp-2 text-xs text-navy-500" dangerouslySetInnerHTML={{ __html: draft.content ?? '' }} /></div><FileText className="size-6 shrink-0 text-brand-500" /></div><div className="mt-4 flex gap-2 border-t border-navy-100 pt-3"><Button variant="secondary" className="flex-1" icon={Pencil} onClick={() => setEditing(draft)}>تعديل</Button><Button variant="secondary" icon={Printer} onClick={() => navigate(path(`/print/drafts/${draft.id}`))}>طباعة</Button><button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => void remove(draft)}><Trash2 className="size-4" /></button></div></article>)}</div>}
        {(creating || editing) && <DraftEditor draft={editing ?? undefined} categories={categories ?? []} defaultCategoryId={categoryId} onClose={() => { setCreating(false); setEditing(null) }} />}
        {categoryForm && <CategoryEditor onClose={() => setCategoryForm(false)} />}
    </>
}

function DraftEditor({ draft, categories, defaultCategoryId, onClose }: { draft?: Draft; categories: DraftCategory[]; defaultCategoryId?: number; onClose: () => void }) {
    const toast = useToast(); const save = useSaveDraft(draft?.id); const contentRef = useRef<HTMLDivElement>(null)
    const [form, setForm] = useState({ draft_category_id: draft?.draft_category_id ?? defaultCategoryId ?? categories[0]?.id ?? '', title: draft?.title ?? '', title_en: draft?.title_en ?? '', content_en: draft?.content_en ?? '', font_size: draft?.font_size ?? 14, font_family: draft?.font_family ?? 'Cairo', text_color: draft?.text_color ?? '#0b1b3a', accent_color: draft?.accent_color ?? '#0f766e', direction: draft?.direction ?? 'rtl' as 'rtl' | 'ltr' })
    const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }))
    const command = (name: string, value?: string) => { document.execCommand(name, false, value); contentRef.current?.focus() }
    const submit = async () => { try { await save.mutateAsync({ ...form, draft_category_id: Number(form.draft_category_id), content: contentRef.current?.innerHTML ?? draft?.content ?? '' }); toast.success('تم حفظ المسودة.'); onClose() } catch (e) { toast.error(errorMessage(e, 'تعذر حفظ المسودة.')) } }
    return <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/40 p-4"><div className="mx-auto max-w-5xl rounded-2xl bg-surface p-5 shadow-2xl" dir="rtl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-extrabold">{draft ? 'تعديل المسودة' : 'مسودة جديدة'}</h2><button onClick={onClose} className="text-navy-400">✕</button></div><div className="grid gap-4 md:grid-cols-2"><Input placeholder="عنوان المسودة" value={form.title} onChange={(e) => set('title', e.target.value)} /><Input placeholder="العنوان بالإنجليزية اختياري" dir="ltr" value={form.title_en} onChange={(e) => set('title_en', e.target.value)} /><Select value={String(form.draft_category_id)} onChange={(e) => set('draft_category_id', e.target.value)}><option value="">اختر التصنيف</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><Input type="number" min={8} max={48} step={1} value={form.font_size} onChange={(e) => set('font_size', Number(e.target.value))} /></div><div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-navy-50 p-2"><select className="rounded-lg border border-navy-200 bg-white px-2 py-1 text-sm" value={form.font_family} onChange={(e) => set('font_family', e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select><button className="toolbar" onClick={() => command('bold')}><b>B</b></button><button className="toolbar" onClick={() => command('italic')}><i>I</i></button><button className="toolbar" onClick={() => command('underline')}><u>U</u></button><button className="toolbar" onClick={() => command('insertUnorderedList')}>• قائمة</button><label className="flex items-center gap-1 text-xs">لون النص <input type="color" value={form.text_color} onChange={(e) => { set('text_color', e.target.value); command('foreColor', e.target.value) }} /></label><label className="flex items-center gap-1 text-xs">لون مميز <input type="color" value={form.accent_color} onChange={(e) => set('accent_color', e.target.value)} /></label><button className="toolbar" onClick={() => set('direction', form.direction === 'rtl' ? 'ltr' : 'rtl')}>‏{form.direction === 'rtl' ? 'RTL' : 'LTR'}</button></div><div ref={contentRef} contentEditable suppressContentEditableWarning className="mt-3 min-h-[360px] rounded-xl border border-navy-200 bg-white p-5 leading-loose outline-none focus:border-brand-500" style={{ fontFamily: form.font_family, fontSize: `${form.font_size}px`, color: form.text_color, direction: form.direction }} dangerouslySetInnerHTML={{ __html: draft?.content ?? '<p>اكتب نص المسودة هنا…</p>' }} /><div className="mt-4"><Textarea placeholder="نسخة إنجليزية اختيارية للطباعة الإنجليزية" dir="ltr" rows={5} value={form.content_en} onChange={(e) => set('content_en', e.target.value)} /></div><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button icon={Save} loading={save.isPending} onClick={() => void submit()}>حفظ المسودة</Button></div></div></div>
}

function CategoryEditor({ onClose }: { onClose: () => void }) { const toast = useToast(); const save = useSaveDraftCategory(); const [name, setName] = useState(''); const [nameEn, setNameEn] = useState(''); return <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-surface p-5"><h2 className="mb-4 text-lg font-extrabold">تصنيف مسودات جديد</h2><div className="space-y-3"><Input placeholder="اسم التصنيف مثل: جوابات تفويض" value={name} onChange={(e) => setName(e.target.value)} /><Input placeholder="الاسم بالإنجليزية اختياري" dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></div><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={save.isPending} onClick={async () => { try { await save.mutateAsync({ name, name_en: nameEn || null }); toast.success('تم إنشاء التصنيف.'); onClose() } catch (e) { toast.error(errorMessage(e, 'تعذر إنشاء التصنيف.')) } }}>حفظ</Button></div></div></div> }

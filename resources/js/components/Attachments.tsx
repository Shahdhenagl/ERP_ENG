import { FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useToast } from '@/components/Toast'
import { errorMessage } from '@/lib/api'
import { useAttachments, useDeleteAttachmentFile, useUploadFiles } from '@/lib/queries'

/**
 * Files on a record — a thumbnail wall of photos and a row of documents, with
 * an upload button and delete. One component for every module that owns files;
 * point it at the record's kind and id.
 *
 * Shown only once the record exists — a file needs something to hang on, so a
 * brand-new form saves first, then attaches.
 */
export function Attachments({
    type,
    id,
    label = 'المرفقات',
    readOnly = false,
}: {
    type: string
    id: number
    label?: string
    readOnly?: boolean
}) {
    const toast = useToast()
    const { data: files, isLoading } = useAttachments(type, id)
    const upload = useUploadFiles(type, id)
    const remove = useDeleteAttachmentFile(type, id)
    const inputRef = useRef<HTMLInputElement>(null)

    const [dragging, setDragging] = useState(false)

    const send = async (list: FileList | null) => {
        const chosen = list ? Array.from(list) : []
        if (!chosen.length) return

        try {
            await upload.mutateAsync({ files: chosen })
            toast.success('تم رفع المرفقات.')
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر الرفع — تأكد من نوع وحجم الملف.'))
        } finally {
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    const images = files?.filter((file) => file.is_image) ?? []
    const docs = files?.filter((file) => !file.is_image) ?? []

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-bold text-navy-400">
                    <Paperclip className="size-3.5" />
                    {label}
                    {files?.length ? ` (${files.length})` : ''}
                </p>
                {!readOnly && (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={upload.isPending}
                        className="tap inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 disabled:opacity-60"
                    >
                        {upload.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <Upload className="size-3.5" />
                        )}
                        رفع
                    </button>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => send(e.target.files)}
                />
            </div>

            {!readOnly && (
                <div
                    onDragOver={(e) => {
                        e.preventDefault()
                        setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault()
                        setDragging(false)
                        void send(e.dataTransfer.files)
                    }}
                    onClick={() => inputRef.current?.click()}
                    className={
                        'mb-3 cursor-pointer rounded-xl border border-dashed p-3 text-center text-[11px] font-semibold transition ' +
                        (dragging
                            ? 'border-brand-400 bg-brand-50 text-brand-700'
                            : 'border-navy-200 text-navy-400 hover:bg-navy-50')
                    }
                >
                    اسحب الصور أو الملفات هنا، أو اضغط للاختيار — صور أو PDF حتى 10MB
                </div>
            )}

            {isLoading ? (
                <p className="text-[11px] text-navy-400">جارٍ التحميل…</p>
            ) : !files?.length ? (
                <p className="text-[11px] text-navy-300">لا توجد مرفقات بعد.</p>
            ) : (
                <div className="space-y-3">
                    {Boolean(images.length) && (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {images.map((file) => (
                                <div key={file.id} className="group relative aspect-square">
                                    <a href={file.url} target="_blank" rel="noreferrer">
                                        <img
                                            src={file.url}
                                            alt={file.caption ?? file.original_name}
                                            className="size-full rounded-xl object-cover ring-1 ring-navy-100"
                                        />
                                    </a>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={() => remove.mutate(file.id)}
                                            className="absolute top-1 left-1 grid size-6 place-items-center rounded-lg bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                                            aria-label="حذف"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {docs.map((file) => (
                        <div
                            key={file.id}
                            className="flex items-center gap-2 rounded-xl border border-navy-100 p-2.5"
                        >
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600">
                                <FileText className="size-4" />
                            </span>
                            <a
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                className="min-w-0 flex-1 truncate text-xs font-bold text-navy-800 hover:underline"
                            >
                                {file.caption ?? file.original_name}
                            </a>
                            {!readOnly && (
                                <button
                                    type="button"
                                    onClick={() => remove.mutate(file.id)}
                                    className="tap grid size-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600"
                                    aria-label="حذف"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

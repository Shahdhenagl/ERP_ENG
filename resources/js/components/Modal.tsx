import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
    open: boolean
    onClose: () => void
    title: string
    description?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    footer?: ReactNode
    children: ReactNode
}

const SIZES = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
}

export function Modal({ open, onClose, title, description, size = 'md', footer, children }: ModalProps) {
    // Close on Escape, and stop the page behind from scrolling.
    useEffect(() => {
        if (!open) return

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', onKey)

        return () => {
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', onKey)
        }
    }, [open, onClose])

    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <div
                className="absolute inset-0 bg-navy-950/60"
                onClick={onClose}
                aria-hidden
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={clsx(
                    'animate-in relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-[var(--shadow-panel)]',
                    'rounded-t-3xl sm:rounded-3xl',
                    SIZES[size],
                    'sm:mx-4',
                )}
            >
                {/* Grab handle for the mobile bottom-sheet presentation */}
                <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-navy-200 sm:hidden" />

                <header className="flex items-start justify-between gap-4 border-b border-navy-100 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-navy-900">{title}</h2>
                        {description && <p className="mt-0.5 text-sm text-navy-400">{description}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        className="tap -m-2 grid place-items-center rounded-xl p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                        aria-label="إغلاق"
                    >
                        <X className="size-5" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

                {footer && (
                    <footer className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-navy-100 bg-navy-50/50 px-6 py-4">
                        {footer}
                    </footer>
                )}
            </div>
        </div>,
        document.body,
    )
}

interface ConfirmProps {
    open: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
    loading?: boolean
}

export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'تأكيد',
    danger,
    loading,
}: ConfirmProps) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            size="sm"
            footer={
                <>
                    <button className="btn-secondary" onClick={onClose} disabled={loading}>
                        إلغاء
                    </button>
                    <button
                        className={danger ? 'btn-danger' : 'btn-primary'}
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {confirmLabel}
                    </button>
                </>
            }
        >
            <p className="text-sm leading-relaxed text-navy-600">{message}</p>
        </Modal>
    )
}

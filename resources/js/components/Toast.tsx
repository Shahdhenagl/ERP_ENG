import clsx from 'clsx'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
    id: number
    kind: ToastKind
    message: string
}

interface ToastValue {
    success: (message: string) => void
    error: (message: string) => void
    info: (message: string) => void
}

const ToastContext = createContext<ToastValue | null>(null)

const STYLES: Record<ToastKind, { icon: typeof Info; className: string }> = {
    success: { icon: CheckCircle2, className: 'bg-emerald-600' },
    error: { icon: AlertCircle, className: 'bg-red-600' },
    info: { icon: Info, className: 'bg-navy-800' },
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
    }, [])

    const push = useCallback(
        (kind: ToastKind, message: string) => {
            const id = nextId++
            setToasts((current) => [...current, { id, kind, message }])
            window.setTimeout(() => dismiss(id), 4500)
        },
        [dismiss],
    )

    const value = useMemo<ToastValue>(
        () => ({
            success: (message) => push('success', message),
            error: (message) => push('error', message),
            info: (message) => push('info', message),
        }),
        [push],
    )

    return (
        <ToastContext.Provider value={value}>
            {children}
            {createPortal(
                <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4">
                    {toasts.map((toast) => {
                        const { icon: Icon, className } = STYLES[toast.kind]

                        return (
                            <div
                                key={toast.id}
                                className={clsx(
                                    'animate-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-[var(--shadow-panel)]',
                                    className,
                                )}
                                role="status"
                            >
                                <Icon className="mt-0.5 size-5 shrink-0" />
                                <p className="flex-1 leading-relaxed">{toast.message}</p>
                                <button
                                    onClick={() => dismiss(toast.id)}
                                    className="-m-1 shrink-0 rounded-lg p-1 opacity-70 transition hover:opacity-100"
                                    aria-label="إغلاق"
                                >
                                    <X className="size-4" />
                                </button>
                            </div>
                        )
                    })}
                </div>,
                document.body,
            )}
        </ToastContext.Provider>
    )
}

export function useToast(): ToastValue {
    const context = useContext(ToastContext)

    if (!context) {
        throw new Error('useToast must be used inside <ToastProvider>')
    }

    return context
}

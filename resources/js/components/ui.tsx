import clsx from 'clsx'
import { Loader2, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

/* ══════════════════════════════════════════════════════════
   Buttons
   ══════════════════════════════════════════════════════════ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp'

const VARIANTS: Record<Variant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    whatsapp: 'btn-whatsapp',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    icon?: LucideIcon
    loading?: boolean
    block?: boolean
}

export function Button({
    variant = 'primary',
    icon: Icon,
    loading,
    block,
    className,
    children,
    disabled,
    ...props
}: ButtonProps) {
    return (
        <button
            className={clsx(VARIANTS[variant], block && 'w-full', className)}
            disabled={disabled || loading}
            {...props}
        >
            {loading ? (
                <Loader2 className="size-4 animate-spin" />
            ) : (
                Icon && <Icon className="size-4 shrink-0" />
            )}
            {children}
        </button>
    )
}

/* ══════════════════════════════════════════════════════════
   Form fields
   ══════════════════════════════════════════════════════════ */

interface FieldProps {
    label?: string
    error?: string
    hint?: string
    required?: boolean
    className?: string
    children: ReactNode
}

export function Field({ label, error, hint, required, className, children }: FieldProps) {
    return (
        <div className={className}>
            {label && (
                <label className="label">
                    {label}
                    {required && <span className="text-red-500"> *</span>}
                </label>
            )}
            {children}
            {hint && !error && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
            {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
        </div>
    )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={clsx('input', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={clsx('input resize-y', className)} rows={3} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select className={clsx('input cursor-pointer', className)} {...props}>
            {children}
        </select>
    )
}

/* ══════════════════════════════════════════════════════════
   Feedback & structure
   ══════════════════════════════════════════════════════════ */

export function Spinner({ className }: { className?: string }) {
    return <Loader2 className={clsx('size-5 animate-spin text-brand-500', className)} />
}

export function PageLoader({ label = 'جارٍ التحميل…' }: { label?: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Spinner className="size-8" />
            <p className="text-sm text-navy-400">{label}</p>
        </div>
    )
}

export function SkeletonCard() {
    return <div className="shimmer h-28 rounded-2xl" />
}

interface EmptyStateProps {
    icon?: LucideIcon
    title: string
    description?: string
    action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-navy-200 bg-white/60 px-6 py-16 text-center">
            {Icon && (
                <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-navy-50 text-navy-300">
                    <Icon className="size-7" />
                </div>
            )}
            <h3 className="text-base font-bold text-navy-800">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-sm text-navy-400">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">{message}</p>
            {onRetry && (
                <Button variant="secondary" className="mt-4" onClick={onRetry}>
                    إعادة المحاولة
                </Button>
            )}
        </div>
    )
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
    return <span className={clsx('badge', className)}>{children}</span>
}

interface PageHeaderProps {
    title: string
    subtitle?: string
    actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-navy-400">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    )
}

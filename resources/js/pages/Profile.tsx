import { KeyRound, LogOut, Save, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/Toast'
import { Badge, Button, Field, Input, PageHeader } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUpdatePassword, useUpdateProfile } from '@/lib/queries'

export function Profile() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    if (!user) return null

    return (
        <>
            <PageHeader title="حسابي" subtitle="بياناتك الشخصية وكلمة المرور" />

            <div className="grid gap-5 lg:grid-cols-2">
                <DetailsCard />
                <PasswordCard />
            </div>

            <button
                onClick={async () => {
                    await logout()
                    navigate('/login')
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100 lg:hidden"
            >
                <LogOut className="size-4" />
                تسجيل الخروج
            </button>
        </>
    )
}

/* ── Name, email, phones ─────────────────────────────────── */

function DetailsCard() {
    const { user } = useAuth()
    const toast = useToast()
    const update = useUpdateProfile()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        name: user?.name ?? '',
        email: user?.email ?? '',
        phone: user?.phone ?? '',
        whatsapp: user?.whatsapp ?? '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        setErrors({})

        try {
            await update.mutateAsync(form)
            toast.success('تم حفظ البيانات.')
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ البيانات.'))
        }
    }

    return (
        <form onSubmit={handleSubmit} className="card p-5">
            <div className="mb-5 flex items-center gap-3">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-600">
                    {user?.name.charAt(0)}
                </div>
                <div className="min-w-0">
                    <p className="truncate font-bold text-navy-900">{user?.name}</p>
                    <Badge className="mt-1 bg-navy-100 text-navy-600">{user?.role_label}</Badge>
                </div>
            </div>

            <div className="space-y-4">
                <Field label="الاسم" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(event) => set('name')(event.target.value)}
                        required
                    />
                </Field>

                <Field label="البريد الإلكتروني" required error={errors.email}>
                    <Input
                        type="email"
                        value={form.email}
                        onChange={(event) => set('email')(event.target.value)}
                        dir="ltr"
                        className="text-left"
                        required
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="رقم الهاتف" error={errors.phone}>
                        <Input
                            value={form.phone}
                            onChange={(event) => set('phone')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>

                    <Field label="واتساب" error={errors.whatsapp}>
                        <Input
                            value={form.whatsapp}
                            onChange={(event) => set('whatsapp')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                            inputMode="tel"
                        />
                    </Field>
                </div>
            </div>

            <Button type="submit" icon={Save} loading={update.isPending} block className="mt-6">
                حفظ البيانات
            </Button>
        </form>
    )
}

/* ── Password change ─────────────────────────────────────── */

function PasswordCard() {
    const toast = useToast()
    const update = useUpdatePassword()
    const [errors, setErrors] = useState<Record<string, string>>({})

    const empty = { current_password: '', password: '', password_confirmation: '' }
    const [form, setForm] = useState(empty)

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const mismatch =
        form.password.length > 0 &&
        form.password_confirmation.length > 0 &&
        form.password !== form.password_confirmation

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        setErrors({})

        if (mismatch) {
            setErrors({ password_confirmation: 'كلمتا المرور غير متطابقتين.' })

            return
        }

        try {
            await update.mutateAsync(form)
            setForm(empty)
            toast.success('تم تغيير كلمة المرور.')
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر تغيير كلمة المرور.'))
        }
    }

    return (
        <form onSubmit={handleSubmit} className="card h-fit p-5">
            <div className="mb-5 flex items-center gap-3">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                    <KeyRound className="size-5" />
                </div>
                <div className="min-w-0">
                    <p className="font-bold text-navy-900">كلمة المرور</p>
                    <p className="text-xs text-navy-400">٨ أحرف على الأقل</p>
                </div>
            </div>

            <div className="space-y-4">
                <Field label="كلمة المرور الحالية" required error={errors.current_password}>
                    <Input
                        type="password"
                        value={form.current_password}
                        onChange={(event) => set('current_password')(event.target.value)}
                        autoComplete="current-password"
                        dir="ltr"
                        className="text-left"
                        required
                    />
                </Field>

                <Field label="كلمة المرور الجديدة" required error={errors.password}>
                    <Input
                        type="password"
                        value={form.password}
                        onChange={(event) => set('password')(event.target.value)}
                        autoComplete="new-password"
                        dir="ltr"
                        className="text-left"
                        minLength={8}
                        required
                    />
                </Field>

                <Field
                    label="تأكيد كلمة المرور الجديدة"
                    required
                    error={errors.password_confirmation ?? (mismatch ? 'كلمتا المرور غير متطابقتين.' : undefined)}
                >
                    <Input
                        type="password"
                        value={form.password_confirmation}
                        onChange={(event) => set('password_confirmation')(event.target.value)}
                        autoComplete="new-password"
                        dir="ltr"
                        className="text-left"
                        minLength={8}
                        required
                    />
                </Field>
            </div>

            <Button
                type="submit"
                icon={ShieldCheck}
                loading={update.isPending}
                disabled={mismatch}
                block
                className="mt-6"
            >
                تغيير كلمة المرور
            </Button>
        </form>
    )
}

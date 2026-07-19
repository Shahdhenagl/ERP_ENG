import { LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Field, Input, PageLoader } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { areaFor } from '@/lib/nav'

export function Login() {
    const { user, loading, login } = useAuth()
    const navigate = useNavigate()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    if (loading) return <PageLoader />
    if (user) return <Navigate to={areaFor(user.role)} replace />

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        setError('')
        setSubmitting(true)

        try {
            const signedIn = await login(email, password)
            navigate(areaFor(signedIn.role), { replace: true })
        } catch (caught) {
            setError(errorMessage(caught, 'تعذّر تسجيل الدخول.'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="surface-brand flex min-h-dvh items-center justify-center p-4" dir="rtl">
            <div className="animate-in w-full max-w-md">
                <div className="mb-8 flex flex-col items-center text-center">
                    <img
                        src="/brand/logo-mark.png"
                        alt="City Engineering"
                        className="mb-5 size-24 object-contain"
                    />
                    <h1 className="text-2xl font-extrabold tracking-tight text-white">City Engineering</h1>
                    <p className="mt-1 text-sm text-brand-200">نظام إدارة التركيب والصيانة</p>
                </div>

                <form onSubmit={handleSubmit} className="rounded-3xl bg-white p-6 sm:p-8">
                    <h2 className="mb-6 text-lg font-bold text-navy-900">تسجيل الدخول</h2>

                    {error && (
                        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <Field label="البريد الإلكتروني" required>
                            <Input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="name@cityeng.com"
                                autoComplete="username"
                                dir="ltr"
                                className="text-left"
                                required
                                autoFocus
                            />
                        </Field>

                        <Field label="كلمة المرور" required>
                            <Input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                dir="ltr"
                                className="text-left"
                                required
                            />
                        </Field>
                    </div>

                    <Button type="submit" icon={LogIn} loading={submitting} block className="mt-7 py-3">
                        دخول
                    </Button>
                </form>

                <p className="mt-6 text-center text-xs text-brand-200/70">
                    Expertise in Standby Energy
                </p>
            </div>
        </div>
    )
}

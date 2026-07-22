import { Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useToast } from '@/components/Toast'
import { SectionTabs } from '@/components/SectionTabs'
import { Button, Field, Input, PageHeader, PageLoader, Textarea } from '@/components/ui'
import { ADMIN_SECTIONS } from '@/lib/sections'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useSaveSettings, useSettings } from '@/lib/queries'

/**
 * The letterhead. Everything here shows up on printed documents, which is why
 * the page says so rather than presenting a bare form.
 */
export function Settings() {
    const toast = useToast()
    const { data: settings, isLoading } = useSettings()
    const save = useSaveSettings()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [form, setForm] = useState<Record<string, string>>({})

    // Seeded once the fetch lands; typing after that must not be overwritten.
    useEffect(() => {
        if (settings) setForm(settings)
    }, [settings])

    if (isLoading || !settings) return <PageLoader />

    const set = (key: string) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        setErrors({})

        try {
            await save.mutateAsync(form)
            toast.success('تم حفظ بيانات الشركة.')
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر الحفظ.'))
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <PageHeader
                title="بيانات الشركة"
                subtitle="تظهر على الفواتير وعروض الأسعار وكشوف الحساب"
                actions={
                    <Button type="submit" icon={Save} loading={save.isPending}>
                        حفظ
                    </Button>
                }
            />

            <SectionTabs sections={ADMIN_SECTIONS} />

            <div className="grid gap-5 lg:grid-cols-2">
                <section className="card p-5">
                    <h2 className="mb-4 text-sm font-bold text-navy-800">الترويسة</h2>

                    <div className="space-y-4">
                        <Field label="اسم الشركة" required error={errors.company_name}>
                            <Input
                                value={form.company_name ?? ''}
                                onChange={(e) => set('company_name')(e.target.value)}
                            />
                        </Field>

                        <Field label="الوصف تحت الاسم" error={errors.company_tagline}>
                            <Input
                                value={form.company_tagline ?? ''}
                                onChange={(e) => set('company_tagline')(e.target.value)}
                            />
                        </Field>

                        <Field label="العنوان" error={errors.company_address}>
                            <Textarea
                                value={form.company_address ?? ''}
                                onChange={(e) => set('company_address')(e.target.value)}
                                rows={2}
                            />
                        </Field>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="الهاتف" error={errors.company_phone}>
                                <Input
                                    value={form.company_phone ?? ''}
                                    onChange={(e) => set('company_phone')(e.target.value)}
                                    dir="ltr"
                                    className="text-left"
                                />
                            </Field>

                            <Field label="البريد الإلكتروني" error={errors.company_email}>
                                <Input
                                    type="email"
                                    value={form.company_email ?? ''}
                                    onChange={(e) => set('company_email')(e.target.value)}
                                    dir="ltr"
                                    className="text-left"
                                />
                            </Field>
                        </div>
                    </div>
                </section>

                <section className="card h-fit p-5">
                    <h2 className="mb-4 text-sm font-bold text-navy-800">البيانات القانونية والافتراضية</h2>

                    <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                label="الرقم الضريبي"
                                error={errors.company_tax_id}
                                hint="مطلوب على الفواتير"
                            >
                                <Input
                                    value={form.company_tax_id ?? ''}
                                    onChange={(e) => set('company_tax_id')(e.target.value)}
                                    dir="ltr"
                                    className="text-left"
                                />
                            </Field>

                            <Field label="السجل التجاري" error={errors.company_commercial_id}>
                                <Input
                                    value={form.company_commercial_id ?? ''}
                                    onChange={(e) => set('company_commercial_id')(e.target.value)}
                                    dir="ltr"
                                    className="text-left"
                                />
                            </Field>
                        </div>

                        <Field
                            label="نسبة الضريبة الافتراضية %"
                            error={errors.default_tax_rate}
                            hint="تُقترح على كل فاتورة وعرض سعر جديد"
                        >
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={form.default_tax_rate ?? ''}
                                onChange={(e) => set('default_tax_rate')(e.target.value)}
                                dir="ltr"
                                className="text-left"
                            />
                        </Field>

                        <Field
                            label="تذييل الفاتورة"
                            error={errors.invoice_footer}
                            hint="بيانات الحساب البنكي مثلًا"
                        >
                            <Textarea
                                value={form.invoice_footer ?? ''}
                                onChange={(e) => set('invoice_footer')(e.target.value)}
                                rows={2}
                            />
                        </Field>

                        <Field
                            label="الشروط الافتراضية لعروض الأسعار"
                            error={errors.quotation_terms}
                            hint="يمكن تجاوزها في كل عرض على حدة"
                        >
                            <Textarea
                                value={form.quotation_terms ?? ''}
                                onChange={(e) => set('quotation_terms')(e.target.value)}
                                rows={3}
                            />
                        </Field>
                    </div>
                </section>
            </div>
        </form>
    )
}

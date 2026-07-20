import { Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useAssets, useCustomers, useSaveContract } from '@/lib/queries'
import type { Contract } from '@/types'

interface ContractFormProps {
    open: boolean
    onClose: () => void
    contract?: Contract
    /** Pre-selects the customer when opened from their page. */
    customerId?: number
    onSaved?: (contract: Contract) => void
}

export function ContractForm({ open, onClose, contract, customerId, onSaved }: ContractFormProps) {
    const toast = useToast()
    const save = useSaveContract(contract?.id)
    const { data: customers } = useCustomers({ per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        customer_id: String(contract?.customer_id ?? customerId ?? ''),
        title: contract?.title ?? '',
        starts_on: contract?.starts_on ?? new Date().toISOString().slice(0, 10),
        ends_on: contract?.ends_on ?? '',
        visits_per_year: String(contract?.visits_per_year ?? 4),
        value: contract?.value ?? '',
        sla_response_hours: contract?.sla_response_hours?.toString() ?? '',
        sla_resolution_hours: contract?.sla_resolution_hours?.toString() ?? '',
        notes: contract?.notes ?? '',
    })

    const [assetIds, setAssetIds] = useState<number[]>(contract?.assets?.map((a) => a.id) ?? [])

    // Only the selected customer's devices can be covered, so there is nothing
    // to pick from until one is chosen.
    const { data: assets } = useAssets({
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        per_page: 100,
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const toggleAsset = (id: number) =>
        setAssetIds((current) =>
            current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
        )

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                customer_id: Number(form.customer_id),
                title: form.title || null,
                starts_on: form.starts_on,
                ends_on: form.ends_on,
                visits_per_year: Number(form.visits_per_year),
                value: form.value ? Number(form.value) : null,
                sla_response_hours: form.sla_response_hours ? Number(form.sla_response_hours) : null,
                sla_resolution_hours: form.sla_resolution_hours ? Number(form.sla_resolution_hours) : null,
                asset_ids: assetIds,
                notes: form.notes || null,
            })

            toast.success(contract ? 'تم تعديل العقد.' : 'تم إنشاء العقد كمسودة.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ العقد.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={contract ? `تعديل ${contract.code}` : 'عقد صيانة جديد'}
            description={
                contract
                    ? undefined
                    : 'يُنشأ كمسودة — الزيارات تُجدول عند التفعيل.'
            }
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button icon={Save} onClick={handleSave} loading={save.isPending}>
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="العميل" required error={errors.customer_id}>
                    <Select
                        value={form.customer_id}
                        onChange={(event) => {
                            set('customer_id')(event.target.value)
                            // The old picks belong to the previous customer.
                            setAssetIds([])
                        }}
                    >
                        <option value="">— اختر العميل —</option>
                        {customers?.data.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                                {customer.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="اسم العقد" hint="اختياري — مثل «عقد صيانة سنوي شامل»" error={errors.title}>
                    <Input value={form.title} onChange={(event) => set('title')(event.target.value)} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="تاريخ البداية" required error={errors.starts_on}>
                        <Input
                            type="date"
                            value={form.starts_on}
                            onChange={(event) => set('starts_on')(event.target.value)}
                        />
                    </Field>

                    <Field label="تاريخ النهاية" required error={errors.ends_on}>
                        <Input
                            type="date"
                            value={form.ends_on}
                            onChange={(event) => set('ends_on')(event.target.value)}
                        />
                    </Field>
                </div>

                <Field
                    label="عدد الزيارات سنويًا"
                    required
                    hint="تُوزَّع تلقائيًا على مدة العقد بمسافات متساوية."
                    error={errors.visits_per_year}
                >
                    <Select
                        value={form.visits_per_year}
                        onChange={(event) => set('visits_per_year')(event.target.value)}
                    >
                        <option value="1">مرة سنويًا</option>
                        <option value="2">مرتان سنويًا</option>
                        <option value="3">٣ زيارات</option>
                        <option value="4">٤ زيارات (ربع سنوي)</option>
                        <option value="6">٦ زيارات</option>
                        <option value="12">١٢ زيارة (شهري)</option>
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                        label="زمن الاستجابة (ساعة)"
                        hint="من فتح البلاغ حتى قبول الفني."
                        error={errors.sla_response_hours}
                    >
                        <Input
                            type="number"
                            min={1}
                            value={form.sla_response_hours}
                            onChange={(event) => set('sla_response_hours')(event.target.value)}
                        />
                    </Field>

                    <Field
                        label="زمن الإنجاز (ساعة)"
                        hint="من فتح البلاغ حتى إقفال المهمة."
                        error={errors.sla_resolution_hours}
                    >
                        <Input
                            type="number"
                            min={1}
                            value={form.sla_resolution_hours}
                            onChange={(event) => set('sla_resolution_hours')(event.target.value)}
                        />
                    </Field>
                </div>

                <Field label="قيمة العقد" hint="بالجنيه المصري — اختياري." error={errors.value}>
                    <Input
                        type="number"
                        min={0}
                        value={form.value}
                        onChange={(event) => set('value')(event.target.value)}
                    />
                </Field>

                {/* No selection means the contract covers everything the customer
                    owns, including devices bought later. */}
                {Boolean(assets?.data.length) && (
                    <Field
                        label="الأجهزة المغطاة"
                        hint="اتركها فارغة ليغطي العقد كل أجهزة العميل."
                        error={errors.asset_ids}
                    >
                        <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl bg-navy-50 p-2">
                            {assets?.data.map((asset) => (
                                <label
                                    key={asset.id}
                                    className="tap flex cursor-pointer items-center gap-2.5 rounded-lg bg-white p-2.5 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={assetIds.includes(asset.id)}
                                        onChange={() => toggleAsset(asset.id)}
                                        className="size-4 shrink-0 accent-brand-600"
                                    />
                                    <span className="min-w-0 flex-1 truncate font-semibold text-navy-800">
                                        {asset.label}
                                    </span>
                                    <span className="tabular shrink-0 text-[11px] text-navy-400">
                                        {asset.code}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </Field>
                )}

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        rows={3}
                        value={form.notes}
                        onChange={(event) => set('notes')(event.target.value)}
                    />
                </Field>
            </div>
        </Modal>
    )
}

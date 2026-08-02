import { Save } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { ASSET_STATUS, COMM_PORTS, formatQty, UPS_PHASES, UPS_TYPES } from '@/lib/domain'
import { useCustomers, useItems, useSaveAsset } from '@/lib/queries'
import type { Asset, AssetStatus, Item } from '@/types'

interface AssetFormProps {
    open: boolean
    onClose: () => void
    asset?: Asset
    /** Pre-selects the owner when opened from a customer's page. */
    customerId?: number
    /** Pre-links a stock UPS item — set when installing straight from inventory. */
    stockItem?: Item
    onSaved?: (asset: Asset) => void
}

export function AssetForm({ open, onClose, asset, customerId, stockItem, onSaved }: AssetFormProps) {
    const toast = useToast()
    const save = useSaveAsset(asset?.id)
    const { data: customers } = useCustomers({ per_page: 200 })
    // The catalogue UPS units on the shelf — the picker is shown only when
    // registering a new device, so the list is what it draws from.
    const { data: upsItems } = useItems({ category: 'ups', per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const preset = stockItem?.specs ?? {}

    const [form, setForm] = useState({
        serial: asset?.serial ?? '',
        name: asset?.name ?? stockItem?.name ?? '',
        asset_number: asset?.asset_number ?? '',
        barcode: asset?.barcode ?? '',
        customer_id: String(asset?.customer_id ?? customerId ?? ''),
        item_id: String(asset?.item_id ?? stockItem?.id ?? ''),
        brand: asset?.brand ?? preset.brand ?? '',
        model: asset?.model ?? preset.model ?? '',
        ups_type: asset?.ups_type ?? preset.ups_type ?? '',
        phase: asset?.phase ?? preset.phase ?? '',
        capacity: asset?.capacity ?? preset.capacity ?? '',
        input_voltage: asset?.input_voltage ?? preset.input_voltage ?? '',
        output_voltage: asset?.output_voltage ?? preset.output_voltage ?? '',
        frequency: asset?.frequency ?? preset.frequency ?? '',
        efficiency: asset?.efficiency ?? preset.efficiency ?? '',
        power_factor: asset?.power_factor ?? preset.power_factor ?? '',
        battery_voltage: asset?.battery_voltage ?? preset.battery_voltage ?? '',
        battery_count: asset?.battery_count?.toString() ?? preset.battery_count ?? '',
        backup_minutes: asset?.backup_minutes?.toString() ?? preset.backup_minutes ?? '',
        comm_port: asset?.comm_port ?? preset.comm_port ?? '',
        site_address: asset?.site_address ?? '',
        sold_at: asset?.sold_at ?? '',
        warranty_months: asset?.warranty_months?.toString() ?? '',
        installed_at: asset?.installed_at ?? '',
        status: (asset?.status ?? 'active') as AssetStatus,
        notes: asset?.notes ?? '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    // UPS items that actually have something on the shelf to install.
    const installable = useMemo(
        () => (upsItems?.data ?? []).filter((item) => item.total_qty > 0),
        [upsItems],
    )

    /** Copy a chosen stock item's nameplate into the blank fields. */
    const chooseItem = (id: string) => {
        const item = installable.find((candidate) => String(candidate.id) === id)
        setForm((current) => ({
            ...current,
            item_id: id,
            name: current.name || item?.name || '',
            brand: current.brand || item?.specs?.brand || '',
            model: current.model || item?.specs?.model || '',
            ups_type: current.ups_type || item?.specs?.ups_type || '',
            phase: current.phase || item?.specs?.phase || '',
            capacity: current.capacity || item?.specs?.capacity || '',
            input_voltage: current.input_voltage || item?.specs?.input_voltage || '',
            output_voltage: current.output_voltage || item?.specs?.output_voltage || '',
            frequency: current.frequency || item?.specs?.frequency || '',
            efficiency: current.efficiency || item?.specs?.efficiency || '',
            power_factor: current.power_factor || item?.specs?.power_factor || '',
            battery_voltage: current.battery_voltage || item?.specs?.battery_voltage || '',
            battery_count: current.battery_count || item?.specs?.battery_count || '',
            backup_minutes: current.backup_minutes || item?.specs?.backup_minutes || '',
            comm_port: current.comm_port || item?.specs?.comm_port || '',
        }))
    }

    const handleSave = async () => {
        setErrors({})

        try {
            const saved = await save.mutateAsync({
                serial: form.serial || null,
                name: form.name || null,
                asset_number: form.asset_number || null,
                barcode: form.barcode || null,
                customer_id: Number(form.customer_id),
                // Only meaningful on a new record: sending it draws one off the shelf.
                item_id: !asset && form.item_id ? Number(form.item_id) : null,
                brand: form.brand || null,
                model: form.model || null,
                ups_type: form.ups_type || null,
                phase: form.phase || null,
                capacity: form.capacity || null,
                input_voltage: form.input_voltage || null,
                output_voltage: form.output_voltage || null,
                frequency: form.frequency || null,
                efficiency: form.efficiency || null,
                power_factor: form.power_factor || null,
                battery_voltage: form.battery_voltage || null,
                battery_count: form.battery_count ? Number(form.battery_count) : null,
                backup_minutes: form.backup_minutes ? Number(form.backup_minutes) : null,
                comm_port: form.comm_port || null,
                site_address: form.site_address || null,
                sold_at: form.sold_at || null,
                warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
                installed_at: form.installed_at || null,
                status: form.status,
                notes: form.notes || null,
            })

            toast.success(asset ? 'تم تعديل الجهاز.' : 'تم تسجيل الجهاز.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ الجهاز.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={asset ? `تعديل ${asset.code}` : 'تسجيل جهاز جديد'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        {tr('إلغاء')}
                    </Button>
                    <Button icon={Save} onClick={handleSave} loading={save.isPending}>
                        {tr('حفظ')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="العميل المالك" required error={errors.customer_id}>
                    <Select
                        value={form.customer_id}
                        onChange={(event) => set('customer_id')(event.target.value)}
                    >
                        <option value="">— اختر العميل —</option>
                        {customers?.data.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                                {customer.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                {/* Drawing from stock — only when registering a new unit. */}
                {!asset && (
                    <Field
                        label="من المخزون (اختياري)"
                        error={errors.item_id}
                        hint="اختيار صنف UPS من المخزون ينقص وحدة عند الحفظ ويملأ المواصفات"
                    >
                        <Select value={form.item_id} onChange={(event) => chooseItem(event.target.value)}>
                            <option value="">بدون خصم من المخزون</option>
                            {installable.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name} — متاح {formatQty(item.total_qty)} {item.unit}
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}

                <Field
                    label="الرقم التسلسلي"
                    error={errors.serial}
                    hint="يمكن تركه فارغًا الآن وإضافته لاحقًا"
                >
                    <Input
                        value={form.serial}
                        onChange={(event) => set('serial')(event.target.value)}
                        dir="ltr"
                        className="text-left"
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم الجهاز" error={errors.name}>
                        <Input value={form.name} onChange={(event) => set('name')(event.target.value)} />
                    </Field>

                    <Field label="رقم الأصل" error={errors.asset_number}>
                        <Input
                            value={form.asset_number}
                            onChange={(event) => set('asset_number')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="الباركود / QR" error={errors.barcode}>
                        <Input
                            value={form.barcode}
                            onChange={(event) => set('barcode')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="الحالة" error={errors.status}>
                        <Select
                            value={form.status}
                            onChange={(event) => set('status')(event.target.value)}
                        >
                            {Object.entries(ASSET_STATUS).map(([value, meta]) => (
                                <option key={value} value={value}>
                                    {meta.label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="الشركة المصنّعة" error={errors.brand}>
                        <Input value={form.brand} onChange={(event) => set('brand')(event.target.value)} />
                    </Field>

                    <Field label="الموديل" error={errors.model}>
                        <Input value={form.model} onChange={(event) => set('model')(event.target.value)} />
                    </Field>

                    <Field label="نوع الـUPS" error={errors.ups_type}>
                        <Select value={form.ups_type} onChange={(event) => set('ups_type')(event.target.value)}>
                            <option value="">— غير محدد —</option>
                            {Object.entries(UPS_TYPES).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="عدد الأوجه (Phase)" error={errors.phase}>
                        <Select value={form.phase} onChange={(event) => set('phase')(event.target.value)}>
                            <option value="">— غير محدد —</option>
                            {Object.entries(UPS_PHASES).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="القدرة (VA/kVA)" error={errors.capacity}>
                        <Input
                            value={form.capacity}
                            onChange={(event) => set('capacity')(event.target.value)}
                            placeholder="20 kVA"
                        />
                    </Field>
                </div>

                {/* ── Technical specifications ─────────────── */}
                <div className="rounded-2xl bg-navy-50 p-4">
                    <p className="mb-3 text-xs font-bold text-navy-500">المواصفات الفنية (من لوحة الجهاز)</p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="جهد الإدخال" error={errors.input_voltage}>
                            <Input value={form.input_voltage} onChange={(e) => set('input_voltage')(e.target.value)} placeholder="220V / 380V" dir="ltr" className="text-left" />
                        </Field>
                        <Field label="جهد الخرج" error={errors.output_voltage}>
                            <Input value={form.output_voltage} onChange={(e) => set('output_voltage')(e.target.value)} placeholder="220V" dir="ltr" className="text-left" />
                        </Field>
                        <Field label="التردد" error={errors.frequency}>
                            <Input value={form.frequency} onChange={(e) => set('frequency')(e.target.value)} placeholder="50Hz" dir="ltr" className="text-left" />
                        </Field>
                        <Field label="الكفاءة" error={errors.efficiency}>
                            <Input value={form.efficiency} onChange={(e) => set('efficiency')(e.target.value)} placeholder="95%" dir="ltr" className="text-left" />
                        </Field>
                        <Field label="معامل القدرة" error={errors.power_factor}>
                            <Input value={form.power_factor} onChange={(e) => set('power_factor')(e.target.value)} placeholder="0.9" dir="ltr" className="text-left" />
                        </Field>
                        <Field label="جهد البطارية" error={errors.battery_voltage}>
                            <Input value={form.battery_voltage} onChange={(e) => set('battery_voltage')(e.target.value)} placeholder="12V / 240V" dir="ltr" className="text-left" />
                        </Field>
                        <Field label="عدد البطاريات" error={errors.battery_count}>
                            <Input type="number" min={0} value={form.battery_count} onChange={(e) => set('battery_count')(e.target.value)} dir="ltr" className="text-left" />
                        </Field>
                        <Field label="مدة التشغيل (دقيقة)" error={errors.backup_minutes}>
                            <Input type="number" min={0} value={form.backup_minutes} onChange={(e) => set('backup_minutes')(e.target.value)} dir="ltr" className="text-left" placeholder="10" />
                        </Field>
                        <Field label="منفذ الاتصال" error={errors.comm_port}>
                            <Select value={form.comm_port} onChange={(e) => set('comm_port')(e.target.value)}>
                                <option value="">— غير محدد —</option>
                                {COMM_PORTS.map((port) => (
                                    <option key={port} value={port}>
                                        {port}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                </div>

                <div className="rounded-2xl bg-navy-50 p-4">
                    <p className="mb-3 text-xs font-bold text-navy-500">
                        {tr('الضمان — يُحتسب من تاريخ البيع')}
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="تاريخ البيع" error={errors.sold_at}>
                            <Input
                                type="date"
                                value={form.sold_at}
                                onChange={(event) => set('sold_at')(event.target.value)}
                            />
                        </Field>

                        <Field label="مدة الضمان (شهر)" error={errors.warranty_months}>
                            <Input
                                type="number"
                                min={0}
                                value={form.warranty_months}
                                onChange={(event) => set('warranty_months')(event.target.value)}
                                placeholder="24"
                            />
                        </Field>
                    </div>

                    {(!form.sold_at || !form.warranty_months) && (
                        <p className="mt-2 text-xs text-navy-400">
                            {tr('بدون التاريخ والمدة معًا ستظهر حالة الضمان «غير محدد».')}
                        </p>
                    )}
                </div>

                <Field label="تاريخ التركيب" error={errors.installed_at}>
                    <Input
                        type="date"
                        value={form.installed_at}
                        onChange={(event) => set('installed_at')(event.target.value)}
                    />
                </Field>

                <Field label="موقع الجهاز" error={errors.site_address}>
                    <Textarea
                        value={form.site_address}
                        onChange={(event) => set('site_address')(event.target.value)}
                        placeholder="الدور، الغرفة، أو أي وصف يساعد الفني على الوصول"
                    />
                </Field>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        value={form.notes}
                        onChange={(event) => set('notes')(event.target.value)}
                    />
                </Field>
            </div>
        </Modal>
    )
}

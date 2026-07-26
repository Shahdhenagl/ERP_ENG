import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { BATTERY_TYPES, formatQty } from '@/lib/domain'
import { useAssets, useItems, useSaveBattery } from '@/lib/queries'
import type { Item } from '@/types'

interface BatteryFormProps {
    onClose: () => void
    /** Pre-links a stock battery item — set when installing straight from inventory. */
    stockItem?: Item
    onSaved?: () => void
}

/**
 * Register a battery bank. When a stock item is chosen it carries the nameplate
 * and price down, and the backend draws the whole count off the shelf.
 */
export function BatteryForm({ onClose, stockItem, onSaved }: BatteryFormProps) {
    const toast = useToast()
    const save = useSaveBattery()
    const { data: assets } = useAssets({ per_page: 500 })
    const { data: batteryItems } = useItems({ category: 'battery', per_page: 200 })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const preset = stockItem?.specs ?? {}

    const [form, setForm] = useState({
        asset_id: '',
        item_id: stockItem?.id ? String(stockItem.id) : '',
        serial_number: '',
        name: stockItem?.name ?? '',
        asset_tag: '',
        barcode: '',
        brand: preset.brand ?? '',
        model: preset.model ?? '',
        battery_type: preset.battery_type ?? '',
        size: preset.size ?? '',
        capacity_ah: preset.capacity_ah ?? '',
        voltage: preset.voltage ?? '',
        energy_wh: preset.energy_wh ?? '',
        count: '1',
        terminal_type: preset.terminal_type ?? '',
        internal_resistance: preset.internal_resistance ?? '',
        weight: preset.weight ?? '',
        dimensions: preset.dimensions ?? '',
        operating_temperature: preset.operating_temperature ?? '',
        unit_cost: stockItem ? String(stockItem.avg_cost || '') : '',
        sell_price: stockItem?.sell_price != null ? String(stockItem.sell_price) : '',
        installed_on: new Date().toISOString().slice(0, 10),
        life_months: '24',
        warranty_months: '',
        notes: '',
    })

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }))

    const installable = useMemo(
        () => (batteryItems?.data ?? []).filter((item) => item.total_qty > 0),
        [batteryItems],
    )

    /** Copy a chosen stock item's nameplate and price into the blank fields. */
    const chooseItem = (id: string) => {
        const item = installable.find((candidate) => String(candidate.id) === id)
        const s = item?.specs ?? {}
        setForm((current) => ({
            ...current,
            item_id: id,
            name: current.name || item?.name || '',
            brand: current.brand || s.brand || '',
            model: current.model || s.model || '',
            battery_type: current.battery_type || s.battery_type || '',
            size: current.size || s.size || '',
            capacity_ah: current.capacity_ah || s.capacity_ah || '',
            voltage: current.voltage || s.voltage || '',
            energy_wh: current.energy_wh || s.energy_wh || '',
            terminal_type: current.terminal_type || s.terminal_type || '',
            internal_resistance: current.internal_resistance || s.internal_resistance || '',
            weight: current.weight || s.weight || '',
            dimensions: current.dimensions || s.dimensions || '',
            operating_temperature: current.operating_temperature || s.operating_temperature || '',
            unit_cost: current.unit_cost || (item ? String(item.avg_cost || '') : ''),
            sell_price:
                current.sell_price || (item?.sell_price != null ? String(item.sell_price) : ''),
        }))
    }

    return (
        <Modal
            open
            onClose={onClose}
            title="تسجيل بطارية"
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                        إلغاء
                    </Button>
                    <Button
                        loading={save.isPending}
                        onClick={async () => {
                            setErrors({})
                            try {
                                await save.mutateAsync({
                                    asset_id: form.asset_id ? Number(form.asset_id) : null,
                                    item_id: form.item_id ? Number(form.item_id) : null,
                                    serial_number: form.serial_number || null,
                                    name: form.name || null,
                                    asset_tag: form.asset_tag || null,
                                    barcode: form.barcode || null,
                                    brand: form.brand || null,
                                    model: form.model || null,
                                    battery_type: form.battery_type || null,
                                    size: form.size || null,
                                    capacity_ah: form.capacity_ah ? Number(form.capacity_ah) : null,
                                    voltage: form.voltage ? Number(form.voltage) : null,
                                    energy_wh: form.energy_wh || null,
                                    count: Number(form.count) || 1,
                                    terminal_type: form.terminal_type || null,
                                    internal_resistance: form.internal_resistance || null,
                                    weight: form.weight || null,
                                    dimensions: form.dimensions || null,
                                    operating_temperature: form.operating_temperature || null,
                                    unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
                                    sell_price: form.sell_price ? Number(form.sell_price) : null,
                                    installed_on: form.installed_on,
                                    life_months: Number(form.life_months) || 24,
                                    warranty_months: form.warranty_months
                                        ? Number(form.warranty_months)
                                        : null,
                                    notes: form.notes || null,
                                })
                                toast.success('تم تسجيل البطارية.')
                                onSaved?.()
                                onClose()
                            } catch (caught) {
                                setErrors(fieldErrors(caught))
                                toast.error(errorMessage(caught, 'تعذّر الحفظ.'))
                            }
                        }}
                    >
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {/* Drawing from stock — fills the nameplate and price, deducts the count. */}
                <Field
                    label="من المخزون (اختياري)"
                    error={errors.item_id}
                    hint="اختيار صنف بطارية ينقص عدد الخلايا من المخزون عند الحفظ"
                >
                    <Select value={form.item_id} onChange={(e) => chooseItem(e.target.value)}>
                        <option value="">بدون خصم من المخزون</option>
                        {installable.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name} — متاح {formatQty(item.total_qty)} {item.unit}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="الجهاز (UPS)" error={errors.asset_id} hint="يُنسب مالك البطارية من الجهاز">
                    <Select value={form.asset_id} onChange={(e) => set('asset_id')(e.target.value)}>
                        <option value="">بدون ربط</option>
                        {assets?.data.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                                {asset.code} — {asset.brand} {asset.model}
                                {asset.customer ? ` · ${asset.customer}` : ''}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="الماركة" error={errors.brand}>
                        <Input value={form.brand} onChange={(e) => set('brand')(e.target.value)} />
                    </Field>
                    <Field label="الموديل" error={errors.model}>
                        <Input value={form.model} onChange={(e) => set('model')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="السعة (Ah)" error={errors.capacity_ah}>
                        <Input type="number" value={form.capacity_ah} onChange={(e) => set('capacity_ah')(e.target.value)} />
                    </Field>
                    <Field label="الجهد (V)" error={errors.voltage}>
                        <Input type="number" value={form.voltage} onChange={(e) => set('voltage')(e.target.value)} />
                    </Field>
                    <Field label="عدد الخلايا" error={errors.count}>
                        <Input type="number" min={1} value={form.count} onChange={(e) => set('count')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="تاريخ التركيب" required error={errors.installed_on}>
                        <Input type="date" value={form.installed_on} onChange={(e) => set('installed_on')(e.target.value)} />
                    </Field>
                    <Field label="العمر المتوقع (شهر)" required error={errors.life_months}>
                        <Input type="number" min={1} value={form.life_months} onChange={(e) => set('life_months')(e.target.value)} />
                    </Field>
                    <Field label="الضمان (شهر)" error={errors.warranty_months}>
                        <Input type="number" value={form.warranty_months} onChange={(e) => set('warranty_months')(e.target.value)} />
                    </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم البطارية" error={errors.name}>
                        <Input value={form.name} onChange={(e) => set('name')(e.target.value)} />
                    </Field>
                    <Field label="نوع البطارية" error={errors.battery_type}>
                        <Select value={form.battery_type} onChange={(e) => set('battery_type')(e.target.value)}>
                            <option value="">— غير محدد —</option>
                            {Object.entries(BATTERY_TYPES).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="الرقم التسلسلي" error={errors.serial_number}>
                        <Input value={form.serial_number} onChange={(e) => set('serial_number')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="رقم الأصل" error={errors.asset_tag}>
                        <Input value={form.asset_tag} onChange={(e) => set('asset_tag')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="الباركود / QR" error={errors.barcode}>
                        <Input value={form.barcode} onChange={(e) => set('barcode')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="المقاس" error={errors.size}>
                        <Input value={form.size} onChange={(e) => set('size')(e.target.value)} />
                    </Field>
                </div>

                {/* ── Technical specifications ─────────────── */}
                <div className="rounded-2xl bg-navy-50 p-4">
                    <p className="mb-3 text-xs font-bold text-navy-500">المواصفات الفنية</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="الطاقة (Wh)" error={errors.energy_wh}>
                            <Input value={form.energy_wh} onChange={(e) => set('energy_wh')(e.target.value)} dir="ltr" className="text-left" placeholder="1200Wh" />
                        </Field>
                        <Field label="نوع الطرف" error={errors.terminal_type}>
                            <Input value={form.terminal_type} onChange={(e) => set('terminal_type')(e.target.value)} />
                        </Field>
                        <Field label="المقاومة الداخلية" error={errors.internal_resistance}>
                            <Input value={form.internal_resistance} onChange={(e) => set('internal_resistance')(e.target.value)} dir="ltr" className="text-left" placeholder="5.2 mΩ" />
                        </Field>
                        <Field label="الوزن" error={errors.weight}>
                            <Input value={form.weight} onChange={(e) => set('weight')(e.target.value)} dir="ltr" className="text-left" placeholder="12 kg" />
                        </Field>
                        <Field label="الأبعاد" error={errors.dimensions}>
                            <Input value={form.dimensions} onChange={(e) => set('dimensions')(e.target.value)} dir="ltr" className="text-left" placeholder="165×175×350mm" />
                        </Field>
                        <Field label="درجة حرارة التشغيل" error={errors.operating_temperature}>
                            <Input value={form.operating_temperature} onChange={(e) => set('operating_temperature')(e.target.value)} dir="ltr" className="text-left" placeholder="-15°C ~ 50°C" />
                        </Field>
                    </div>
                </div>

                {/* ── Pricing ──────────────────────────────── */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="التكلفة" error={errors.unit_cost}>
                        <Input type="number" min={0} step="0.01" value={form.unit_cost} onChange={(e) => set('unit_cost')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                    <Field label="سعر البيع" error={errors.sell_price}>
                        <Input type="number" min={0} step="0.01" value={form.sell_price} onChange={(e) => set('sell_price')(e.target.value)} dir="ltr" className="text-left" />
                    </Field>
                </div>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

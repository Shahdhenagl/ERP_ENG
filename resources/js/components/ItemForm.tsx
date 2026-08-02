import { Save } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { errorMessage, fieldErrors } from '@/lib/api'
import { BATTERY_TYPES, COMM_PORTS, ITEM_CATEGORY, UPS_PHASES, UPS_TYPES } from '@/lib/domain'
import { useItemGroups, useSaveItem, useWarehouses } from '@/lib/queries'
import type { Item, ItemCategory } from '@/types'

interface ItemFormProps {
    open: boolean
    onClose: () => void
    item?: Item
    /** Pre-selects the group when opened from one of the inventory tabs. */
    defaultCategory?: ItemCategory
    /** Pre-selects the group when opened from that group's own button. */
    defaultGroupId?: number
    onSaved?: (item: Item) => void
}

/** The nameplate keys collected for each kind — the payload sends only these. */
const UPS_SPECS = [
    'brand', 'model', 'ups_type', 'phase', 'capacity', 'input_voltage',
    'output_voltage', 'frequency', 'efficiency', 'power_factor',
    'battery_voltage', 'battery_count', 'backup_minutes', 'comm_port',
] as const

const BATTERY_SPECS = [
    'brand', 'model', 'battery_type', 'size', 'capacity_ah', 'voltage',
    'energy_wh', 'terminal_type', 'internal_resistance', 'weight',
    'dimensions', 'operating_temperature',
] as const

type SpecKey = (typeof UPS_SPECS)[number] | (typeof BATTERY_SPECS)[number]

export function ItemForm({
    open,
    onClose,
    item,
    defaultCategory,
    defaultGroupId,
    onSaved,
}: ItemFormProps) {
    const toast = useToast()
    const save = useSaveItem(item?.id)
    const [errors, setErrors] = useState<Record<string, string>>({})

    // The groups the store manages. Adding or renaming one has to reach this
    // list, which is the whole point of them being editable.
    const { data: groupList } = useItemGroups()
    const groups = (groupList ?? []).filter((group) => group.is_active)

    const [groupId, setGroupId] = useState(
        String(item?.item_category_id ?? defaultGroupId ?? ''),
    )

    // Opened from a group's own "new item" button, or from an item filed before
    // groups existed: settle on the group its fixed kind maps to.
    const fallbackSlug = item?.category ?? defaultCategory
    const effectiveGroup =
        groups.find((group) => String(group.id) === groupId)
        ?? (groupId ? undefined : groups.find((group) => group.slug === fallbackSlug))

    const [form, setForm] = useState({
        name: item?.name ?? '',
        barcode: item?.barcode ?? '',
        category: (item?.category ?? defaultCategory ?? 'spare_part') as ItemCategory,
        unit: item?.unit ?? 'قطعة',
        sell_price: item?.sell_price?.toString() ?? '',
        reorder_level: item?.reorder_level?.toString() ?? '',
        notes: item?.notes ?? '',
        is_active: item?.is_active ?? true,
    })

    // What is already on the shelf, asked for once when the item is first added.
    // Editing an item never touches the balance: a quantity that moves without a
    // movement behind it is a number nobody can explain a month later. After
    // this, stock changes through a receipt, an issue or a stocktake.
    const [openingQty, setOpeningQty] = useState('')
    const [openingCost, setOpeningCost] = useState('')
    const [openingWarehouse, setOpeningWarehouse] = useState('')
    const { data: warehouses } = useWarehouses()
    const stores = (warehouses ?? []).filter((warehouse) => warehouse.type === 'store')

    // The nameplate is kept in its own bag so switching category never mixes a
    // UPS field into a battery's payload.
    const [specs, setSpecs] = useState<Record<string, string>>(() => ({ ...(item?.specs ?? {}) }))

    const set = (key: keyof typeof form) => (value: string | boolean) =>
        setForm((current) => ({ ...current, [key]: value }))

    const setSpec = (key: SpecKey) => (value: string) =>
        setSpecs((current) => ({ ...current, [key]: value }))

    const isUps = form.category === 'ups'
    const isBattery = form.category === 'battery'
    const hasSpecs = isUps || isBattery

    const handleSave = async () => {
        setErrors({})

        // Saved without one, an item shows up under "الكل" and under no group
        // at all — invisible on the tab anyone would look for it on.
        if (! effectiveGroup) {
            setErrors({ item_category_id: 'اختر المجموعة التي يُصنَّف تحتها الصنف.' })

            return
        }

        // Only the keys this category owns are sent; blanks are dropped server-side.
        const keys = isUps ? UPS_SPECS : isBattery ? BATTERY_SPECS : []
        const payloadSpecs = keys.reduce<Record<string, string>>((acc, key) => {
            const value = specs[key]?.trim()
            if (value) acc[key] = value
            return acc
        }, {})

        try {
            const saved = await save.mutateAsync({
                name: form.name,
                barcode: form.barcode || null,
                category: form.category,
                item_category_id: effectiveGroup?.id ?? null,
                unit: form.unit,
                sell_price: form.sell_price ? Number(form.sell_price) : null,
                reorder_level: form.reorder_level ? Number(form.reorder_level) : 0,
                specs: hasSpecs ? payloadSpecs : null,
                notes: form.notes || null,
                is_active: form.is_active,
                ...(item || !Number(openingQty)
                    ? {}
                    : {
                          opening_qty: Number(openingQty),
                          opening_cost: Number(openingCost) || 0,
                          opening_warehouse_id: openingWarehouse ? Number(openingWarehouse) : null,
                      }),
            })

            toast.success(item ? 'تم تعديل الصنف.' : 'تم إضافة الصنف.')
            onSaved?.(saved)
            onClose()
        } catch (caught) {
            setErrors(fieldErrors(caught))
            toast.error(errorMessage(caught, 'تعذّر حفظ الصنف.'))
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={
                item
                    ? `تعديل ${item.code}`
                    : `${effectiveGroup?.name ?? ITEM_CATEGORY[form.category].label} — صنف جديد`
            }
            size={hasSpecs ? 'lg' : 'md'}
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
                <Field label="اسم الصنف" required error={errors.name}>
                    <Input
                        value={form.name}
                        onChange={(event) => set('name')(event.target.value)}
                        placeholder={isUps ? 'UPS 20kVA Online' : isBattery ? 'بطارية 12V 100Ah' : ''}
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Picking a group also settles the kind: the four groups
                        that came with the system carry a slug, and that slug is
                        what decides whether a nameplate is asked for. A group
                        the store invented behaves as a plain part. */}
                    <Field label="التصنيف / المجموعة" required error={errors.item_category_id}>
                        <Select
                            value={String(effectiveGroup?.id ?? '')}
                            onChange={(event) => {
                                const picked = groups.find(
                                    (group) => String(group.id) === event.target.value,
                                )

                                setGroupId(event.target.value)
                                setForm((current) => ({
                                    ...current,
                                    category: (picked?.slug ?? 'spare_part') as ItemCategory,
                                }))
                            }}
                        >
                            <option value="">— اختر المجموعة —</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="الوحدة" required error={errors.unit}>
                        <Input
                            value={form.unit}
                            onChange={(event) => set('unit')(event.target.value)}
                            placeholder="قطعة / متر"
                        />
                    </Field>

                    {/* One code per item, and on the shelf it is the number
                        stamped on the device. A second "supplier code" beside
                        it was asked for once and filled in never — two boxes
                        for one number is how half a catalogue ends up coded
                        under the wrong one. */}
                    <Field
                        label="سيريال الجهاز"
                        error={errors.barcode}
                        hint="السيريال أو الباركود المطبوع على الجهاز"
                    >
                        <Input
                            value={form.barcode}
                            onChange={(event) => set('barcode')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field label="سعر البيع" error={errors.sell_price} hint="السعر الذي تعرضه به">
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.sell_price}
                            onChange={(event) => set('sell_price')(event.target.value)}
                            dir="ltr"
                            className="text-left"
                        />
                    </Field>

                    <Field
                        label="حد إعادة الطلب"
                        error={errors.reorder_level}
                        hint="ينبّهك عندما يقل الرصيد عنه"
                    >
                        <Input
                            type="number"
                            min={0}
                            value={form.reorder_level}
                            onChange={(event) => set('reorder_level')(event.target.value)}
                        />
                    </Field>
                </div>

                {/* ── Opening stock ─────────────────────────── */}
                {!item && (
                    <div className="rounded-2xl bg-navy-50 p-4">
                        <p className="mb-3 text-xs font-bold text-navy-500">
                            الرصيد الافتتاحي — الكمية الموجودة فعلًا الآن (اختياري)
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="الكمية" error={errors.opening_qty}>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    value={openingQty}
                                    onChange={(event) => setOpeningQty(event.target.value)}
                                    placeholder="0"
                                />
                            </Field>

                            <Field
                                label="سعر شراء الوحدة"
                                error={errors.opening_cost}
                                hint="التكلفة التي تُقيَّم بها هذه الكمية"
                            >
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={openingCost}
                                    onChange={(event) => setOpeningCost(event.target.value)}
                                    dir="ltr"
                                    className="text-left"
                                    placeholder="0.00"
                                />
                            </Field>

                            {stores.length > 1 && (
                                <Field label="المخزن" error={errors.opening_warehouse_id}>
                                    <Select
                                        value={openingWarehouse}
                                        onChange={(event) => setOpeningWarehouse(event.target.value)}
                                    >
                                        <option value="">المخزن الرئيسي</option>
                                        {stores.map((store) => (
                                            <option key={store.id} value={store.id}>
                                                {store.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                        </div>
                        <p className="mt-2 text-[11px] text-navy-400">
                            تُسجَّل كحركة وارد باسم «رصيد افتتاحي». بعد ذلك تتغيّر الكمية بالوارد أو
                            الصرف أو الجرد.
                        </p>
                    </div>
                )}

                {/* ── UPS nameplate ─────────────────────────── */}
                {isUps && (
                    <div className="rounded-2xl bg-navy-50 p-4">
                        <p className="mb-3 text-xs font-bold text-navy-500">
                            المواصفات الفنية (من لوحة الجهاز)
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="الشركة المصنّعة">
                                <Input value={specs.brand ?? ''} onChange={(e) => setSpec('brand')(e.target.value)} />
                            </Field>
                            <Field label="الموديل">
                                <Input value={specs.model ?? ''} onChange={(e) => setSpec('model')(e.target.value)} />
                            </Field>
                            <Field label="نوع الـUPS">
                                <Select value={specs.ups_type ?? ''} onChange={(e) => setSpec('ups_type')(e.target.value)}>
                                    <option value="">— غير محدد —</option>
                                    {Object.entries(UPS_TYPES).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="عدد الأوجه (Phase)">
                                <Select value={specs.phase ?? ''} onChange={(e) => setSpec('phase')(e.target.value)}>
                                    <option value="">— غير محدد —</option>
                                    {Object.entries(UPS_PHASES).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="القدرة (VA/kVA)">
                                <Input value={specs.capacity ?? ''} onChange={(e) => setSpec('capacity')(e.target.value)} placeholder="20 kVA" />
                            </Field>
                            <Field label="جهد الإدخال">
                                <Input value={specs.input_voltage ?? ''} onChange={(e) => setSpec('input_voltage')(e.target.value)} placeholder="220V / 380V" dir="ltr" className="text-left" />
                            </Field>
                            <Field label="جهد الخرج">
                                <Input value={specs.output_voltage ?? ''} onChange={(e) => setSpec('output_voltage')(e.target.value)} placeholder="220V" dir="ltr" className="text-left" />
                            </Field>
                            <Field label="التردد">
                                <Input value={specs.frequency ?? ''} onChange={(e) => setSpec('frequency')(e.target.value)} placeholder="50Hz" dir="ltr" className="text-left" />
                            </Field>
                            <Field label="الكفاءة">
                                <Input value={specs.efficiency ?? ''} onChange={(e) => setSpec('efficiency')(e.target.value)} placeholder="95%" dir="ltr" className="text-left" />
                            </Field>
                            <Field label="معامل القدرة">
                                <Input value={specs.power_factor ?? ''} onChange={(e) => setSpec('power_factor')(e.target.value)} placeholder="0.9" dir="ltr" className="text-left" />
                            </Field>
                            <Field label="جهد البطارية">
                                <Input value={specs.battery_voltage ?? ''} onChange={(e) => setSpec('battery_voltage')(e.target.value)} placeholder="12V / 240V" dir="ltr" className="text-left" />
                            </Field>
                            <Field label="عدد البطاريات">
                                <Input type="number" min={0} value={specs.battery_count ?? ''} onChange={(e) => setSpec('battery_count')(e.target.value)} dir="ltr" className="text-left" />
                            </Field>
                            <Field label="مدة التشغيل (دقيقة)">
                                <Input type="number" min={0} value={specs.backup_minutes ?? ''} onChange={(e) => setSpec('backup_minutes')(e.target.value)} dir="ltr" className="text-left" placeholder="10" />
                            </Field>
                            <Field label="منفذ الاتصال">
                                <Select value={specs.comm_port ?? ''} onChange={(e) => setSpec('comm_port')(e.target.value)}>
                                    <option value="">— غير محدد —</option>
                                    {COMM_PORTS.map((port) => (
                                        <option key={port} value={port}>{port}</option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                    </div>
                )}

                {/* ── Battery nameplate ─────────────────────── */}
                {isBattery && (
                    <div className="rounded-2xl bg-navy-50 p-4">
                        <p className="mb-3 text-xs font-bold text-navy-500">المواصفات الفنية</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="الماركة">
                                <Input value={specs.brand ?? ''} onChange={(e) => setSpec('brand')(e.target.value)} />
                            </Field>
                            <Field label="الموديل">
                                <Input value={specs.model ?? ''} onChange={(e) => setSpec('model')(e.target.value)} />
                            </Field>
                            <Field label="نوع البطارية">
                                <Select value={specs.battery_type ?? ''} onChange={(e) => setSpec('battery_type')(e.target.value)}>
                                    <option value="">— غير محدد —</option>
                                    {Object.entries(BATTERY_TYPES).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="المقاس">
                                <Input value={specs.size ?? ''} onChange={(e) => setSpec('size')(e.target.value)} />
                            </Field>
                            <Field label="السعة (Ah)">
                                <Input type="number" min={0} value={specs.capacity_ah ?? ''} onChange={(e) => setSpec('capacity_ah')(e.target.value)} dir="ltr" className="text-left" />
                            </Field>
                            <Field label="الجهد (V)">
                                <Input type="number" min={0} value={specs.voltage ?? ''} onChange={(e) => setSpec('voltage')(e.target.value)} dir="ltr" className="text-left" />
                            </Field>
                            <Field label="الطاقة (Wh)">
                                <Input value={specs.energy_wh ?? ''} onChange={(e) => setSpec('energy_wh')(e.target.value)} dir="ltr" className="text-left" placeholder="1200Wh" />
                            </Field>
                            <Field label="نوع الطرف">
                                <Input value={specs.terminal_type ?? ''} onChange={(e) => setSpec('terminal_type')(e.target.value)} />
                            </Field>
                            <Field label="المقاومة الداخلية">
                                <Input value={specs.internal_resistance ?? ''} onChange={(e) => setSpec('internal_resistance')(e.target.value)} dir="ltr" className="text-left" placeholder="5.2 mΩ" />
                            </Field>
                            <Field label="الوزن">
                                <Input value={specs.weight ?? ''} onChange={(e) => setSpec('weight')(e.target.value)} dir="ltr" className="text-left" placeholder="12 kg" />
                            </Field>
                            <Field label="الأبعاد">
                                <Input value={specs.dimensions ?? ''} onChange={(e) => setSpec('dimensions')(e.target.value)} dir="ltr" className="text-left" placeholder="165×175×350mm" />
                            </Field>
                            <Field label="درجة حرارة التشغيل">
                                <Input value={specs.operating_temperature ?? ''} onChange={(e) => setSpec('operating_temperature')(e.target.value)} dir="ltr" className="text-left" placeholder="-15°C ~ 50°C" />
                            </Field>
                        </div>
                    </div>
                )}

                {/* Cost is intentionally absent: it comes from what the goods
                    actually cost on receipt, never from typing. */}
                <p className="rounded-xl bg-navy-50 p-3 text-xs text-navy-500">
                    {tr('تكلفة الصنف تُحسب تلقائيًا كمتوسط مرجح من أسعار الشراء عند تسجيل الوارد.')}
                </p>

                <Field label="ملاحظات" error={errors.notes}>
                    <Textarea
                        value={form.notes}
                        onChange={(event) => set('notes')(event.target.value)}
                    />
                </Field>

                <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(event) => set('is_active')(event.target.checked)}
                        className="size-4 rounded border-navy-300"
                    />
                    {tr('صنف نشط')}
                </label>
            </div>
        </Modal>
    )
}

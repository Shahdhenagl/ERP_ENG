import { BATTERY_TYPES, UPS_PHASES, UPS_TYPES } from '@/lib/domain'
import type { Asset } from '@/types'

/** A label/value pair from a nameplate, already resolved for display. */
export type SpecRow = [label: string, value: string]

function rows(pairs: Array<[string, string | number | null | undefined]>): SpecRow[] {
    return pairs
        .map(([label, value]) => [label, value == null ? '' : String(value)] as SpecRow)
        .filter(([, value]) => value.trim() !== '')
}

/**
 * The full nameplate of a catalogue item, in reading order.
 *
 * One definition for every screen that shows one. The fields were spelled out
 * separately in the item form, the contract print and the quote line, which is
 * three places for a new rating to be forgotten in two of them.
 */
export function itemSpecRows(
    category: string | null | undefined,
    specs?: Record<string, string> | null,
): SpecRow[] {
    if (!specs) return []

    if (category === 'ups') {
        return rows([
            ['الماركة', specs.brand],
            ['الموديل', specs.model],
            ['النوع', specs.ups_type ? (UPS_TYPES[specs.ups_type] ?? specs.ups_type) : null],
            ['الأوجه', specs.phase ? (UPS_PHASES[specs.phase] ?? specs.phase) : null],
            ['القدرة', specs.capacity],
            ['جهد الدخل', specs.input_voltage],
            ['جهد الخرج', specs.output_voltage],
            ['التردد', specs.frequency],
            ['الكفاءة', specs.efficiency],
            ['معامل القدرة', specs.power_factor],
            ['جهد البطاريات', specs.battery_voltage],
            ['عدد البطاريات', specs.battery_count],
            ['زمن التغذية', specs.backup_minutes ? `${specs.backup_minutes} دقيقة` : null],
            ['منفذ الاتصال', specs.comm_port],
        ])
    }

    if (category === 'battery') {
        return rows([
            ['الماركة', specs.brand],
            ['الموديل', specs.model],
            [
                'النوع',
                specs.battery_type ? (BATTERY_TYPES[specs.battery_type] ?? specs.battery_type) : null,
            ],
            ['المقاس', specs.size],
            ['السعة', specs.capacity_ah ? `${specs.capacity_ah} Ah` : null],
            ['الجهد', specs.voltage ? `${specs.voltage} V` : null],
            ['الطاقة', specs.energy_wh ? `${specs.energy_wh} Wh` : null],
            ['نوع الأطراف', specs.terminal_type],
            ['المقاومة الداخلية', specs.internal_resistance],
            ['الوزن', specs.weight],
            ['الأبعاد', specs.dimensions],
            ['حرارة التشغيل', specs.operating_temperature],
        ])
    }

    return rows([
        ['الماركة', specs.brand],
        ['الموديل', specs.model],
    ])
}

/**
 * The nameplate of a unit that has been installed at a customer.
 *
 * An asset carries its ratings in columns of its own rather than the item's
 * free-form bag, because a serial-numbered machine outlives the catalogue row
 * it was drawn from.
 */
export function assetSpecRows(asset: Asset): SpecRow[] {
    return rows([
        ['الماركة', asset.brand],
        ['الموديل', asset.model],
        ['النوع', asset.ups_type ? (UPS_TYPES[asset.ups_type] ?? asset.ups_type) : null],
        ['الأوجه', asset.phase ? (UPS_PHASES[asset.phase] ?? asset.phase) : null],
        ['القدرة', asset.capacity],
        ['جهد الدخل', asset.input_voltage],
        ['جهد الخرج', asset.output_voltage],
        ['التردد', asset.frequency],
        ['الكفاءة', asset.efficiency],
        ['معامل القدرة', asset.power_factor],
        ['جهد البطاريات', asset.battery_voltage],
        ['عدد البطاريات', asset.battery_count],
        ['زمن التغذية', asset.backup_minutes ? `${asset.backup_minutes} دقيقة` : null],
        ['منفذ الاتصال', asset.comm_port],
    ])
}

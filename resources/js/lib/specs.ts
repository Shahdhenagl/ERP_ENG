import { BATTERY_TYPES, UPS_PHASES, UPS_TYPES } from '@/lib/domain'
import type { Asset } from '@/types'
import { tr } from '@/lib/i18n'

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
            [tr('الماركة'), specs.brand],
            [tr('الموديل'), specs.model],
            [tr('نوع الجهاز'), specs.ups_type ? (UPS_TYPES[specs.ups_type] ?? specs.ups_type) : null],
            [tr('عدد الأوجه'), specs.phase ? (UPS_PHASES[specs.phase] ?? specs.phase) : null],
            [tr('القدرة الاسمية'), specs.capacity],
            [tr('جهد الإدخال'), specs.input_voltage],
            [tr('جهد الإخراج'), specs.output_voltage],
            [tr('التردد الكهربائي'), specs.frequency],
            [tr('الكفاءة'), specs.efficiency],
            [tr('معامل القدرة (PF)'), specs.power_factor],
            [tr('جهد البطاريات'), specs.battery_voltage],
            [tr('عدد البطاريات'), specs.battery_count],
            [tr('زمن الاحتياطي'), specs.backup_minutes ? `${specs.backup_minutes} دقيقة` : null],
            [tr('واجهة الاتصال'), specs.comm_port],
        ])
    }

    if (category === 'battery') {
        return rows([
            [tr('الماركة'), specs.brand],
            [tr('الموديل'), specs.model],
            [
                tr('نوع البطارية'),
                specs.battery_type ? (BATTERY_TYPES[specs.battery_type] ?? specs.battery_type) : null,
            ],
            [tr('المقاس'), specs.size],
            [tr('السعة الكهربائية'), specs.capacity_ah ? `${specs.capacity_ah} Ah` : null],
            [tr('جهد البطارية'), specs.voltage ? `${specs.voltage} V` : null],
            [tr('الطاقة المخزنة'), specs.energy_wh ? `${specs.energy_wh} Wh` : null],
            [tr('نوع الأقطاب'), specs.terminal_type],
            [tr('المقاومة الداخلية'), specs.internal_resistance],
            [tr('الوزن'), specs.weight],
            [tr('الأبعاد'), specs.dimensions],
            [tr('درجة حرارة التشغيل'), specs.operating_temperature],
        ])
    }

    return rows([
        [tr('الماركة'), specs.brand],
        [tr('الموديل'), specs.model],
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
        [tr('الماركة'), asset.brand],
        [tr('الموديل'), asset.model],
        [tr('نوع الجهاز'), asset.ups_type ? (UPS_TYPES[asset.ups_type] ?? asset.ups_type) : null],
        [tr('عدد الأوجه'), asset.phase ? (UPS_PHASES[asset.phase] ?? asset.phase) : null],
        [tr('القدرة الاسمية'), asset.capacity],
        [tr('جهد الإدخال'), asset.input_voltage],
        [tr('جهد الإخراج'), asset.output_voltage],
        [tr('التردد الكهربائي'), asset.frequency],
        [tr('الكفاءة'), asset.efficiency],
        [tr('معامل القدرة (PF)'), asset.power_factor],
        [tr('جهد البطاريات'), asset.battery_voltage],
        [tr('عدد البطاريات'), asset.battery_count],
        [tr('زمن الاحتياطي'), asset.backup_minutes ? `${asset.backup_minutes} دقيقة` : null],
        [tr('واجهة الاتصال'), asset.comm_port],
    ])
}

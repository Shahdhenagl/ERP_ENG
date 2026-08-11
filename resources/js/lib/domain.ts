import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Clock,
    Hammer,
    Navigation,
    PackageCheck,
    PauseCircle,
    Search,
    Truck,
    Wrench,
    XCircle,
    type LucideIcon,
} from 'lucide-react'
import { tr } from '@/lib/i18n'
import type {
    AssetStatus,
    ClaimStatus,
    ContractEffectiveStatus,
    DeviceCondition,
    ItemCategory,
    MovementType,
    PaymentMethod,
    PaymentState,
    QuotationEffectiveStatus,
    SalesBillingState,
    SalesOrderStatus,
    TaskPriority,
    TaskStatus,
    TaskType,
    VisitStatus,
    WarrantyEffectiveStatus,
    WarrantyKind,
} from '@/types'

/**
 * One place that decides how every status/priority/type is worded and
 * coloured — so a badge in the manager's table and the same badge on the
 * technician's phone can never drift apart.
 */

interface StatusMeta {
    label: string
    icon: LucideIcon
    /** Badge (light background) */
    chip: string
    /** Solid fill, used for the timeline dot and progress bar */
    solid: string
    /** Left accent bar on a job card */
    accent: string
}

export const STATUS: Record<TaskStatus, StatusMeta> = {
    pending: {
        label: tr('بانتظار القبول'),
        icon: Clock,
        chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
        solid: 'bg-amber-500',
        accent: 'bg-amber-400',
    },
    accepted: {
        label: tr('تم القبول'),
        icon: CheckCircle2,
        chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
        solid: 'bg-indigo-500',
        accent: 'bg-indigo-400',
    },
    on_the_way: {
        label: tr('في الطريق'),
        icon: Navigation,
        chip: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
        solid: 'bg-cyan-500',
        accent: 'bg-cyan-400',
    },
    in_progress: {
        label: tr('جارٍ العمل'),
        icon: Hammer,
        chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
        solid: 'bg-blue-500',
        accent: 'bg-blue-400',
    },
    completed: {
        label: tr('منتهية'),
        icon: PackageCheck,
        chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
        solid: 'bg-emerald-500',
        accent: 'bg-emerald-400',
    },
    cancelled: {
        label: tr('ملغاة'),
        icon: XCircle,
        chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
        solid: 'bg-slate-400',
        accent: 'bg-slate-300',
    },
    postponed: {
        label: tr('مؤجلة'),
        icon: PauseCircle,
        chip: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
        solid: 'bg-orange-500',
        accent: 'bg-orange-400',
    },
}

/** The happy path, in order — drives the progress rail on the job screen. */
export const STATUS_FLOW: TaskStatus[] = [
    'pending',
    'postponed',
    'accepted',
    'on_the_way',
    'in_progress',
    'completed',
]

interface PriorityMeta {
    label: string
    chip: string
    dot: string
    /** Card ring for urgent work, so it stands out in a long feed */
    ring: string
}

export const PRIORITY: Record<TaskPriority, PriorityMeta> = {
    urgent: {
        label: tr('عاجلة'),
        chip: 'bg-red-50 text-red-700 ring-1 ring-red-200',
        dot: 'bg-red-500',
        ring: 'ring-2 ring-red-200',
    },
    high: {
        label: tr('عالية'),
        chip: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
        dot: 'bg-orange-500',
        ring: '',
    },
    normal: {
        label: tr('عادية'),
        chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
        dot: 'bg-blue-500',
        ring: '',
    },
    low: {
        label: tr('منخفضة'),
        chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
        dot: 'bg-slate-400',
        ring: '',
    },
}

export const TASK_TYPE: Record<TaskType, { label: string; icon: LucideIcon }> = {
    installation: { label: tr('تركيب'), icon: Wrench },
    maintenance: { label: tr('صيانة'), icon: ClipboardList },
    repair: { label: tr('إصلاح عطل'), icon: AlertTriangle },
    inspection: { label: tr('معاينة'), icon: Search },
    delivery: { label: tr('تسليم'), icon: Truck },
}

/**
 * Contracts are shown by their effective status, which folds in two states the
 * server derives from today's date rather than storing.
 */
export const CONTRACT_STATUS: Record<ContractEffectiveStatus, { label: string; chip: string }> = {
    draft: { label: tr('مسودة'), chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
    scheduled: { label: tr('لم يبدأ'), chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
    active: { label: tr('ساري'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    expired: { label: tr('منتهي'), chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    cancelled: { label: tr('ملغي'), chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

export const VISIT_STATUS: Record<VisitStatus, { label: string; chip: string }> = {
    planned: { label: tr('مخططة'), chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
    scheduled: { label: tr('صدر أمر شغل'), chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' },
    done: { label: tr('تمت'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    skipped: { label: tr('تخطّيت'), chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    cancelled: { label: tr('ملغاة'), chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

/** Amber while the term is running out, red once it has. */
export function expiryChip(daysRemaining: number): string {
    if (daysRemaining < 0) return 'bg-red-50 text-red-700 ring-1 ring-red-200'
    if (daysRemaining <= 60) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'

    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
}

export const ASSET_STATUS: Record<AssetStatus, { label: string; chip: string }> = {
    active: { label: tr('في الخدمة'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    under_repair: { label: tr('تحت الإصلاح'), chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    retired: { label: tr('خارج الخدمة'), chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
}

/**
 * Three warranty states, not two. `null` means no sale date is on file — and
 * showing that as "expired" would bill a customer for a covered repair.
 */
export function warrantyChip(underWarranty: boolean | null): string {
    if (underWarranty === null) return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'

    return underWarranty
        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
        : 'bg-red-50 text-red-700 ring-1 ring-red-200'
}

/** Cover, as the server derives it from today's date on every read. */
export const WARRANTY_STATUS: Record<WarrantyEffectiveStatus, { label: string; chip: string }> = {
    active: { label: tr('ساري'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    expiring: { label: tr('قارب على الانتهاء'), chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    expired: { label: tr('منتهي'), chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    scheduled: { label: tr('لم يبدأ'), chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
    void: { label: tr('ملغي'), chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

export const WARRANTY_KIND: Record<WarrantyKind, string> = {
    company: tr('ضمان الشركة'),
    supplier: tr('ضمان المورّد'),
    extension: tr('تمديد ضمان'),
}

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; chip: string }> = {
    open: { label: tr('تحت الفحص'), chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
    approved: { label: tr('معتمدة'), chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
    rejected: { label: tr('مرفوضة'), chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    repaired: { label: tr('تم الإصلاح'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    replaced: { label: tr('تم الاستبدال'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    closed: { label: tr('مغلقة'), chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
}

/** Quotations carry the lapse the server derives from today's date. */
export const QUOTATION_STATUS: Record<QuotationEffectiveStatus, { label: string; chip: string }> = {
    draft: { label: tr('مسودة'), chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
    sent: { label: tr('مُرسَل'), chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
    expired: { label: tr('انتهت صلاحيته'), chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    accepted: { label: tr('مقبول'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    rejected: { label: tr('مرفوض'), chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    cancelled: { label: tr('ملغي'), chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

export const SALES_ORDER_STATUS: Record<SalesOrderStatus, { label: string; chip: string }> = {
    open: { label: tr('قيد التنفيذ'), chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    delivered: { label: tr('تم التسليم'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    cancelled: { label: tr('ملغي'), chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

export const SALES_BILLING_STATE: Record<SalesBillingState, { label: string; chip: string }> = {
    not_invoiced: { label: tr('لم تتم فوترته'), chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    partly_invoiced: { label: tr('فوترة جزئية'), chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    invoiced: { label: tr('تمت فوترته'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    cancelled: { label: tr('ملغي'), chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

export const ITEM_CATEGORY: Record<ItemCategory, { label: string; chip: string }> = {
    ups: { label: tr('أجهزة UPS'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    battery: { label: tr('بطاريات'), chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
    spare_part: { label: tr('قطع غيار'), chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
    consumable: { label: tr('مستهلكات'), chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
}

/** A one-line nameplate for a UPS or battery — brand, model and the key ratings. */
export function itemSpecSummary(
    category: string | null | undefined,
    specs?: Record<string, string> | null,
): string | null {
    if (!specs) return null

    const parts =
        category === 'ups'
            ? [
                  specs.brand,
                  specs.model,
                  specs.capacity,
                  specs.phase === 'three' ? '٣ أوجه' : specs.phase === 'single' ? 'وجه واحد' : null,
              ]
            : category === 'battery'
              ? [
                    specs.brand,
                    specs.model,
                    specs.capacity_ah && `${specs.capacity_ah}Ah`,
                    specs.voltage && `${specs.voltage}V`,
                ]
              : [specs.brand, specs.model]

    const text = parts.filter(Boolean).join(' · ')
    return text || null
}

export const MOVEMENT_TYPE: Record<MovementType, { label: string; chip: string; sign: '+' | '−' | '±' }> = {
    receipt: { label: tr('وارد'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', sign: '+' },
    transfer: { label: tr('تحويل'), chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', sign: '±' },
    issue: { label: tr('صرف على مهمة'), chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', sign: '−' },
    return: { label: tr('مرتجع من مهمة'), chip: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200', sign: '+' },
    adjustment: { label: tr('تسوية جرد'), chip: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', sign: '±' },
    // Goods handed back to a supplier leave stock; a customer's return re-enters it.
    purchase_return: { label: tr('مرتجع مشتريات'), chip: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200', sign: '−' },
    sales_return: { label: tr('مرتجع مبيعات'), chip: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200', sign: '+' },
}

/** Fallback so a movement type the map has not met yet never breaks the list. */
export const MOVEMENT_TYPE_FALLBACK = {
    label: tr('حركة'),
    chip: 'bg-navy-100 text-navy-600',
    sign: '±' as const,
}

/**
 * Egyptian VAT. Sits here rather than in a settings table because there is one
 * company and one rate; when that stops being true it becomes a setting.
 */
export const DEFAULT_TAX_RATE = 14

export const PAYMENT_STATE: Record<PaymentState, { label: string; chip: string }> = {
    draft: { label: tr('مسودة'), chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
    void: { label: tr('ملغاة'), chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
    unpaid: { label: tr('غير مدفوعة'), chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    partly_paid: { label: tr('مدفوعة جزئيًا'), chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    paid: { label: tr('مدفوعة'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    // Violet, not green: a returned sale was never collected, and it should
    // not read as a win on the invoice list.
    credited: { label: tr('مرتجعة'), chip: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
    overdue: { label: tr('متأخرة'), chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
    cash: tr('نقدًا'),
    bank_transfer: tr('تحويل بنكي'),
    instapay: tr('إنستاباي'),
    vodafone_cash: tr('فودافون كاش'),
    cheque: tr('شيك'),
    wallet: tr('محفظة إلكترونية'),
}

/** Money is shown in whole piastres — technicians read these on a phone. */
export function formatMoney(value: number): string {
    return `${value.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج`
}

/** Trims trailing zeros so "3.000" reads as "3" but "1.500" survives. */
export function formatQty(value: number): string {
    return String(Number(value.toFixed(3)))
}

export const DEVICE_CONDITION: Record<DeviceCondition, { label: string; chip: string }> = {
    good: { label: tr('جيدة'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    fair: { label: tr('مقبولة'), chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    poor: { label: tr('ضعيفة'), chip: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
    faulty: { label: tr('معطلة'), chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

/**
 * Mains voltage is read per phase — the paper sheet writes three numbers. L1 is
 * the original single column; L2/L3 are filled only on three-phase units.
 */
export const PHASE_READINGS = [
    {
        label: tr('جهد الدخول'),
        keys: ['input_voltage', 'input_voltage_l2', 'input_voltage_l3'],
    },
    {
        label: tr('جهد الخروج'),
        keys: ['output_voltage', 'output_voltage_l2', 'output_voltage_l3'],
    },
] as const

/** The single-value readings, beside the per-phase voltages above. */
export const READING_FIELDS = [
    { key: 'frequency', label: tr('التردد'), unit: tr('هرتز'), step: '0.1' },
    { key: 'load_percent', label: tr('نسبة التحميل'), unit: '%', step: '0.1' },
    { key: 'battery_voltage', label: tr('جهد البطاريات'), unit: tr('فولت'), step: '0.1' },
    { key: 'temperature', label: tr('درجة الحرارة'), unit: tr('°م'), step: '0.1' },
    { key: 'backup_minutes', label: tr('زمن الـ Backup'), unit: tr('دقيقة'), step: '1' },
] as const

/** Every numeric reading key, for building and posting the report form. */
export const ALL_READING_KEYS = [
    'input_voltage', 'input_voltage_l2', 'input_voltage_l3',
    'output_voltage', 'output_voltage_l2', 'output_voltage_l3',
    'frequency', 'load_percent', 'battery_voltage', 'temperature', 'backup_minutes',
] as const

/** Expense headings a technician picks from when spending out of their float. */
export const EXPENSE_CATEGORIES = ['وقود', 'مواصلات', 'خط السير', 'مبيت', 'قطع غيار', 'ضيافة', 'أخرى'] as const

/** UPS topology, on the device nameplate. */
export const UPS_TYPES: Record<string, string> = {
    online: tr('Online (تحويل مزدوج)'),
    offline: tr('Offline (احتياطي)'),
    line_interactive: 'Line Interactive',
}

/** Single- or three-phase. */
export const UPS_PHASES: Record<string, string> = {
    single: tr('أحادي الوجه'),
    three: tr('ثلاثي الأوجه'),
}

/** Communication ports a UPS commonly exposes. */
export const COMM_PORTS = ['USB', 'RS232', 'SNMP', 'USB + RS232', 'USB + SNMP'] as const

/** Where a lead came from. */
export const LEAD_SOURCE: Record<string, string> = {
    referral: tr('ترشيح'),
    call: tr('اتصال'),
    walk_in: tr('زيارة'),
    social: tr('سوشيال ميديا'),
    website: tr('الموقع'),
    other: tr('أخرى'),
}

/** How hard a lead is worth chasing — which of thirty to ring first. */
export const LEAD_PRIORITY: Record<string, { label: string; chip: string; dot: string }> = {
    urgent: { label: tr('عاجلة'), chip: 'bg-red-50 text-red-700 ring-1 ring-red-200', dot: 'bg-red-500' },
    high: { label: tr('عالية'), chip: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200', dot: 'bg-orange-500' },
    normal: { label: tr('عادية'), chip: 'bg-navy-50 text-navy-500 ring-1 ring-navy-200', dot: 'bg-navy-300' },
    low: { label: tr('منخفضة'), chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200', dot: 'bg-slate-300' },
}

/** Battery chemistry / construction. */
export const BATTERY_TYPES: Record<string, string> = {
    vrla: 'VRLA',
    agm: 'AGM',
    gel: 'Gel',
    lithium_ion: 'Lithium-Ion',
}

/** Egypt's 27 governorates, for the site's region — picked, not typed. */
export const EGYPT_GOVERNORATES = [
    'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية',
    'البحيرة', 'الغربية', 'المنوفية', 'كفر الشيخ', 'دمياط', 'بورسعيد',
    'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط',
    'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد',
    'مطروح', 'شمال سيناء', 'جنوب سيناء',
] as const

/** The site-inspection checklist, in the order it appears on the paper sheet. */
export const SITE_CHECKS = [
    { key: 'earthing', label: tr('التأريض') },
    { key: 'environment', label: tr('البيئة المحيطة') },
    { key: 'charger', label: tr('جهد الشاحن') },
    { key: 'accessories', label: tr('المراوح والفلاتر والإنذارات') },
] as const

export const SITE_CHECK_OPTIONS: Record<'ok' | 'issue' | 'na', { label: string; chip: string }> = {
    ok: { label: tr('سليم'), chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    issue: { label: tr('يحتاج انتباه'), chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    na: { label: tr('لا ينطبق'), chip: 'bg-navy-100 text-navy-500 ring-1 ring-navy-200' },
}

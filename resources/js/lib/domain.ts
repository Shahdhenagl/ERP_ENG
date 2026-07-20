import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Clock,
    Hammer,
    Navigation,
    PackageCheck,
    Search,
    Truck,
    Wrench,
    XCircle,
    type LucideIcon,
} from 'lucide-react'
import type {
    AssetStatus,
    ContractEffectiveStatus,
    DeviceCondition,
    ItemCategory,
    MovementType,
    PaymentMethod,
    PaymentState,
    TaskPriority,
    TaskStatus,
    TaskType,
    VisitStatus,
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
        label: 'بانتظار القبول',
        icon: Clock,
        chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
        solid: 'bg-amber-500',
        accent: 'bg-amber-400',
    },
    accepted: {
        label: 'تم القبول',
        icon: CheckCircle2,
        chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
        solid: 'bg-indigo-500',
        accent: 'bg-indigo-400',
    },
    on_the_way: {
        label: 'في الطريق',
        icon: Navigation,
        chip: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
        solid: 'bg-cyan-500',
        accent: 'bg-cyan-400',
    },
    in_progress: {
        label: 'جارٍ العمل',
        icon: Hammer,
        chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
        solid: 'bg-blue-500',
        accent: 'bg-blue-400',
    },
    completed: {
        label: 'منتهية',
        icon: PackageCheck,
        chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
        solid: 'bg-emerald-500',
        accent: 'bg-emerald-400',
    },
    cancelled: {
        label: 'ملغاة',
        icon: XCircle,
        chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
        solid: 'bg-slate-400',
        accent: 'bg-slate-300',
    },
}

/** The happy path, in order — drives the progress rail on the job screen. */
export const STATUS_FLOW: TaskStatus[] = [
    'pending',
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
        label: 'عاجلة',
        chip: 'bg-red-50 text-red-700 ring-1 ring-red-200',
        dot: 'bg-red-500',
        ring: 'ring-2 ring-red-200',
    },
    high: {
        label: 'عالية',
        chip: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
        dot: 'bg-orange-500',
        ring: '',
    },
    normal: {
        label: 'عادية',
        chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
        dot: 'bg-blue-500',
        ring: '',
    },
    low: {
        label: 'منخفضة',
        chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
        dot: 'bg-slate-400',
        ring: '',
    },
}

export const TASK_TYPE: Record<TaskType, { label: string; icon: LucideIcon }> = {
    installation: { label: 'تركيب', icon: Wrench },
    maintenance: { label: 'صيانة', icon: ClipboardList },
    repair: { label: 'إصلاح عطل', icon: AlertTriangle },
    inspection: { label: 'معاينة', icon: Search },
    delivery: { label: 'تسليم', icon: Truck },
}

/**
 * Contracts are shown by their effective status, which folds in two states the
 * server derives from today's date rather than storing.
 */
export const CONTRACT_STATUS: Record<ContractEffectiveStatus, { label: string; chip: string }> = {
    draft: { label: 'مسودة', chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
    scheduled: { label: 'لم يبدأ', chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
    active: { label: 'ساري', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    expired: { label: 'منتهي', chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    cancelled: { label: 'ملغي', chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

export const VISIT_STATUS: Record<VisitStatus, { label: string; chip: string }> = {
    planned: { label: 'مخططة', chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
    scheduled: { label: 'صدر أمر شغل', chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' },
    done: { label: 'تمت', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    skipped: { label: 'تخطّيت', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    cancelled: { label: 'ملغاة', chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
}

/** Amber while the term is running out, red once it has. */
export function expiryChip(daysRemaining: number): string {
    if (daysRemaining < 0) return 'bg-red-50 text-red-700 ring-1 ring-red-200'
    if (daysRemaining <= 60) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'

    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
}

export const ASSET_STATUS: Record<AssetStatus, { label: string; chip: string }> = {
    active: { label: 'في الخدمة', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    under_repair: { label: 'تحت الإصلاح', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    retired: { label: 'خارج الخدمة', chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
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

export const ITEM_CATEGORY: Record<ItemCategory, { label: string; chip: string }> = {
    battery: { label: 'بطاريات', chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
    spare_part: { label: 'قطع غيار', chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
    consumable: { label: 'مستهلكات', chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
}

export const MOVEMENT_TYPE: Record<MovementType, { label: string; chip: string; sign: '+' | '−' | '±' }> = {
    receipt: { label: 'وارد', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', sign: '+' },
    transfer: { label: 'تحويل', chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', sign: '±' },
    issue: { label: 'صرف على مهمة', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', sign: '−' },
    return: { label: 'مرتجع من مهمة', chip: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200', sign: '+' },
    adjustment: { label: 'تسوية جرد', chip: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', sign: '±' },
}

/**
 * Egyptian VAT. Sits here rather than in a settings table because there is one
 * company and one rate; when that stops being true it becomes a setting.
 */
export const DEFAULT_TAX_RATE = 14

export const PAYMENT_STATE: Record<PaymentState, { label: string; chip: string }> = {
    draft: { label: 'مسودة', chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
    void: { label: 'ملغاة', chip: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
    unpaid: { label: 'غير مدفوعة', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    partly_paid: { label: 'مدفوعة جزئيًا', chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    paid: { label: 'مدفوعة', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    overdue: { label: 'متأخرة', chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
    cash: 'نقدًا',
    bank_transfer: 'تحويل بنكي',
    cheque: 'شيك',
    wallet: 'محفظة إلكترونية',
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
    good: { label: 'جيدة', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    fair: { label: 'مقبولة', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    poor: { label: 'ضعيفة', chip: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
    faulty: { label: 'معطلة', chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

/** Labels for the readings captured on a technician's report. */
export const READING_FIELDS = [
    { key: 'input_voltage', label: 'جهد الدخول', unit: 'فولت', step: '0.1' },
    { key: 'output_voltage', label: 'جهد الخروج', unit: 'فولت', step: '0.1' },
    { key: 'frequency', label: 'التردد', unit: 'هرتز', step: '0.1' },
    { key: 'load_percent', label: 'نسبة التحميل', unit: '%', step: '0.1' },
    { key: 'battery_voltage', label: 'جهد البطاريات', unit: 'فولت', step: '0.1' },
    { key: 'temperature', label: 'درجة الحرارة', unit: '°م', step: '0.1' },
    { key: 'backup_minutes', label: 'زمن الـ Backup', unit: 'دقيقة', step: '1' },
] as const

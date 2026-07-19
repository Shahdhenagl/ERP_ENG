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
import type { AssetStatus, DeviceCondition, TaskPriority, TaskStatus, TaskType } from '@/types'

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

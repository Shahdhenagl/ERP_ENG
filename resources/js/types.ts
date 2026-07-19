export type Role = 'admin' | 'manager' | 'technician'

export type TaskStatus =
    | 'pending'
    | 'accepted'
    | 'on_the_way'
    | 'in_progress'
    | 'completed'
    | 'cancelled'

export type TaskType = 'installation' | 'maintenance' | 'repair' | 'inspection' | 'delivery'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type ReportType = 'diagnosis' | 'completion'
export type AttachmentKind = 'before' | 'after' | 'document' | 'signature'
export type DeviceCondition = 'good' | 'fair' | 'poor' | 'faulty'

export interface User {
    id: number
    name: string
    email: string
    role: Role
    role_label: string
    phone: string | null
    whatsapp: string | null
    whatsapp_number: string | null
    job_title: string | null
    is_active: boolean
    last_seen_at: string | null
    created_at: string | null
    open_tasks_count?: number
}

export interface Customer {
    id: number
    code: string
    name: string
    company: string | null
    phone: string
    whatsapp: string | null
    whatsapp_number: string | null
    whatsapp_link: string | null
    email: string | null
    address: string | null
    city: string | null
    lat: number | null
    lng: number | null
    map_url: string | null
    maps_url: string | null
    notes: string | null
    is_active: boolean
    tasks_count?: number
    created_at: string | null
}

export interface TaskStatusLog {
    id: number
    from_status: TaskStatus | null
    from_label: string | null
    to_status: TaskStatus
    to_label: string
    note: string | null
    lat: number | null
    lng: number | null
    user?: User
    created_at: string
}

export interface TaskReport {
    id: number
    type: ReportType
    readings: {
        input_voltage: number | null
        output_voltage: number | null
        frequency: number | null
        load_percent: number | null
        battery_voltage: number | null
        temperature: number | null
        backup_minutes: number | null
    }
    device_condition: DeviceCondition | null
    batteries_need_replacement: boolean
    findings: string | null
    actions_taken: string | null
    recommendations: string | null
    parts_used: Array<{ name: string; qty?: number; note?: string }>
    signature_url: string | null
    signed_by_name: string | null
    signed_at: string | null
    author?: User
    attachments?: TaskAttachment[]
    created_at: string
}

export interface TaskAttachment {
    id: number
    kind: AttachmentKind
    url: string
    original_name: string
    mime: string | null
    size: number
    caption: string | null
    uploader?: User
    created_at: string
}

export interface Task {
    id: number
    code: string
    title: string
    description: string | null

    type: TaskType
    type_label: string
    priority: TaskPriority
    priority_label: string
    status: TaskStatus
    status_label: string
    allowed_next: Array<{ value: TaskStatus; label: string }>
    is_terminal: boolean

    customer?: Customer
    technician?: User
    creator?: User

    site_address: string | null
    site_lat: number | null
    site_lng: number | null
    effective_address: string | null
    navigation_url: string | null

    device: {
        brand: string | null
        model: string | null
        serial: string | null
        capacity: string | null
    }

    scheduled_at: string | null
    accepted_at: string | null
    on_the_way_at: string | null
    started_at: string | null
    completed_at: string | null
    cancelled_at: string | null
    cancel_reason: string | null

    whatsapp: {
        brief_technician?: string | null
        brief_customer?: string | null
        report_manager?: string | null
    }

    status_logs?: TaskStatusLog[]
    reports?: TaskReport[]
    attachments?: TaskAttachment[]

    created_at: string
    updated_at: string
}

export interface DashboardData {
    stats: {
        by_status: Record<TaskStatus, number>
        open_total: number
        completed_today: number
        completed_this_month: number
        overdue: number
        unassigned: number
        customers_total?: number
        technicians_total?: number
        technician_load?: Array<{
            id: number
            name: string
            job_title: string | null
            open_count: number
            completed_count: number
        }>
    }
    upcoming: Task[]
}

export interface AppNotification {
    id: string
    data: {
        type: string
        task_id?: number
        code?: string
        title?: string
        actor?: string
        url?: string
        [key: string]: unknown
    }
    read_at: string | null
    created_at: string
}

export interface Paginated<T> {
    data: T[]
    meta: {
        current_page: number
        last_page: number
        total: number
        per_page?: number
        unread_count?: number
    }
}

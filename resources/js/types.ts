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

export type ItemCategory = 'battery' | 'spare_part' | 'consumable'
export type MovementType = 'receipt' | 'transfer' | 'issue' | 'return' | 'adjustment'
export type WarehouseType = 'main' | 'van'

export interface Item {
    id: number
    code: string
    sku: string | null
    name: string

    category: ItemCategory
    category_label: string
    unit: string

    /** Weighted moving average — set by receipts, never typed in. */
    avg_cost: number
    reorder_level: number

    total_qty: number
    stock_value: number
    below_reorder_level: boolean

    levels?: Array<{
        warehouse_id: number
        warehouse: string | null
        type: WarehouseType | null
        qty: number
    }>

    notes: string | null
    is_active: boolean
    created_at: string | null
}

export interface StockMovement {
    id: number
    type: MovementType
    type_label: string

    item_id: number
    item?: { id: number; name: string; unit: string }

    qty: number
    unit_cost: number
    value: number

    from?: string | null
    to?: string | null

    task_id: number | null
    task_code?: string | null

    supplier: string | null
    reference: string | null
    note: string | null

    actor?: string | null
    created_at: string | null
}

export interface WarehouseSummary {
    id: number
    name: string
    type: WarehouseType
    type_label: string
    holder: string | null
    total_qty: number
}

/** A line in the technician's van, offered by the report's part picker. */
export interface VanStockLine {
    item_id: number
    name: string
    unit: string
    category: ItemCategory
    qty: number
}

/** What an operator set. `effective_status` is what you show. */
export type ContractStatus = 'draft' | 'active' | 'cancelled'

/** Includes the two states derived from today's date. */
export type ContractEffectiveStatus = ContractStatus | 'expired' | 'scheduled'

export type VisitStatus = 'planned' | 'scheduled' | 'done' | 'skipped' | 'cancelled'

export interface ContractVisit {
    id: number
    sequence: number
    planned_for: string | null
    status: VisitStatus
    status_label: string
    /** Someone has committed to this date — replanning will not move it. */
    is_locked: boolean
    task_id: number | null
    task?: Task
}

export interface Contract {
    id: number
    code: string
    title: string | null
    label: string
    customer_id: number
    customer?: Customer
    starts_on: string | null
    ends_on: string | null
    visits_per_year: number
    /** Negative once the term has elapsed. */
    days_remaining: number
    status: ContractStatus
    status_label: string
    /** Derived on every read — nothing on the server flips it on a timer. */
    effective_status: ContractEffectiveStatus
    effective_status_label: string
    value: string | null
    currency: string
    sla_response_hours: number | null
    sla_resolution_hours: number | null
    notes: string | null
    assets_count?: number
    assets?: Asset[]
    visits_count?: number
    visits?: ContractVisit[]
    created_at: string | null
}

export interface Supplier {
    id: number
    code: string
    name: string
    company: string | null
    phone: string | null
    whatsapp: string | null
    email: string | null
    address: string | null
    tax_id: string | null
    notes: string | null
    is_active: boolean

    /** Derived: value received, less what has been paid. */
    purchased_total: number
    paid_total: number
    balance: number

    orders?: Array<{
        id: number
        code: string
        order_date: string | null
        total: number
        fulfilment: PurchaseFulfilment
        fulfilment_label: string
    }>
    payments?: Array<{
        id: number
        code: string
        amount: number
        method_label: string
        paid_at: string | null
        cash_box: string | null
    }>
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'cancelled'
/** Includes the two states derived from what has actually arrived. */
export type PurchaseFulfilment =
    | PurchaseOrderStatus
    | 'awaiting'
    | 'partly_received'
    | 'received'

export interface PurchaseOrderLine {
    id?: number
    item_id: number
    item?: string | null
    unit?: string | null
    qty: number
    unit_price: number
    line_total?: number
    received?: number
    outstanding?: number
}

export interface PurchaseOrder {
    id: number
    code: string
    supplier_id: number
    supplier: string | null
    order_date: string | null
    expected_date: string | null
    status: PurchaseOrderStatus
    fulfilment: PurchaseFulfilment
    fulfilment_label: string
    tax_rate: number
    subtotal: number
    total: number
    currency: string
    notes: string | null
    cancel_reason: string | null
    lines?: PurchaseOrderLine[]
}

export type InvoiceStatus = 'draft' | 'issued' | 'void'
/** Derived from the receipts against the invoice, never stored. */
export type PaymentState = 'draft' | 'void' | 'unpaid' | 'partly_paid' | 'paid' | 'overdue'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'wallet'
export type CashBoxType = 'cash' | 'bank'

export interface InvoiceLine {
    id?: number
    item_id: number | null
    item_code?: string | null
    description: string
    qty: number
    unit_price: number
    line_total: number
}

export interface Invoice {
    id: number
    code: string

    customer_id: number
    customer?: Customer
    task_id: number | null
    task_code?: string | null

    issue_date: string | null
    due_date: string | null

    status: InvoiceStatus
    status_label: string
    payment_state: PaymentState
    payment_state_label: string
    is_overdue: boolean

    subtotal: number
    discount: number
    tax_rate: number
    tax_amount: number
    total: number
    paid_total: number
    balance: number
    currency: string

    lines?: InvoiceLine[]
    payments?: Payment[]

    customer_tax_id: string | null
    notes: string | null
    void_reason: string | null
    created_at: string | null
}

export interface Payment {
    id: number
    code: string
    customer_id: number
    customer?: string | null
    invoice_id: number | null
    invoice_code?: string | null
    cash_box_id: number
    cash_box?: string | null
    amount: number
    method: PaymentMethod
    method_label: string
    paid_at: string | null
    reference: string | null
    note: string | null
    actor?: string | null
    created_at: string | null
}

export interface CashBoxSummary {
    id: number
    name: string
    type: CashBoxType
    type_label: string
    account_number: string | null
    currency: string
    is_active: boolean
    balance: number
}

export interface CashMovementRow {
    id: number
    direction: 'in' | 'out'
    amount: number
    source: 'payment' | 'expense' | 'transfer' | 'opening'
    source_label: string
    box: string | null
    category: string | null
    note: string | null
    customer: string | null
    actor: string | null
    created_at: string | null
}

export type AssetStatus = 'active' | 'under_repair' | 'retired'

export interface Asset {
    id: number
    code: string
    serial: string | null

    brand: string | null
    model: string | null
    capacity: string | null
    /** Best available human label — brand+model, else serial, else code. */
    label: string

    customer_id: number
    customer?: Customer

    site_address: string | null
    site_lat: number | null
    site_lng: number | null

    sold_at: string | null
    installed_at: string | null
    warranty_months: number | null
    warranty_ends_at: string | null
    /** null means unknown — no sale date on file, which is not the same as expired. */
    under_warranty: boolean | null
    warranty_label: string

    status: AssetStatus
    status_label: string
    notes: string | null

    tasks_count?: number
    tasks?: Task[]
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
    /** `item_id` present when the part came off the van; absent for free text. */
    parts_used: Array<{ item_id?: number | null; name: string; qty?: number; note?: string }>
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

    asset_id: number | null
    asset?: Asset

    contract_id: number | null
    /** Flat summary, so a task row can name its contract without loading it. */
    contract: { id: number; code: string; label: string } | null

    /**
     * Deadlines the governing contract implies. Null when the customer has no
     * contract, or the contract sets no times. The breach flags are computed
     * server-side on every read rather than stored.
     */
    sla: {
        response_due_at: string | null
        resolution_due_at: string | null
        response_breached: boolean | null
        resolution_breached: boolean | null
    } | null

    /** Flat summary of the linked device; null when the job has no device. */
    device: {
        brand: string | null
        model: string | null
        serial: string | null
        capacity: string | null
    } | null

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
        /** Contract visits waiting for a technician within the next month. */
        maintenance_due?: number
        contracts_active?: number
        contracts_expiring?: number
        technician_load?: Array<{
            id: number
            name: string
            job_title: string | null
            open_count: number
            completed_count: number
        }>
    }
    upcoming: Task[]
    /** Dispatcher-only: the visits that need someone put on them. */
    maintenance_due?: Task[]
    contracts_expiring?: Contract[]
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

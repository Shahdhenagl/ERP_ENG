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
export type WarehouseType = 'store' | 'van'

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
    /** Where receipts land and issues are drawn from unless told otherwise. */
    is_default?: boolean
    address?: string | null
    keeper?: string | null
}

/** A device in a technician's hands, out of the registry until handed back. */
export interface CustodyDevice {
    id: number
    asset_id: number
    asset: string | null
    serial: string | null
    customer: string | null
    reason: string
    reason_label: string
    taken_from: string | null
    taken_at: string | null
    days_held: number
}

/** Everything one technician is answerable for: money, stock and devices. */
export interface CustodyStatement {
    technician: {
        id: number
        name: string
        phone: string | null
        job_title: string | null
    }
    cash: {
        box_id: number | null
        balance: number
    }
    stock: {
        warehouse_id: number | null
        lines: Array<{
            item_id: number
            name: string
            unit: string
            qty: number
            value: number
        }>
        value: number
    }
    devices: CustodyDevice[]
    /** Cash plus stock — one figure for how exposed the company is. */
    total_value: number
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

/** A customer site: where devices sit and where jobs are sent. */
export interface Branch {
    id: number
    code: string
    customer_id: number
    customer: string | null

    name: string
    /** "فرع المعادي — بنك القاهرة", for a picker spanning customers. */
    label: string
    /** The customer's own reference for this site. */
    customer_ref: string | null

    address: string | null
    city: string | null
    lat: number | null
    lng: number | null
    map_url: string | null
    maps_url: string | null

    contact_name: string | null
    contact_phone: string | null
    contact_whatsapp: string | null
    /** Branch contact, falling back to head office. */
    contact_number: string | null

    working_hours: string | null
    notes: string | null
    is_active: boolean

    assets_count?: number | null
    tasks_count?: number | null
}

/** One line of a customer account — an invoice raised or money received. */
export interface StatementRow {
    date: string | null
    type: 'invoice' | 'payment'
    type_label: string
    code: string
    note: string | null
    debit: number
    credit: number
    /** Running total after this line. */
    balance: number
}

export interface StatementMeta {
    customer: {
        id: number
        code: string
        name: string
        company: string | null
        phone: string | null
        address: string | null
    }
    from: string | null
    to: string | null
    total_invoiced: number
    total_collected: number
    balance: number
}

/** What an operator set. `effective_status` is what you show. */
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'cancelled'
/** Includes the lapse the server derives from today's date. */
export type QuotationEffectiveStatus = QuotationStatus | 'expired'

export interface DocumentLine {
    id?: number
    item_id?: number | null
    item_code?: string | null
    description: string
    qty: number
    unit_price: number
    line_total: number
}

export interface Quotation {
    id: number
    code: string
    title: string | null

    customer_id: number
    customer: string | null
    asset_id: number | null
    asset: string | null

    issue_date: string | null
    valid_until: string | null
    /** Negative once the offer has lapsed; null when open-ended. */
    days_remaining: number | null

    status: QuotationStatus
    status_label: string
    effective_status: QuotationEffectiveStatus
    effective_status_label: string

    subtotal: number
    discount: number
    tax_rate: number
    tax_amount: number
    total: number
    currency: string

    terms: string | null
    notes: string | null
    reject_reason: string | null

    sales_order_id: number | null
    sales_order_code: string | null
    lines?: DocumentLine[]
    created_at: string | null
}

export type SalesOrderStatus = 'open' | 'delivered' | 'cancelled'
export type SalesBillingState = 'not_invoiced' | 'partly_invoiced' | 'invoiced' | 'cancelled'

export interface SalesOrder {
    id: number
    code: string

    customer_id: number
    customer: string | null
    quotation_id: number | null
    quotation_code: string | null

    order_date: string | null
    delivery_date: string | null

    status: SalesOrderStatus
    status_label: string
    /** Derived from the invoices against it. */
    billing_state: SalesBillingState
    billing_state_label: string

    subtotal: number
    discount: number
    tax_rate: number
    tax_amount: number
    total: number
    invoiced_total: number
    currency: string

    notes: string | null
    cancel_reason: string | null
    lines?: DocumentLine[]
    invoices?: Array<{
        id: number
        code: string
        status: InvoiceStatus
        total: number
        payment_state_label: string
    }>
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

    /** Derived: goods in, plus what the bills added, less returns and payments. */
    purchased_total: number
    returned_total: number
    billed_extras: number
    paid_total: number
    balance: number
    /** Deliveries whose invoice has not arrived yet. */
    uninvoiced_total: number

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
/** `custody` is a technician's float — a box with their name on it. */
export type CashBoxType = 'cash' | 'bank' | 'custody'

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
    /** Set only on a custody box — whose float it is. */
    holder?: string | null
    type_label: string
    account_number: string | null
    currency: string
    is_active: boolean
    balance: number
}

/** One heading on the income or expense side, e.g. "تحصيل من العملاء". */
export interface TreasuryBreakdownRow {
    source: string
    label: string
    total: number
    count: number
}

/**
 * Income against expense over a period. `closing_balance` is what the boxes
 * hold at the end of the window, which only equals opening + net when the
 * window runs to today.
 */
export interface TreasuryAnalysis {
    period: { from: string | null; to: string | null }
    opening_balance: number
    income: TreasuryBreakdownRow[]
    expense: TreasuryBreakdownRow[]
    income_total: number
    expense_total: number
    net: number
    closing_balance: number
    boxes: Array<{
        id: number
        name: string
        type: CashBoxType
        holder: string | null
        balance: number
    }>
}

export interface TreasuryStatementRow {
    id: number
    date: string | null
    direction: 'in' | 'out'
    source: string
    label: string
    category: string | null
    note: string | null
    customer: string | null
    actor: string | null
    in: number
    out: number
    /** Running balance, carried down from the opening figure. */
    balance: number
}

export interface TreasuryStatement {
    box: { id: number; name: string; type: CashBoxType; holder: string | null }
    period: { from: string | null; to: string | null }
    opening_balance: number
    rows: TreasuryStatementRow[]
    in_total: number
    out_total: number
    closing_balance: number
}

export interface TreasurySummary {
    cash_on_hand: number
    receivable: number
    overdue_count: number
    collected_this_month: number
    analysis: TreasuryAnalysis
}

export interface CashMovementRow {
    id: number
    direction: 'in' | 'out'
    amount: number
    source: string
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

    branch_id: number | null
    /** The site this job was sent to; null when the account has just one. */
    branch?: {
        id: number
        name: string
        address: string | null
        contact_name: string | null
        contact_number: string | null
        working_hours: string | null
    } | null

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

/* ── Accounting ──────────────────────────────────────────── */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export interface Account {
    id: number
    code: string
    name: string
    type: AccountType
    type_label: string
    parent_id: number | null
    is_group: boolean
    /** Seeded and depended on by the posting rules: renameable, not deletable. */
    is_system: boolean
    is_active: boolean
    /** The machine name a posting rule knows it by, when it has one. */
    key: string | null
    notes: string | null
    /** How far to indent it; the API walks the parents so the screen need not. */
    depth: number
    /** Signed the way the account is meant to read, with children rolled in. */
    balance: number
}

export interface JournalLine {
    id: number
    account_id: number
    account_code: string | null
    account_name: string | null
    cost_center: string | null
    debit: number
    credit: number
    memo: string | null
}

export interface JournalEntry {
    id: number
    code: string
    entry_date: string | null
    memo: string | null
    source: string
    source_label: string
    /** Only a hand-written entry may be struck out rather than reversed. */
    is_manual: boolean
    is_void: boolean
    reverses: string | null
    total: number
    created_by: string | null
    lines: JournalLine[]
}

export interface LedgerRow {
    id: number
    date: string | null
    code: string | null
    entry_id: number
    source: string | null
    source_label: string | null
    memo: string | null
    cost_center: string | null
    debit: number
    credit: number
    balance: number
}

export interface AccountLedger {
    account: { id: number; code: string; name: string; type: AccountType; type_label: string }
    period: { from: string | null; to: string | null }
    opening_balance: number
    rows: LedgerRow[]
    debit_total: number
    credit_total: number
    closing_balance: number
}

export interface TrialBalanceRow {
    id: number
    code: string
    name: string
    type: AccountType
    type_label: string
    debit: number
    credit: number
    balance_debit: number
    balance_credit: number
}

export interface TrialBalance {
    period: { from: string | null; to: string | null }
    rows: TrialBalanceRow[]
    debit_total: number
    credit_total: number
    balance_debit_total: number
    balance_credit_total: number
    /** Zero when the ledger is sound. Shown rather than hidden. */
    difference: number
}

export interface StatementGroup {
    key: string
    name: string
    total: number
    accounts: Array<{ id: number; code: string; name: string; total: number }>
}

export interface IncomeStatement {
    period: { from: string | null; to: string | null }
    revenue: StatementGroup[]
    revenue_total: number
    cost_of_sales: StatementGroup[]
    cost_of_sales_total: number
    gross_profit: number
    expenses: StatementGroup[]
    expenses_total: number
    net_profit: number
}

export interface BalanceSheet {
    as_of: string | null
    assets: StatementGroup[]
    assets_total: number
    liabilities: StatementGroup[]
    liabilities_total: number
    equity: StatementGroup[]
    /** Profit earned and not yet moved anywhere — folded into equity here. */
    retained_earnings: number
    equity_total: number
    liabilities_and_equity_total: number
    difference: number
}

export interface CostCenterReport {
    id: number
    code: string
    name: string
    is_active: boolean
    total: number
    accounts: Array<{ id: number; code: string; name: string; total: number }>
}

export interface AccountingSummary {
    period: { from: string | null; to: string | null }
    revenue: number
    expenses: number
    net_profit: number
    assets: number
    liabilities: number
    equity: number
    balanced: boolean
    /** Documents that moved money but never reached the journal. */
    unposted: {
        invoices: number
        cash_movements: number
        stock_movements: number
    }
}

/* ── Warranties ──────────────────────────────────────────── */

export type WarrantyKind = 'company' | 'supplier' | 'extension'
export type WarrantyCovers = 'parts' | 'labour' | 'both'

/** Derived from the dates on every read — nothing here runs on a timer. */
export type WarrantyEffectiveStatus = 'active' | 'expiring' | 'expired' | 'scheduled' | 'void'

export interface Warranty {
    id: number
    code: string

    asset_id: number
    asset?: string | null
    asset_code?: string | null
    serial?: string | null

    customer_id: number
    customer?: string | null

    kind: WarrantyKind
    kind_label: string
    covers: WarrantyCovers
    covers_label: string

    starts_on: string | null
    ends_on: string | null
    /** Negative once the term has elapsed. */
    days_remaining: number

    status: 'active' | 'void'
    effective_status: WarrantyEffectiveStatus
    effective_status_label: string
    void_reason: string | null

    /** Set on an extension: the warranty it follows. */
    parent_id: number | null
    parent_code?: string | null

    invoice_id: number | null
    invoice_code?: string | null
    supplier_id: number | null
    supplier?: string | null
    supplier_reference: string | null

    terms: string | null
    notes: string | null

    claims_count?: number
    created_at: string | null
}

export type ClaimStatus = 'open' | 'approved' | 'rejected' | 'repaired' | 'replaced' | 'closed'

export interface WarrantyClaim {
    id: number
    code: string

    warranty_id: number
    warranty?: Warranty

    asset_id: number
    asset?: string | null
    asset_code?: string | null
    serial?: string | null
    customer?: string | null

    /** The day the fault happened — what cover is judged against. */
    reported_on: string | null
    fault: string

    status: ClaimStatus
    status_label: string
    is_final: boolean
    decision_note: string | null
    age_days: number

    /** The repair order raised for this claim — an ordinary work order. */
    task_id: number | null
    task_code?: string | null
    task_status?: string | null

    replacement_asset_id: number | null
    replacement?: string | null
    replacement_code?: string | null

    resolved_at: string | null
    created_at: string | null
}

/** «تاريخ الجهاز» — everything one unit has cost us. */
export interface DeviceHistory {
    asset: Asset
    cover: Warranty | null
    warranties: Warranty[]
    claims: WarrantyClaim[]
    summary: {
        claims_open: number
        repairs: number
        replacements: number
    }
}

/* ── Supplier bills & purchase returns ───────────────────── */

export type SupplierInvoiceStatus = 'draft' | 'posted' | 'void'

/** Derived from the payments against it, never stored. */
export type SupplierPaymentState =
    | 'draft'
    | 'void'
    | 'unpaid'
    | 'partly_paid'
    | 'paid'
    | 'overdue'

export interface SupplierInvoiceLine {
    id?: number
    item_id: number | null
    item_code?: string | null
    description: string
    qty: number
    unit_price: number
    line_total: number
}

export interface SupplierInvoice {
    id: number
    code: string
    /** The supplier's own number — what they quote on the phone. */
    supplier_ref: string | null

    supplier_id: number
    supplier?: string | null

    purchase_order_id: number | null
    purchase_order_code?: string | null

    invoice_date: string | null
    due_date: string | null

    subtotal: number
    discount: number
    tax_rate: number
    tax_amount: number
    total: number
    currency: string

    /** Cost the goods receipt already put into payables. */
    covered_value: number
    /** What this bill adds on top of that — tax, price difference, or all of it. */
    accrual: number

    paid_total: number
    returned_total: number
    balance: number

    status: SupplierInvoiceStatus
    payment_state: SupplierPaymentState
    payment_state_label: string
    void_reason: string | null

    lines?: SupplierInvoiceLine[]
    receipts_count?: number

    notes: string | null
    created_at: string | null
}

/** A delivery with no bill against it yet. */
export interface UninvoicedReceipt {
    id: number
    item_id: number
    item: string | null
    unit: string | null
    qty: number
    unit_cost: number
    value: number
    purchase_order_id: number | null
    purchase_order_code: string | null
    received_at: string | null
}

export interface PurchaseReturnLine {
    id?: number
    item_id: number
    item?: string | null
    unit?: string | null
    qty: number
    unit_cost: number
    line_total: number
}

export interface PurchaseReturn {
    id: number
    code: string

    supplier_id: number
    supplier?: string | null

    supplier_invoice_id: number | null
    supplier_invoice_code?: string | null

    warehouse_id: number
    warehouse?: string | null

    return_date: string | null
    reason: string
    /** Nothing leaves the shelf until this is `posted`. */
    status: 'draft' | 'posted'
    status_label: string
    total: number

    lines?: PurchaseReturnLine[]
    notes: string | null
    created_at: string | null
}

export interface SupplierStatementRow {
    date: string | null
    type: 'receipt' | 'invoice' | 'payment' | 'return'
    type_label: string
    code: string
    note: string | null
    debit: number
    credit: number
    balance: number
}

export interface SupplierStatement {
    supplier: {
        id: number
        code: string
        name: string
        company: string | null
        phone: string | null
        tax_id: string | null
    }
    period: { from: string | null; to: string | null }
    opening_balance: number
    rows: SupplierStatementRow[]
    total_credit: number
    total_debit: number
    closing_balance: number
    uninvoiced: number
}

/* ── Reports ─────────────────────────────────────────────── */

export interface SalesReport {
    period: { from: string | null; to: string | null }
    invoices: number
    subtotal: number
    discount: number
    tax: number
    total: number
    collected: number
    outstanding: number
    average_invoice: number
    by_customer: Array<{ id: number; name: string; invoices: number; total: number }>
    by_item: Array<{ item_id: number | null; name: string; qty: number; total: number }>
}

export interface ProfitJob {
    invoice_id: number
    code: string
    task_code: string | null
    customer: string | null
    date: string | null
    revenue: number
    parts_cost: number
    margin: number
    margin_pct: number
}

export interface ProfitReport {
    period: { from: string | null; to: string | null }
    revenue: number
    cost_of_sales: number
    gross_profit: number
    expenses: number
    net_profit: number
    gross_margin_pct: number
    jobs: ProfitJob[]
    jobs_revenue: number
    jobs_cost: number
}

export interface StockReport {
    idle_days: number
    total_value: number
    items_count: number
    by_warehouse: Array<{
        id: number
        name: string
        type: WarehouseType
        type_label: string
        qty: number
        value: number
    }>
    below_reorder: Array<{
        id: number
        code: string
        name: string
        qty: number
        unit: string
        reorder_level: number
        shortfall: number
    }>
    /** Stock nobody has touched — money sitting in a corner. */
    idle: Array<{
        id: number
        code: string
        name: string
        qty: number
        unit: string
        value: number
        last_movement: string | null
    }>
    idle_value: number
    most_consumed: Array<{ id: number; name: string; unit: string; qty: number; value: number }>
}

export interface CustodyReport {
    technicians: CustodyStatement[]
    cash_total: number
    stock_total: number
    devices_total: number
    total_value: number
}

export interface ContractReportRow {
    id: number
    code: string
    customer: string | null
    label: string
    starts_on: string | null
    ends_on: string | null
    days_remaining: number
    effective_status: ContractEffectiveStatus
    value: number
    visits: number
    visits_done: number
    visits_overdue: number
    /** Visits made against visits promised. */
    compliance_pct: number
}

export interface ContractReport {
    expiring_within: number
    active: number
    expiring: ContractReportRow[]
    expired: ContractReportRow[]
    annual_value: number
    visits_overdue: number
    sla_breaches: number
    rows: ContractReportRow[]
}

export interface WarrantyReport {
    expiring_within: number
    active_cover: number
    expiring: Array<{
        id: number
        code: string
        asset: string | null
        asset_code: string | null
        customer: string | null
        ends_on: string | null
        days_remaining: number
        kind_label: string
    }>
    claims_total: number
    claims_open: number
    repairs: number
    replacements: number
    rejected: number
    /** Parts consumed honouring the cover — work done and never billed. */
    repair_cost: number
    by_status: Array<{ status: string; label: string; count: number }>
    by_model: Array<{ model: string; claims: number }>
}

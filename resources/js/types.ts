import { tr } from '@/lib/i18n'

export type Role = 'admin' | 'manager' | 'technician'

export type TaskStatus =
    | 'pending'
    | 'accepted'
    | 'on_the_way'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'postponed'

export type TaskType = 'installation' | 'maintenance' | 'repair' | 'inspection' | 'delivery'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type ReportType = 'diagnosis' | 'completion'

/** A site-inspection verdict: ok, a flagged issue, or not applicable. */
export type SiteCheck = 'ok' | 'issue' | 'na' | null

/** One point on the periodic-maintenance checklist the manager maintains. */
export interface ChecklistItem {
    id: number
    label: string
    sort_order: number
    is_active: boolean
}

/** A technician's answer against a checklist point, snapshotted on a report. */
export interface ChecklistAnswer {
    label: string
    status: 'ok' | 'issue' | 'na' | null
    note?: string | null
}
export type AttachmentKind = 'before' | 'after' | 'document' | 'signature'
export type DeviceCondition = 'good' | 'fair' | 'poor' | 'faulty'

export interface User {
    id: number
    name: string
    email: string
    role: Role
    role_label: string
    effective_role_label?: string
    position: string | null
    position_label: string | null
    phone: string | null
    whatsapp: string | null
    whatsapp_number: string | null
    job_title: string | null
    is_active: boolean
    last_seen_at: string | null
    created_at: string | null
    open_tasks_count?: number
    /** Everything this user may do — role defaults with their overrides applied. */
    permissions?: string[]
}

export type CustomerType =
    | 'factory' | 'hospital' | 'hotel' | 'bank' | 'data_center'
    | 'government' | 'company' | 'tower' | 'education' | 'retail' | 'other'

export type ContractStanding = 'active' | 'expiring' | 'expired' | 'none'

export interface Customer {
    id: number
    code: string
    name: string
    name_en: string | null
    company: string | null
    type: CustomerType | null
    type_label: string | null
    /** How the account settles: on the spot, or on account. */
    payment_terms?: 'cash' | 'credit'
    payment_terms_label?: string
    phone: string | null
    whatsapp: string | null
    whatsapp_number: string | null
    whatsapp_link: string | null
    email: string | null
    tax_id: string | null
    commercial_register: string | null
    address: string | null
    governorate: string | null
    city: string | null
    lat: number | null
    lng: number | null
    map_url: string | null
    maps_url: string | null
    notes: string | null
    is_active: boolean
    tasks_count?: number
    contracts_count?: number
    active_contracts_count?: number
    contract_standing?: ContractStanding
    contract_standing_label?: string
    created_at: string | null
}

/** The institution kinds, value → Arabic label, mirroring Customer::TYPES. */
export const CUSTOMER_TYPES: Record<CustomerType, string> = {
    factory: tr('مصنع'),
    hospital: tr('مستشفى'),
    hotel: tr('فندق'),
    bank: tr('بنك'),
    data_center: tr('مركز بيانات'),
    government: tr('جهة حكومية'),
    company: tr('شركة / مؤسسة'),
    tower: tr('برج / عقار'),
    education: tr('مؤسسة تعليمية'),
    retail: tr('محل تجاري'),
    other: tr('أخرى'),
}

export interface CustomerProfile {
    customer: Customer
    summary: {
        contracts: number
        active_contracts: number
        expiring_contracts: number
        quotations: number
        assets: number
        tasks: number
        outstanding: number
    }
    contracts: Array<{
        id: number
        code: string
        title: string | null
        starts_on: string | null
        ends_on: string | null
        value: number
        status: string
        status_label: string
        days_remaining: number
    }>
    quotations: Array<{
        id: number
        code: string
        title: string | null
        issue_date: string | null
        total: number
        status: string
        status_label: string
    }>
    assets: Array<{ id: number; code: string; label: string; serial: string | null }>
}

export type ItemCategory = 'ups' | 'battery' | 'spare_part' | 'consumable'
export type MovementType =
    | 'receipt' | 'transfer' | 'issue' | 'return' | 'adjustment'
    | 'purchase_return' | 'sales_return'
export type WarehouseType = 'store' | 'van'

export interface Item {
    id: number
    code: string
    sku: string | null
    barcode: string | null
    name: string

    /** The fixed kind, which decides whether a nameplate is asked for. */
    category: ItemCategory
    category_label: string
    /** The editable group the store files it under — what the screens show. */
    item_category_id: number | null
    group?: string | null
    group_chip?: string | null
    unit: string

    /** The nameplate — only on UPS and battery items. Free-form key/value. */
    specs: Record<string, string> | null
    /** What it is quoted at. Cost is the weighted average, kept separately. */
    sell_price: number | null

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

/** One line of a stocktake count sheet: what the book claims for an item. */
export interface StocktakeSheetLine {
    item_id: number
    name: string
    code: string | null
    unit: string | null
    book_qty: number
    unit_cost: number
}

export interface StocktakeSheet {
    warehouse: { id: number; name: string }
    items: StocktakeSheetLine[]
}

/** What a committed stocktake settled: the gap between book and floor. */
export interface StocktakeSummary {
    counted: number
    adjusted: number
    surplus_qty: number
    shortage_qty: number
    net_qty: number
    surplus_value: number
    /** The value of what the count came up short — the shrinkage. */
    shrinkage_value: number
    net_value: number
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
    /** Present on the single-technician and my-custody views, not the overview. */
    expenses?: CustodyExpense[]
    /** What the technician has overspent — the company owes it. Zero in credit. */
    shortfall?: number
    /** The float's movements — advances in, expenses out, settlements. */
    ledger?: CustodyLedgerEntry[]
}

/** One thing a technician paid for out of their float. */
export interface CustodyExpense {
    id: number
    amount: number
    category: string | null
    note: string | null
    task_id?: number | null
    task_code?: string | null
    /** Derived from the expense task when it is linked to one. */
    customer?: string | null
    /** Derived from the expense task when it is linked to one. */
    branch?: string | null
    receipt_url: string | null
    by: string | null
    created_at: string
}

/** One line of the float's ledger. */
export interface CustodyLedgerEntry {
    id: number
    direction: 'in' | 'out'
    amount: number
    source: string
    label: string
    category: string | null
    note: string | null
    task_id: number | null
    task_code: string | null
    receipt_url: string | null
    by: string | null
    created_at: string
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

export interface ItemGroup {
    id: number
    name: string
    slug: string | null
    colour: string | null
    chip: string
    sort: number
    is_active: boolean
    items_count: number
    is_system: boolean
}

export interface SerialUnit {
    id: number
    serial: string
    status: string
    status_label: string
    is_available: boolean
    item_id: number
    item: string | null
    item_code: string | null
    warehouse: string | null
    asset_id: number | null
    asset: string | null
    issued_on_task: string | null
    note: string | null
    received_at?: string | null
    received_from?: string | null
    issued_at?: string | null
    created_at: string | null
}

export interface FileAttachment {
    id: number
    url: string
    is_image: boolean
    original_name: string
    mime: string | null
    size: number
    caption: string | null
    uploader: string | null
    created_at: string | null
}

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
    /** A round is one job per covered branch — these are those jobs. */
    jobs_count?: number
    jobs_done?: number
    jobs?: ContractVisitJob[]
}

/** A site a contract protects — every round visits each of them. */
export interface ContractBranch {
    id: number
    name: string
    address: string | null
}

/** One branch's work order within a maintenance round. */
export interface ContractVisitJob {
    id: number
    code: string
    status: TaskStatus
    status_label: string
    branch: string | null
    technician: string | null
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
    /** The agreed date of the first round; null spreads them across the term. */
    first_visit_on: string | null
    /** Negative once the term has elapsed. */
    days_remaining: number
    status: ContractStatus
    status_label: string
    /** Derived on every read — nothing on the server flips it on a timer. */
    effective_status: ContractEffectiveStatus
    effective_status_label: string
    value: string | null
    currency: string
    billing_frequency: ContractBillingFrequency
    billing_frequency_label: string
    collection_timing: 'upfront' | 'arrears'
    collection_timing_label: string
    includes_spare_parts: boolean
    /** Whether the contract may be activated yet, and which visits are held. */
    first_payment_collected: boolean
    held_visit_sequences: number[]
    payments?: ContractPayment[]
    payments_total: number | null
    collected_total: number | null
    sla_response_hours: number | null
    sla_resolution_hours: number | null
    /** Set when this contract renewed another, and when one renewed it. */
    renewed_from_id: number | null
    renewed_from_code: string | null
    renewal_code: string | null
    notes: string | null
    /** The full editable contract body, printed as the signed agreement. */
    terms: string | null
    assets_count?: number
    assets?: Asset[]
    visits_count?: number
    visits?: ContractVisit[]
    /** Live branches the contract covers, and branches × rounds for the year. */
    branches_count?: number
    jobs_per_year?: number
    branches?: ContractBranch[]
    created_at: string | null
}

export type ContractBillingFrequency = 'upfront' | 'quarterly' | 'semi_annual' | 'annual'

/** One instalment on a contract — the first with activation, the rest on visits. */
export interface WorkflowTemplateStep {
    id: number
    name: string
    description?: string | null
    sort_order: number
    is_required: boolean
}

export interface WorkflowTemplate {
    id: number
    name: string
    description?: string | null
    is_active?: boolean
    steps: WorkflowTemplateStep[]
}

export interface WorkflowStep {
    id: number
    name: string
    description: string | null
    sort_order: number
    is_required: boolean
    completed: boolean
    completed_at: string | null
    completed_by: string | null
    notes: string | null
    attachments: FileAttachment[]
}

export interface InstallmentWorkflow {
    id: number
    status: 'pending' | 'completed'
    completed_at: string | null
    template: Pick<WorkflowTemplate, 'id' | 'name'> | null
    steps: WorkflowStep[]
}

export interface ContractPaymentServiceStats {
    visits_total: number
    visits_completed: number
    visits_statuses: Record<string, number>
    branch_tasks_total: number
    branch_tasks_completed: number
    branches: Array<{
        branch: string
        total: number
        completed: number
        statuses: Record<string, number>
    }>
}

export interface ContractPayment {
    id: number
    sequence: number
    amount: number
    service_year: number | null
    period_number: number | null
    service_from_visit_sequence: number | null
    service_to_visit_sequence: number | null
    due_on: string | null
    service_label: string
    /** The visit its collection gates; null for the upfront instalment. */
    due_visit_sequence: number | null
    status: 'due' | 'collected'
    status_label: string
    is_upfront: boolean
    collected_at: string | null
    invoice_id: number | null
    invoice_code: string | null
    service_stats?: ContractPaymentServiceStats | null
    workflow?: InstallmentWorkflow | null
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
    governorate: string | null
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
    route: BranchRoute | null
    route_total?: number
    notes: string | null
    is_active: boolean

    assets_count?: number | null
    tasks_count?: number | null
    last_visit_completed_at?: string | null
    days_since_last_visit?: number | null
    next_visit_available_at?: string | null
}

/** خط السير: the legs of the trip to a site and their fares, plus extras. */
export interface BranchRoute {
    legs: Array<{ label: string; cost: number | null }>
    allowance?: number | null
    lodging?: number | null
    note?: string | null
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

/** One job in a customer's maintenance history, for the profile and print. */
export interface CustomerTaskRow {
    id: number
    code: string
    date: string | null
    title: string | null
    description: string | null
    type: TaskType
    type_label: string
    status: TaskStatus
    status_label: string
    priority_label: string
    technician: string | null
    customer: string | null
    branch: string | null
    asset: string | null
    /** When work actually began and ended, not when it was booked for. */
    started_at: string | null
    completed_at: string | null
}

export interface CustomerTasksMeta {
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
    total: number
    completed: number
    open: number
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
    /** The product's kind and nameplate, when the line is a catalogue item. */
    item_category?: string | null
    item_category_label?: string | null
    item_specs?: Record<string, string> | null
    unit?: string | null
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
    customer_code: string | null
    /** The site being quoted — null when the deal is with the head office. */
    branch_id: number | null
    branch: string | null
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
    /** Set when the discount was agreed as a rate on the subtotal. */
    discount_percent: number | null
    tax_rate: number
    tax_amount: number
    total: number
    currency: string

    terms: string | null
    /** The conditions the offer closes on; null falls back to the company set. */
    conditions: Array<{ label: string; value: string }> | null
    notes: string | null
    reject_reason: string | null

    sales_order_id: number | null
    sales_order_code: string | null

    submitted_at: string | null
    approved_at: string | null
    approver: string | null
    approval_note: string | null
    is_pending_approval: boolean
    is_approved: boolean

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
    customer_code: string | null
    /** Carried over from the quote — where this order delivers. */
    branch_id: number | null
    branch: string | null
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
    /** Set when the discount was agreed as a rate on the subtotal. */
    discount_percent: number | null
    tax_rate: number
    tax_amount: number
    total: number
    invoiced_total: number
    currency: string

    notes: string | null
    cancel_reason: string | null

    /**
     * Whether the main store can cover this order. `none` means nothing on it
     * comes off a shelf, so there was nothing to check.
     */
    stock?: {
        state: 'ready' | 'short' | 'none'
        short: Array<{ item: string; needed: number; available: number }>
    }

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
    /** Credited back by posted returns — never collected, so never "paid". */
    credited_total: number
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
export type PaymentState =
    | 'draft'
    | 'void'
    | 'unpaid'
    | 'partly_paid'
    | 'paid'
    | 'credited'
    | 'overdue'
export type PaymentMethod =
    | 'cash'
    | 'bank_transfer'
    | 'instapay'
    | 'vodafone_cash'
    | 'cheque'
    | 'wallet'
/** `custody` is a technician's float — a box with their name on it. */
export type CashBoxType = 'cash' | 'bank' | 'custody'

export interface InvoiceLine {
    id?: number
    item_id: number | null
    item_code?: string | null
    description: string
    /** The product's kind and nameplate, when the line is a catalogue item. */
    item_category?: string | null
    item_category_label?: string | null
    item_specs?: Record<string, string> | null
    unit?: string | null
    qty: number
    unit_price: number
    line_total: number
}

export type InvoiceSource = 'sales' | 'contract' | 'warranty' | 'service' | 'manual'

export interface Invoice {
    /** The store the goods leave from when it is issued. Null = default store. */
    warehouse_id?: number | null
    id: number
    code: string

    customer_id: number
    customer?: Customer
    task_id: number | null
    task_code?: string | null
    /** The site visited and the machine worked on, when a job is behind it. */
    branch?: string | null
    asset?: string | null
    asset_serial?: string | null

    /** What the invoice is for — derived from what it hangs off. */
    source: InvoiceSource
    source_label: string

    issue_date: string | null
    due_date: string | null

    status: InvoiceStatus
    status_label: string
    payment_state: PaymentState
    payment_state_label: string
    is_overdue: boolean

    subtotal: number
    discount: number
    /** Set when the discount was agreed as a rate on the subtotal. */
    discount_percent: number | null
    tax_rate: number
    tax_amount: number
    total: number
    paid_total: number
    /** Credited back by posted returns — never collected, so never "paid". */
    credited_total: number
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
    /** Whoever recorded the receipt. */
    actor?: string | null
    /** The employee who physically took the money, when not the one above. */
    collected_by?: string | null
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
    /** Accounting-facing voucher metadata for the cash-book view. */
    voucher_type: string
    voucher_number: string
    journal_code: string | null
    category: string | null
    note: string | null
    description: string
    /** The payer for a receipt or the recipient for a payment. */
    party: string | null
    customer: string | null
    actor: string | null
    /** The account on the other side of the cash entry. */
    account_name: string | null
    account_type: string | null
    /** Debit/credit from the selected cash box's point of view. */
    debit: number
    credit: number
    /** Legacy cash-book aliases retained for existing consumers. */
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
    /** Present only for a supplier-payment movement; used to print or reverse its voucher. */
    supplier_payment_id?: number | null
    /** True when the linked supplier payment was already cancelled by a reverse entry. */
    supplier_payment_is_cancelled?: boolean
    actor: string | null
    created_at: string | null
}

/** A reusable checklist item that can be assigned to one or more recurring bills. */
export interface RecurringExpenseItem {
    id: number
    label: string
}

/** A fixed bill that comes round on a cycle — rent, a line, a licence. */
export interface RecurringExpense {
    id: number
    name: string
    amount: number
    category: string | null
    items: RecurringExpenseItem[]
    cash_box_id: number | null
    cash_box: string | null
    cycle_days: number
    start_on: string | null
    next_due_on: string | null
    last_paid_on: string | null
    days_until_due: number
    is_due_soon: boolean
    is_active: boolean
    notes: string | null
}

/** A printable manual cash voucher — an expense paid or a deposit received. */
export interface CashVoucher {
    id: number
    code: string
    kind: 'receipt' | 'payment'
    title: string
    party: string | null
    amount: number
    cash_box: string | null
    note: string | null
    actor: string | null
    date: string | null
}

export type AssetStatus = 'active' | 'under_repair' | 'retired'

export interface Asset {
    id: number
    code: string
    serial: string | null
    name: string | null
    asset_number: string | null
    barcode: string | null

    brand: string | null
    model: string | null
    ups_type: string | null
    phase: string | null
    capacity: string | null

    input_voltage: string | null
    output_voltage: string | null
    frequency: string | null
    efficiency: string | null
    power_factor: string | null
    battery_voltage: string | null
    battery_count: number | null
    backup_minutes: number | null
    comm_port: string | null

    /** Best available human label — brand+model, else serial, else code. */
    label: string

    customer_id: number
    /** The catalogue item it was drawn from, when it came out of stock. */
    item_id: number | null
    customer?: Customer
    /** The site it stands at — a contract's schedule prints per branch. */
    branch_id: number | null
    branch?: string | null

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
        input_voltage_l2: number | null
        input_voltage_l3: number | null
        output_voltage: number | null
        output_voltage_l2: number | null
        output_voltage_l3: number | null
        frequency: number | null
        load_percent: number | null
        battery_voltage: number | null
        temperature: number | null
        backup_minutes: number | null
    }
    site_checks: {
        earthing: SiteCheck
        environment: SiteCheck
        charger: SiteCheck
        accessories: SiteCheck
    }
    ppm_checklist: ChecklistAnswer[]
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
    service_report_no: string | null
    visit?: {
        time_in: string | null
        time_out: string | null
        duration_minutes: number | null
    }
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
    technicians?: User[]
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
        maps_url: string | null
        contact_name: string | null
        contact_number: string | null
        working_hours: string | null
        route: BranchRoute | null
        route_total: number
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

    /** Active postponement request waiting for admin approval, if any. */
    pending_postponement?: {
        id: number
        postponed_to: string
        reason: string
        requested_by: string
        status: 'pending'
    } | null

    status_logs?: TaskStatusLog[]
    reports?: TaskReport[]
    attachments?: TaskAttachment[]
    expenses?: CustodyExpense[] | null
    expenses_total?: number | null

    created_at: string
    updated_at: string
}

export interface DashboardData {
    stats: {
        by_status: Record<TaskStatus, number>
        open_total: number
        postponed: number
        completed_today: number
        completed_this_month: number
        overdue: number
        unassigned: number
        customers_total?: number
        technicians_total?: number
        /** Contract visits waiting for a technician within the next month. */
        maintenance_due?: number
        warranties_expiring?: number
        contracts_active?: number
        contracts_expiring?: number
        follow_ups_due?: number
        /** Standing-alert counts surfaced on the board. */
        low_stock?: number
        pending_approvals?: number
        delayed?: number
        overdue_invoices?: number
        /** Technicians who have checked in today, and how many are still on site. */
        checked_in_today?: number
        on_site_now?: number
        technician_load?: Array<{
            id: number
            name: string
            job_title: string | null
            open_count: number
            completed_count: number
        }>
    }
    /** Live standing alerts on the board — shortages, delays, overdue money. */
    low_stock?: Array<{ id: number; name: string; qty: number; unit: string; reorder_level: number }>
    delayed_tasks?: Array<{ id: number; code: string; customer: string | null; title: string | null }>
    /** Quotes handed over for sign-off and stuck until someone gives it. */
    pending_approvals?: Array<{
        id: number
        code: string
        customer: string | null
        title: string | null
        total: number
        submitted_at: string | null
    }>
    overdue_invoices?: Array<{
        id: number
        code: string
        customer: string | null
        balance: number
        due_date: string | null
    }>

    upcoming: Task[]
    /** Dispatcher-only: today's field attendance, off the technicians' check-ins. */
    attendance_today?: Array<{
        id: number
        employee: string | null
        employee_code: string | null
        check_in: string | null
        check_out: string | null
        status: AttendanceStatus
        status_label: string
        worked_hours: number
        /** Where the stamp was made. Null when it carried no coordinates. */
        check_in_location: { lat: number; lng: number } | null
        check_out_location: { lat: number; lng: number } | null
    }>
    /** Dispatcher-only: the visits that need someone put on them. */
    maintenance_due?: Task[]
    contracts_expiring?: Contract[]
    /** Cover about to lapse — a renewal or extension waiting to be sold. */
    warranties_expiring?: Array<{
        id: number
        code: string
        asset: string | null
        asset_code: string | null
        customer: string | null
        ends_on: string | null
        days_remaining: number
    }>
    /** Follow-ups past their date — someone you said you'd get back to. */
    follow_ups_due?: Array<{
        id: number
        type_label: string
        subject: string | null
        subject_type: 'lead' | 'customer' | null
        subject_id: number
        due_at: string | null
        owner: string | null
    }>
}

/** One live operational alert on the board. */
export interface AlertItem {
    type: string
    title: string
    body: string
    url: string
}

export interface AlertGroup {
    key: string
    label: string
    count: number
    items: AlertItem[]
}

export interface AppNotification {
    id: string
    data: {
        type: string
        task_id?: number
        code?: string
        title?: string
        body?: string
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
    /** A module list's headline figures, shown as a strip above the list. */
    summary?: Record<string, number>
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
    source_reference: string | null
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
    /** Set when the discount was agreed as a rate on the subtotal. */
    discount_percent: number | null
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
    /** The deliveries this bill covers, as booked in by the storekeeper. */
    receipts?: Array<{
        id: number
        item: string | null
        item_code: string | null
        qty: number
        unit_cost: number
        total: number
        reference: string | null
        moved_on: string | null
    }>

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
    /** Set when the discount was agreed as a rate on the subtotal. */
    discount_percent: number | null
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

export interface CrmReport {
    period: { from: string | null; to: string | null }
    open_count: number
    open_value: number
    pipeline: Array<{ status: string; label: string; count: number; value: number }>
    won: number
    lost: number
    won_value: number
    /** Null until at least one deal is decided — a rate needs a denominator. */
    win_rate: number | null
    by_source: Array<{
        source: string | null
        label: string | null
        total: number
        won: number
        conversion_pct: number
    }>
    follow_ups_open: number
    follow_ups_overdue: number
}

export interface HrReport {
    period: { from: string | null; to: string | null }
    headcount: number
    total_on_book: number
    new_hires: number
    monthly_gross: number
    advances_outstanding: number
    by_department: Array<{ department: string; count: number; payroll: number }>
    payroll: { runs: number; gross: number; deductions: number; net: number }
    leave: Array<{ type: string; label: string; requests: number; days: number }>
    attendance: Array<{ status: string; label: string; count: number }>
}

export interface MaintenanceReport {
    period: { from: string | null; to: string | null }
    tasks: {
        total: number
        open: number
        completed_in_window: number
        sla_breaches: number
        by_status: Array<{ status: string; label: string; count: number }>
    }
    ppm: { visits_done: number; visits_overdue: number; visits_upcoming: number }
    warranty: {
        claims_open: number
        repairs: number
        replacements: number
        repair_cost: number
        by_model: Array<{ model: string; claims: number }>
    }
}

/** A dataset a custom export can pull the raw rows of. */
export interface DatasetOption {
    key: string
    label: string
}

/** The standby-power estate at a glance — the operations dashboard. */
export interface OperationsReport {
    devices: {
        total: number
        working: number
        under_repair: number
        retired: number
        stopped: number
    }
    battery: { good: number; need_check: number; need_replacement: number }
    maintenance: { overdue: number; upcoming: number }
    requests: { open: number; closed: number; sla_breaches: number }
    performance: {
        avg_response_hours: number
        fault_rate: number
        service_level: number | null
    }
    recent_visits: Array<{
        id: number
        code: string
        title: string
        customer: string | null
        technician: string | null
        completed_at: string | null
    }>
    spare_parts: { lines: number; value: number; below_reorder: number }
}

/* ── Sales returns (credit notes) ────────────────────────── */

export interface SalesReturnLine {
    id?: number
    invoice_line_id: number | null
    item_id: number | null
    item?: string | null
    description: string
    qty: number
    unit_price: number
    line_total: number
    /** Whether the goods go back on a shelf or are written off. */
    restock: boolean
    unit_cost: number
}

export interface SalesReturn {
    id: number
    code: string

    customer_id: number
    customer: string | null

    invoice_id: number
    invoice_code: string | null

    warehouse_id: number | null
    warehouse: string | null

    return_date: string | null
    reason: string

    /** Nothing moves — not the stock, not the debt — until this is posted. */
    status: 'draft' | 'posted'
    status_label: string

    subtotal: number
    tax_rate: number
    tax_amount: number
    total: number

    lines: SalesReturnLine[] | null
    notes: string | null
    created_at: string | null
}

/** What an invoice can still take back, line by line. */
export interface ReturnableInvoice {
    invoice: {
        id: number
        code: string
        customer: string | null
        tax_rate: number
        total: number
        credited: number
        balance: number
    }
    lines: Array<{
        invoice_line_id: number
        item_id: number | null
        description: string
        unit: string | null
        qty: number
        returned: number
        remaining: number
        unit_price: number
    }>
}

/* ── Audit trail ─────────────────────────────────────────── */

export interface ActivityEntry {
    id: number
    action: string
    module: string
    module_label: string
    verb_label: string
    /** «الفواتير · إصدار», or the raw action when it is not recognised. */
    label: string
    /** Worth picking out of a long list: refused logins, voids, user changes. */
    is_sensitive: boolean

    description: string | null
    properties: Record<string, unknown> | null

    user_id: number | null
    user: string | null
    user_role: string | null

    subject_type: string | null
    subject_id: number | null

    ip_address: string | null
    created_at: string | null
}

export interface ActivityFilters {
    modules: Array<{ value: string; label: string }>
    actions: Array<{ value: string; total: number }>
    users: Array<{ value: number; label: string }>
    sensitive_count: number
}

/** سند صرف — one payment to a supplier, as it is printed. */
export interface SupplierPaymentVoucher {
    id: number
    code: string
    amount: number
    method: PaymentMethod
    method_label: string
    paid_at: string | null
    reference: string | null
    note: string | null
    supplier: string | null
    supplier_tax_id: string | null
    cash_box: string | null
    invoice_code: string | null
    actor: string | null
}

/* ── Purchase requests ───────────────────────────────────── */

export type RequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'ordered'

export interface PurchaseRequestLine {
    id?: number
    item_id: number | null
    item?: string | null
    description: string
    qty: number
    unit: string | null
    note: string | null
    /** False means this line cannot become an order line as it stands. */
    in_catalogue: boolean
}

export interface PurchaseRequest {
    id: number
    code: string

    requested_by: number
    requester: string | null

    task_id: number | null
    task_code: string | null
    warehouse: string | null

    needed_by: string | null
    priority: TaskPriority
    reason: string | null

    status: RequestStatus
    status_label: string
    is_editable: boolean

    decided_by: number | null
    decider: string | null
    decided_at: string | null
    decision_note: string | null

    purchase_order_id: number | null
    purchase_order_code: string | null

    lines: PurchaseRequestLine[] | null
    created_at: string | null
}

/* ── Serial-tracked units ────────────────────────────────── */

export type SerialStatus = 'in_stock' | 'issued' | 'returned' | 'scrapped'

export interface ItemSerial {
    id: number
    serial: string
    status: SerialStatus
    status_label: string
    is_available: boolean

    item_id: number
    item: string | null
    item_code: string | null

    warehouse: string | null
    asset_id: number | null
    asset: string | null

    /** Where it went, which is the whole point of tracking it. */
    issued_on_task: string | null
    note: string | null

    received_at?: string | null
    received_from?: string | null
    issued_at?: string | null

    created_at: string | null
}

/* ── Cheques & bank reconciliation ───────────────────────── */

export type ChequeDirection = 'incoming' | 'outgoing'
export type ChequeStatus = 'held' | 'deposited' | 'cleared' | 'bounced' | 'cancelled'

export interface Cheque {
    id: number
    code: string
    direction: ChequeDirection
    direction_label: string

    cheque_number: string
    bank_name: string | null
    /** Whose name is on the paper — not always the customer's. */
    party_name: string | null

    customer_id: number | null
    customer: string | null
    supplier_id: number | null
    supplier: string | null

    invoice_id: number | null
    invoice_code: string | null
    supplier_invoice_code: string | null

    issue_date: string | null
    due_date: string | null
    amount: number

    status: ChequeStatus
    status_label: string
    is_open: boolean
    /** Past its date and still not banked. Derived, never stored. */
    is_due: boolean
    days_to_due: number

    cash_box_id: number | null
    box: string | null
    payment_code: string | null

    deposited_on: string | null
    settled_on: string | null
    bounce_reason: string | null
    notes: string | null
    created_at: string | null
}

/** The two figures a cheque book is kept for. */
export interface ChequeOutlook {
    days: number
    incoming_total: number
    incoming_due: number
    outgoing_total: number
    outgoing_due: number
    overdue_incoming: number
    bounced_this_year: number
}

export interface ReconciliationRow {
    id: number
    date: string | null
    direction: 'in' | 'out'
    amount: number
    source: string
    note: string | null
    customer: string | null
    reconciled: boolean
    reconciled_at: string | null
}

export interface Reconciliation {
    box: { id: number; name: string; type: CashBoxType }
    book_balance: number
    reconciled_balance: number
    /** What the bank has not shown yet — cheques in the post, a late deposit. */
    unreconciled_total: number
    statement_balance: number | null
    difference: number | null
    rows: ReconciliationRow[]
}

/* ── Permissions ─────────────────────────────────────────── */

export interface JobRole {
    id: number
    /** What an account stores. Fixed at creation, so renaming is safe. */
    key: string
    name: string
    base_role: Role
    base_role_label: string
    permissions: string[]
    users_count: number
}

export interface JobRoleCatalogue {
    roles: JobRole[]
    groups: PermissionCatalogue['groups']
}

export interface PermissionCatalogue {
    groups: Array<{
        group: string
        permissions: Array<{ key: string; label: string }>
    }>
    defaults: Record<Role, string[]>
}

export interface UserPermissions {
    user: { id: number; name: string; role: Role }
    /** What the role gives without anyone being told. */
    defaults: string[]
    /** Only the departures from that, in either direction. */
    overrides: Record<string, boolean>
    /** The two folded together — what this user may actually do. */
    effective: string[]
}

/* ── Human resources ─────────────────────────────────────── */

export interface Allowance {
    name: string
    amount: number
}

export interface Employee {
    id: number
    code: string
    name: string
    user_id: number | null
    national_id: string | null
    phone: string | null
    job_title: string | null
    department: string | null

    hired_on: string | null
    left_on: string | null
    employment_type: 'full_time' | 'part_time' | 'contract'

    basic_salary: number
    allowances: Allowance[]
    allowances_total: number
    gross_salary: number
    insurance_rate: number
    tax_rate: number

    annual_leave_days: number
    annual_leave_remaining: number
    outstanding_advances: number

    bank_name: string | null
    bank_account: string | null

    status: 'active' | 'suspended' | 'terminated'
    status_label: string
    notes: string | null

    attendance?: {
        this_month: {
            present: number
            late: number
            absent: number
            leave: number
            worked_hours: number
        }
        recent: Array<{
            id: number
            date: string
            status: AttendanceStatus
            status_label: string
            check_in: string | null
            check_out: string | null
            worked_hours: number
        }>
    }
    leave?: Array<{
        id: number
        code: string
        type_label: string
        from_date: string | null
        to_date: string | null
        days: number
        status: string
        status_label: string
    }>
    advances?: Array<{ id: number; code: string; advance_date: string | null; amount: number }>
    payslips?: Array<{
        id: number
        run_code: string | null
        month: string | null
        net: number
        paid_on: string | null
    }>
}

export type LeaveType = 'annual' | 'sick' | 'unpaid'
export interface PpmVisit {
    id: number
    contract_id: number
    contract_code: string | null
    customer: string | null
    sequence: number
    planned_for: string | null
    status: VisitStatus
    status_label: string
    is_overdue: boolean
    task_id: number | null
    task_code: string | null
    task_status: string | null
    task_status_label: string | null
}

export interface PpmSummary {
    total: number
    planned: number
    scheduled: number
    done: number
    skipped: number
    overdue: number
    due_today: number
    upcoming_7: number
    upcoming_30: number
    compliance: number | null
}

export type TenderStatus = 'registered' | 'submitted' | 'won' | 'lost' | 'cancelled'

export interface Tender {
    id: number
    code: string
    reference_no: string | null
    entity: string
    title: string
    customer_id: number | null
    customer: string | null
    announced_on: string | null
    submission_deadline: string | null
    opening_date: string | null
    days_to_deadline: number | null
    estimated_value: number | null
    bid_bond: number | null
    status: TenderStatus
    status_label: string
    awarded_value: number | null
    result_note: string | null
    decided_on: string | null
    owner_id: number | null
    owner: string | null
    description: string | null
    notes: string | null
    created_at: string | null
}

export interface TenderSummary {
    open: number
    won: number
    lost: number
    win_rate: number | null
}

export type SurveyStatus = 'draft' | 'completed' | 'approved'

export interface SiteSurvey {
    id: number
    code: string
    lead_id: number | null
    lead_code: string | null
    customer_id: number | null
    customer: string | null
    branch_id: number | null
    branch: string | null
    surveyed_by: number | null
    surveyor: string | null
    survey_date: string | null
    status: SurveyStatus
    status_label: string
    contact_name: string | null
    contact_phone: string | null
    address: string | null
    city: string | null
    load_kva: number | null
    phase: 'single' | 'three' | null
    phase_label: string | null
    backup_minutes: number | null
    existing_equipment: string | null
    recommendation: string | null
    notes: string | null
    approved_by: number | null
    approver: string | null
    approved_at: string | null
    created_at: string | null
}

export interface SatisfactionSurvey {
    id: number
    task_id: number | null
    task_code: string | null
    task_title: string | null
    customer_id: number | null
    customer: string | null
    status: 'pending' | 'responded'
    status_label: string
    rating: number | null
    comment: string | null
    sent_at: string | null
    responded_at: string | null
    created_at: string | null
}

export interface SatisfactionSummary {
    responses: number
    pending: number
    average: number | null
    response_rate: number | null
    distribution: Record<string, number>
}

export interface SatisfactionCandidate {
    id: number
    code: string
    title: string | null
    customer: string | null
    completed_at: string | null
}

export type BatteryStatus = 'active' | 'replaced' | 'faulty'

export interface Battery {
    id: number
    code: string
    /** The site the bank stands at, beside the customer that owns it. */
    branch_id?: number | null
    branch?: string | null
    asset_id: number | null
    asset: string | null
    asset_label: string | null
    customer_id: number | null
    customer: string | null
    serial_number: string | null
    name: string | null
    asset_tag: string | null
    barcode: string | null
    brand: string | null
    model: string | null
    battery_type: string | null
    size: string | null
    capacity_ah: number | null
    voltage: number | null
    energy_wh: string | null
    count: number
    terminal_type: string | null
    internal_resistance: string | null
    weight: string | null
    dimensions: string | null
    operating_temperature: string | null
    unit_cost: number | null
    sell_price: number | null
    installed_on: string | null
    life_months: number
    warranty_months: number | null
    due_at: string | null
    days_until_due: number | null
    is_overdue: boolean
    status: BatteryStatus
    status_label: string
    replaced_by_id: number | null
    replacement_code: string | null
    replaced_on: string | null
    notes: string | null
    created_at: string | null
}

export type SupplierQuoteStatus = 'received' | 'selected' | 'rejected'

export interface SupplierQuoteLine {
    id: number
    item_id: number | null
    item: string | null
    description: string | null
    qty: number
    unit_price: number
    line_total: number
}

export interface SupplierQuote {
    id: number
    code: string
    supplier_id: number
    supplier: string | null
    purchase_request_id: number | null
    request_code: string | null
    quote_date: string | null
    valid_until: string | null
    status: SupplierQuoteStatus
    status_label: string
    lead_days: number | null
    tax_rate: number
    subtotal: number
    total: number
    purchase_order_id: number | null
    order_code: string | null
    notes: string | null
    lines_count: number
    lines?: SupplierQuoteLine[]
    created_at: string | null
}

export interface Contact {
    id: number
    code: string
    customer_id: number
    customer: string | null
    name: string
    job_title: string | null
    department: string | null
    phone: string | null
    whatsapp: string | null
    email: string | null
    contact_number: string | null
    is_primary: boolean
    is_active: boolean
    notes: string | null
    created_at: string | null
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave' | 'holiday'

export interface Attendance {
    id: number
    employee_id: number
    employee: string | null
    employee_code: string | null
    date: string
    status: AttendanceStatus
    status_label: string
    check_in: string | null
    check_out: string | null
    check_in_lat?: number | null
    check_in_lng?: number | null
    check_out_lat?: number | null
    check_out_lng?: number | null
    late_minutes: number
    worked_hours: number
    note: string | null
    recorded_by: string | null
    created_at: string | null
}

/** One employee's month, tallied for the report. */
export interface AttendanceSummaryRow {
    employee_id: number
    employee: string | null
    employee_code: string | null
    department: string | null
    present_days: number
    late_days: number
    absent_days: number
    leave_days: number
    holiday_days: number
    attended_days: number
    late_minutes: number
    worked_hours: number
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
    id: number
    code: string
    employee_id: number
    employee: string | null
    employee_code: string | null
    type: LeaveType
    type_label: string
    from_date: string | null
    to_date: string | null
    days: number
    status: LeaveStatus
    status_label: string
    reason: string | null
    decided_by: string | null
    decided_at: string | null
    decision_note: string | null
    /** The balance as it stands, for an approver weighing an annual request. */
    annual_remaining: number | null
    created_at: string | null
}

/** The manager's full monthly read on one technician. */
export interface TechnicianProfile {
    technician: {
        id: number
        name: string
        phone: string | null
        job_title: string | null
        open_tasks: number
    }
    performance: {
        assigned: number
        completed: number
        pending: number
        overdue: number
        completion_percentage: number
        avg_time: string
    }
    month: { year: number; month: number }
    employee: {
        id: number
        code: string
        status: string
        status_label: string
        basic_salary: number
        allowances_total: number
        gross_salary: number
        annual_leave_days: number
        annual_leave_taken: number
        annual_leave_remaining: number
        outstanding_advances: number
    } | null
    tasks: {
        total: number
        completed: number
        rows: Array<{
            id: number
            code: string
            date: string | null
            title: string | null
            type_label: string
            status: TaskStatus
            status_label: string
            customer: string | null
            branch: string | null
        }>
    }
    attendance: {
        present_days: number
        late_days: number
        absent_days: number
        leave_days: number
        attended_days: number
        worked_hours: number
        rows: Array<{
            id: number
            date: string | null
            status: AttendanceStatus
            status_label: string
            check_in: string | null
            check_out: string | null
            worked_hours: number
            check_in_location: { lat: number; lng: number } | null
        }>
    }
    leave: Array<{
        id: number
        code: string
        type_label: string
        from_date: string | null
        to_date: string | null
        days: number
        status: LeaveStatus
        status_label: string
    }>
    payslip: {
        id: number
        month_label: string | null
        gross: number
        total_deductions: number
        net: number
        paid_on: string | null
    } | null
}

export interface SalaryAdvance {
    id: number
    code: string
    employee: string | null
    employee_id: number
    advance_date: string | null
    amount: number
    installment: number
    outstanding: number
    box: string | null
}

export type PayrollAdjustmentType = 'deduction' | 'bonus'

export interface PayrollAdjustment {
    id: number
    employee_id: number
    employee: string | null
    employee_code: string | null
    type: PayrollAdjustmentType
    type_label: string
    amount: number
    reason: string | null
    year: number
    month: number
}

export type PayrollStatus = 'draft' | 'approved' | 'paid'

export interface Payslip {
    id: number
    payroll_run_id: number
    run_code: string | null
    month: string | null
    employee_id: number
    employee: string | null
    employee_code: string | null
    job_title: string | null

    basic_salary: number
    allowances: Allowance[]
    allowances_total: number
    additions_total: number
    gross: number

    unpaid_days: number
    unpaid_deduction: number
    advance_recovery: number
    insurance: number
    tax: number
    other_deductions: number
    other_note: string | null
    total_deductions: number

    net: number

    paid_on: string | null
    box: string | null
    is_paid: boolean
}

export interface PayrollRun {
    id: number
    code: string
    year: number
    month: number
    month_label: string
    status: PayrollStatus
    status_label: string
    days_in_month?: number
    approved_at: string | null
    payslips_count?: number
    gross_total?: number
    deductions_total?: number
    net_total: number
    unpaid_net: number
    payslips?: Payslip[]
}

/* ── CRM: leads and follow-ups ───────────────────────────── */

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'won' | 'lost'
export type LeadSource = 'referral' | 'call' | 'walk_in' | 'social' | 'website' | 'other'
export type LeadPriority = 'urgent' | 'high' | 'normal' | 'low'
export type FollowUpType = 'call' | 'visit' | 'whatsapp' | 'email' | 'note'
export type FollowUpStatus = 'pending' | 'overdue' | 'done'

export interface FollowUp {
    id: number
    type: FollowUpType
    type_label: string
    due_at: string | null
    done_at: string | null
    status: FollowUpStatus
    status_label: string
    note: string | null
    outcome: string | null
    subject_type?: 'lead' | 'customer' | null
    subject_id?: number
    subject?: string | null
    subject_code?: string | null
    owner: string | null
    owner_id?: number | null
    created_at?: string
}

export interface Lead {
    id: number
    code: string
    name: string
    company: string | null
    phone: string | null
    whatsapp: string | null
    whatsapp_number: string | null
    email: string | null
    source: LeadSource | null
    source_label: string | null
    status: LeadStatus
    status_label: string
    priority: LeadPriority
    priority_label: string
    est_value: number | null
    notes: string | null
    lost_reason: string | null
    owner: string | null
    owner_id: number | null
    customer_id: number | null
    open_follow_ups?: number | null
    created_at?: string
    /** Only present on the detail view. */
    follow_ups?: FollowUp[]
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type {
    Account,
    AccountLedger,
    AccountingSummary,
    ActivityEntry,
    ActivityFilters,
    Employee,
    LeaveRequest,
    SalaryAdvance,
    PayrollRun,
    Payslip,
    PermissionCatalogue,
    UserPermissions,
    AppNotification,
    Asset,
    BalanceSheet,
    Branch,
    CostCenterReport,
    IncomeStatement,
    JournalEntry,
    TrialBalance,
    Contract,
    CustodyStatement,
    Customer,
    DashboardData,
    CashBoxSummary,
    CashMovementRow,
    Cheque,
    ChequeOutlook,
    Reconciliation,
    Invoice,
    Item,
    Paginated,
    Payment,
    PurchaseOrder,
    Quotation,
    SalesOrder,
    StatementMeta,
    StatementRow,
    Supplier,
    SupplierInvoice,
    SupplierStatement,
    PurchaseReturn,
    UninvoicedReceipt,
    SupplierPaymentVoucher,
    PurchaseRequest,
    ItemSerial,
    SalesReturn,
    ReturnableInvoice,
    SalesReport,
    ProfitReport,
    StockReport,
    CustodyReport,
    ContractReport,
    WarrantyReport,
    StockMovement,
    DeviceHistory,
    Warranty,
    WarrantyClaim,
    TreasuryStatement,
    TreasurySummary,
    VanStockLine,
    WarehouseSummary,
    Task,
    TaskReport,
    TaskStatus,
    User,
} from '@/types'

/* ── Query keys ──────────────────────────────────────────── */

export const keys = {
    dashboard: ['dashboard'] as const,
    tasks: (filters?: Record<string, unknown>) => ['tasks', filters ?? {}] as const,
    task: (id: number | string) => ['task', Number(id)] as const,
    assets: (filters?: Record<string, unknown>) => ['assets', filters ?? {}] as const,
    asset: (id: number | string) => ['asset', Number(id)] as const,
    customers: (filters?: Record<string, unknown>) => ['customers', filters ?? {}] as const,
    customer: (id: number | string) => ['customer', Number(id)] as const,
    contracts: (filters?: Record<string, unknown>) => ['contracts', filters ?? {}] as const,
    contract: (id: number | string) => ['contract', Number(id)] as const,
    users: (filters?: Record<string, unknown>) => ['users', filters ?? {}] as const,
    permissionCatalogue: ['permission-catalogue'] as const,
    userPermissions: (id: number | string) => ['user-permissions', Number(id)] as const,
    technicians: ['technicians'] as const,
    employees: (f?: Record<string, unknown>) => ['employees', f ?? {}] as const,
    employee: (id: number | string) => ['employee', Number(id)] as const,
    leave: (f?: Record<string, unknown>) => ['leave', f ?? {}] as const,
    advances: (f?: Record<string, unknown>) => ['advances', f ?? {}] as const,
    payrollRuns: (f?: Record<string, unknown>) => ['payroll-runs', f ?? {}] as const,
    payrollRun: (id: number | string) => ['payroll-run', Number(id)] as const,
    payslip: (id: number | string) => ['payslip', Number(id)] as const,
    notifications: ['notifications'] as const,

    custody: ['custody'] as const,
    branches: (filters?: Record<string, unknown>) => ['branches', filters ?? {}] as const,
    customerBranches: (id: number | string) => ['customer-branches', Number(id)] as const,

    settings: ['settings'] as const,
    activity: (f?: Record<string, unknown>) => ['activity', f ?? {}] as const,
    activityFilters: ['activity-filters'] as const,
    statement: (id: number | string, range?: Record<string, unknown>) =>
        ['statement', Number(id), range ?? {}] as const,

    quotations: (filters?: Record<string, unknown>) => ['quotations', filters ?? {}] as const,
    quotation: (id: number | string) => ['quotation', Number(id)] as const,
    salesOrders: (filters?: Record<string, unknown>) => ['sales-orders', filters ?? {}] as const,
    salesOrder: (id: number | string) => ['sales-order', Number(id)] as const,

    items: (filters?: Record<string, unknown>) => ['items', filters ?? {}] as const,
    warehouses: ['warehouses'] as const,
    myStock: ['my-stock'] as const,
    movements: (filters?: Record<string, unknown>) => ['movements', filters ?? {}] as const,
    stockSummary: ['stock-summary'] as const,

    invoices: (filters?: Record<string, unknown>) => ['invoices', filters ?? {}] as const,
    invoice: (id: number | string) => ['invoice', Number(id)] as const,
    payments: (filters?: Record<string, unknown>) => ['payments', filters ?? {}] as const,
    cashBoxes: ['cash-boxes'] as const,
    cheques: (f?: Record<string, unknown>) => ['cheques', f ?? {}] as const,
    reconciliation: (id: number | string, p?: Record<string, unknown>) =>
        ['reconciliation', Number(id), p ?? {}] as const,
    cashMovements: (filters?: Record<string, unknown>) => ['cash-movements', filters ?? {}] as const,
    treasurySummary: (range?: Record<string, unknown>) => ['treasury-summary', range ?? {}] as const,
    treasuryStatement: (id: number | string, range?: Record<string, unknown>) =>
        ['treasury-statement', Number(id), range ?? {}] as const,

    warranties: (filters?: Record<string, unknown>) => ['warranties', filters ?? {}] as const,
    warranty: (id: number | string) => ['warranty', Number(id)] as const,
    warrantyClaims: (filters?: Record<string, unknown>) => ['warranty-claims', filters ?? {}] as const,
    warrantyClaim: (id: number | string) => ['warranty-claim', Number(id)] as const,
    deviceHistory: (id: number | string) => ['device-history', Number(id)] as const,

    supplierInvoices: (f?: Record<string, unknown>) => ['supplier-invoices', f ?? {}] as const,
    supplierInvoice: (id: number | string) => ['supplier-invoice', Number(id)] as const,
    uninvoicedReceipts: (id: number | string) => ['uninvoiced-receipts', Number(id)] as const,
    supplierStatement: (id: number | string, range?: Record<string, unknown>) =>
        ['supplier-statement', Number(id), range ?? {}] as const,
    purchaseReturns: (f?: Record<string, unknown>) => ['purchase-returns', f ?? {}] as const,
    purchaseRequests: (f?: Record<string, unknown>) => ['purchase-requests', f ?? {}] as const,
    supplierPayment: (id: number | string) => ['supplier-payment', Number(id)] as const,
    itemSerials: (id: number | string, f?: Record<string, unknown>) =>
        ['item-serials', Number(id), f ?? {}] as const,
    salesReturns: (f?: Record<string, unknown>) => ['sales-returns', f ?? {}] as const,
    returnable: (id: number | string) => ['returnable', Number(id)] as const,
    report: (name: string, params?: Record<string, unknown>) =>
        ['report', name, params ?? {}] as const,

    suppliers: (filters?: Record<string, unknown>) => ['suppliers', filters ?? {}] as const,
    supplier: (id: number | string) => ['supplier', Number(id)] as const,
    purchaseOrders: (filters?: Record<string, unknown>) => ['purchase-orders', filters ?? {}] as const,
    purchaseOrder: (id: number | string) => ['purchase-order', Number(id)] as const,
}

/* ── Dashboard ───────────────────────────────────────────── */

export function useDashboard() {
    return useQuery({
        queryKey: keys.dashboard,
        queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
        refetchInterval: 60_000,
    })
}

/* ── Tasks ───────────────────────────────────────────────── */

export function useTasks(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.tasks(filters),
        queryFn: async () =>
            (await api.get<Paginated<Task>>('/tasks', { params: filters })).data,
        placeholderData: (previous) => previous,
    })
}

export function useTask(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.task(id ?? 0),
        queryFn: async () => (await api.get<{ data: Task }>(`/tasks/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useCreateTask() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<Task>('/tasks', payload)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['tasks'] })
            void client.invalidateQueries({ queryKey: keys.dashboard })
        },
    })
}

export function useUpdateTask(id: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.put<{ data: Task }>(`/tasks/${id}`, payload)).data.data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.task(id) })
            void client.invalidateQueries({ queryKey: ['tasks'] })
        },
    })
}

export function useDeleteTask() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/tasks/${id}`)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['tasks'] })
            void client.invalidateQueries({ queryKey: keys.dashboard })
        },
    })
}

export function useAssignTask(id: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (assignedTo: number | null) =>
            (await api.post<{ data: Task }>(`/tasks/${id}/assign`, { assigned_to: assignedTo })).data.data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.task(id) })
            void client.invalidateQueries({ queryKey: ['tasks'] })
            void client.invalidateQueries({ queryKey: keys.dashboard })
        },
    })
}

interface StatusPayload {
    status: TaskStatus
    note?: string
    cancel_reason?: string
    lat?: number
    lng?: number
}

export function useChangeStatus(id: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: StatusPayload) =>
            (await api.post<{ data: Task }>(`/tasks/${id}/status`, payload)).data.data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.task(id) })
            void client.invalidateQueries({ queryKey: ['tasks'] })
            void client.invalidateQueries({ queryKey: keys.dashboard })
        },
    })
}

export function useSaveReport(taskId: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<TaskReport>(`/tasks/${taskId}/reports`, payload)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.task(taskId) })
        },
    })
}

export function useUploadAttachments(taskId: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ files, kind, caption }: { files: File[]; kind: string; caption?: string }) => {
            const form = new FormData()
            files.forEach((file) => form.append('files[]', file))
            form.append('kind', kind)

            if (caption) form.append('caption', caption)

            return (await api.post(`/tasks/${taskId}/attachments`, form)).data
        },
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.task(taskId) })
        },
    })
}

export function useDeleteAttachment(taskId: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (attachmentId: number) =>
            (await api.delete(`/tasks/${taskId}/attachments/${attachmentId}`)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.task(taskId) })
        },
    })
}

/* ── Customers ───────────────────────────────────────────── */

export function useCustomers(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.customers(filters),
        queryFn: async () =>
            (await api.get<Paginated<Customer>>('/customers', { params: filters })).data,
        placeholderData: (previous) => previous,
    })
}

export function useCustomer(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.customer(id ?? 0),
        queryFn: async () => (await api.get<{ data: Customer }>(`/customers/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSaveCustomer(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            id
                ? (await api.put<{ data: Customer }>(`/customers/${id}`, payload)).data.data
                : (await api.post<Customer>('/customers', payload)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['customers'] })
            void client.invalidateQueries({ queryKey: keys.dashboard })
        },
    })
}

export function useDeleteCustomer() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/customers/${id}`)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['customers'] })
        },
    })
}

/* ── Users ───────────────────────────────────────────────── */

export function useUsers(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.users(filters),
        queryFn: async () => (await api.get<Paginated<User>>('/users', { params: filters })).data,
        placeholderData: (previous) => previous,
    })
}

/**
 * Dispatcher-only resource. Gated inside the hook rather than at each call
 * site so a technician viewing a shared screen never fires a doomed 403.
 */
export function useTechnicians() {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.technicians,
        queryFn: async () => (await api.get<{ data: User[] }>('/technicians')).data.data,
        enabled: canDispatch,
        staleTime: 5 * 60_000,
    })
}

export function useSaveUser(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            id
                ? (await api.put<{ data: User }>(`/users/${id}`, payload)).data.data
                : (await api.post<User>('/users', payload)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['users'] })
            void client.invalidateQueries({ queryKey: keys.technicians })
        },
    })
}

export function useDeleteUser() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/users/${id}`)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['users'] })
            void client.invalidateQueries({ queryKey: keys.technicians })
        },
    })
}

/* ── Assets (the device registry) ────────────────────────── */

export function useAssets(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.assets(filters),
        queryFn: async () => (await api.get<Paginated<Asset>>('/assets', { params: filters })).data,
        // The list endpoint is dispatcher-only; asking as a technician just 403s.
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useAsset(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.asset(id ?? 0),
        queryFn: async () => (await api.get<{ data: Asset }>(`/assets/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSaveAsset(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            id
                ? (await api.put<{ data: Asset }>(`/assets/${id}`, payload)).data.data
                : (await api.post<Asset>('/assets', payload)).data,
        onSuccess: (asset) => {
            void client.invalidateQueries({ queryKey: ['assets'] })
            void client.invalidateQueries({ queryKey: keys.asset(asset.id) })
        },
    })
}

export function useDeleteAsset() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/assets/${id}`)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['assets'] })
        },
    })
}

/* ── Maintenance contracts ───────────────────────────────── */

export function useContracts(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.contracts(filters),
        queryFn: async () => (await api.get<Paginated<Contract>>('/contracts', { params: filters })).data,
        // Dispatcher-only, like the asset list — asking as a technician just 403s.
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useContract(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.contract(id ?? 0),
        queryFn: async () => (await api.get<{ data: Contract }>(`/contracts/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSaveContract(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            id
                ? (await api.put<{ data: Contract }>(`/contracts/${id}`, payload)).data.data
                : (await api.post<Contract>('/contracts', payload)).data,
        onSuccess: (contract) => {
            void client.invalidateQueries({ queryKey: ['contracts'] })
            void client.invalidateQueries({ queryKey: keys.contract(contract.id) })
            // Editing the term can rewrite the visit plan, which changes what
            // the dashboard has to say about work waiting for a technician.
            void client.invalidateQueries({ queryKey: keys.dashboard })
            void client.invalidateQueries({ queryKey: ['tasks'] })
        },
    })
}

export function useDeleteContract() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/contracts/${id}`)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['contracts'] })
            void client.invalidateQueries({ queryKey: keys.dashboard })
        },
    })
}

/**
 * Activate, cancel, or sweep for due visits. All three rebuild or tear down the
 * plan behind the contract, so they share one hook and one invalidation set.
 */
export function useContractAction(id: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (action: 'activate' | 'cancel' | 'materialise') =>
            (await api.post<{ data: Contract }>(`/contracts/${id}/${action}`)).data.data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['contracts'] })
            void client.invalidateQueries({ queryKey: keys.contract(id) })
            void client.invalidateQueries({ queryKey: keys.dashboard })
            void client.invalidateQueries({ queryKey: ['tasks'] })
        },
    })
}

/** Renew a contract. Creates a new one; the old term is left as it was. */
export function useRenewContract(id: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<{ data: Contract }>(`/contracts/${id}/renew`, payload)).data.data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['contracts'] })
            void client.invalidateQueries({ queryKey: keys.contract(id) })
            void client.invalidateQueries({ queryKey: ['report'] })
        },
    })
}

/* ── Inventory ───────────────────────────────────────────── */

export function useItems(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.items(filters),
        queryFn: async () => (await api.get<Paginated<Item>>('/items', { params: filters })).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useSaveItem(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            id
                ? (await api.put<{ data: Item }>(`/items/${id}`, payload)).data.data
                : (await api.post<Item>('/items', payload)).data,
        onSuccess: () => invalidateStock(client),
    })
}

export function useDeleteItem() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/items/${id}`)).data,
        onSuccess: () => invalidateStock(client),
    })
}

export function useWarehouses() {
    return useQuery({
        queryKey: keys.warehouses,
        queryFn: async () =>
            (await api.get<{ data: WarehouseSummary[] }>('/stock/warehouses')).data.data,
    })
}

/** What the signed-in technician is carrying. */
export function useMyStock() {
    const { isTechnician } = useAuth()

    return useQuery({
        queryKey: keys.myStock,
        queryFn: async () => (await api.get<{ data: VanStockLine[] }>('/stock/mine')).data.data,
        enabled: isTechnician,
    })
}

export function useMovements(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.movements(filters),
        queryFn: async () =>
            (await api.get<Paginated<StockMovement>>('/stock/movements', { params: filters })).data,
        placeholderData: (previous) => previous,
    })
}

export function useStockSummary() {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.stockSummary,
        queryFn: async () =>
            (
                await api.get<{
                    items_count: number
                    stock_value: number
                    below_reorder: number
                    vans: number
                }>('/stock/summary')
            ).data,
        enabled: canDispatch,
    })
}

/** Receipt, transfer and stocktake all move balances, so all three refresh the same views. */
export function useStockOperation(operation: 'receive' | 'transfer' | 'adjust') {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<StockMovement>(`/stock/${operation}`, payload)).data,
        onSuccess: () => invalidateStock(client),
    })
}

function invalidateStock(client: ReturnType<typeof useQueryClient>): void {
    for (const key of ['items', 'warehouses', 'movements', 'stock-summary', 'my-stock']) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Custody: money, stock and devices ───────────────────── */

export function useCustody() {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.custody,
        queryFn: async () =>
            (await api.get<{ data: CustodyStatement[] }>('/custody')).data.data,
        enabled: canDispatch,
    })
}

export function useCustodyCash() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post('/custody/cash', payload)).data,
        onSuccess: () => invalidateCustody(client),
    })
}

/** Handing a device over, and taking it back. */
export function useCustodyDevice() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            action,
            id,
            payload,
        }: {
            action: 'take' | 'return'
            id?: number
            payload?: Record<string, unknown>
        }) =>
            (
                await api.post(
                    action === 'take' ? '/custody/devices' : `/custody/devices/${id}/return`,
                    payload ?? {},
                )
            ).data,
        onSuccess: () => invalidateCustody(client),
    })
}

export function useSaveWarehouse(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (
                await (id
                    ? api.put(`/warehouses/${id}`, payload)
                    : api.post('/warehouses', payload))
            ).data,
        onSuccess: () => invalidateCustody(client),
    })
}

export function useDeleteWarehouse() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/warehouses/${id}`)).data,
        onSuccess: () => invalidateCustody(client),
    })
}

/** Custody spans stock and cash, so both sets of totals go stale together. */
function invalidateCustody(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'custody',
        'warehouses',
        'items',
        'movements',
        'stock-summary',
        'my-stock',
        'cash-boxes',
        'cash-movements',
        'treasury-summary',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Customer branches ───────────────────────────────────── */

export function useBranches(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.branches(filters),
        queryFn: async () =>
            (await api.get<{ data: Branch[] }>('/branches', { params: filters })).data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

/** The branches of one customer — what the customer screen expands to show. */
export function useCustomerBranches(customerId: number | undefined) {
    return useQuery({
        queryKey: keys.customerBranches(customerId ?? 0),
        queryFn: async () =>
            (await api.get<{ data: Branch[] }>(`/customers/${customerId}/branches`)).data.data,
        enabled: Boolean(customerId),
    })
}

export function useSaveBranch(customerId: number, id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (
                await (id
                    ? api.put<{ data: Branch }>(`/branches/${id}`, payload)
                    : api.post<{ data: Branch }>(`/customers/${customerId}/branches`, payload))
            ).data.data,
        onSuccess: () => invalidateBranches(client),
    })
}

export function useDeleteBranch() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/branches/${id}`)).data,
        onSuccess: () => invalidateBranches(client),
    })
}

/** A branch change moves where devices and jobs are shown to be. */
function invalidateBranches(client: ReturnType<typeof useQueryClient>): void {
    for (const key of ['branches', 'customer-branches', 'customers', 'assets', 'tasks']) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Company settings & statements ───────────────────────── */

/**
 * The letterhead. Read by every printed document and rarely changed, so it is
 * held for the session rather than re-fetched per document.
 */
export function useSettings() {
    return useQuery({
        queryKey: keys.settings,
        queryFn: async () =>
            (await api.get<{ data: Record<string, string> }>('/settings')).data.data,
        staleTime: Infinity,
    })
}

export function useSaveSettings() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.put<{ data: Record<string, string> }>('/settings', payload)).data.data,
        onSuccess: (data) => client.setQueryData(keys.settings, data),
    })
}

export function useStatement(
    customerId: number | string | undefined,
    range: { from?: string; to?: string } = {},
) {
    return useQuery({
        queryKey: keys.statement(customerId ?? 0, range),
        queryFn: async () =>
            (
                await api.get<{ data: StatementRow[]; meta: StatementMeta }>(
                    `/customers/${customerId}/statement`,
                    { params: range },
                )
            ).data,
        enabled: Boolean(customerId),
    })
}

/* ── Quotations & sales orders ───────────────────────────── */

export function useQuotations(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.quotations(filters),
        queryFn: async () =>
            (await api.get<{ data: Quotation[] }>('/quotations', { params: filters })).data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useQuotation(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.quotation(id ?? 0),
        queryFn: async () => (await api.get<{ data: Quotation }>(`/quotations/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSaveQuotation(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (
                await (id
                    ? api.put<{ data: Quotation }>(`/quotations/${id}`, payload)
                    : api.post<{ data: Quotation }>('/quotations', payload))
            ).data.data,
        onSuccess: () => invalidateSales(client),
    })
}

/** send · accept · reject · cancel — every one shifts what the lists show. */
export function useQuotationAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
        }: {
            id: number
            action: 'send' | 'accept' | 'reject' | 'cancel'
            payload?: Record<string, unknown>
        }) => (await api.post(`/quotations/${id}/${action}`, payload ?? {})).data,
        onSuccess: () => invalidateSales(client),
    })
}

export function useSalesOrders(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.salesOrders(filters),
        queryFn: async () =>
            (await api.get<{ data: SalesOrder[] }>('/sales-orders', { params: filters })).data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useSalesOrder(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.salesOrder(id ?? 0),
        queryFn: async () => (await api.get<{ data: SalesOrder }>(`/sales-orders/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSalesOrderAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
        }: {
            id: number
            action: 'deliver' | 'cancel' | 'invoice'
            payload?: Record<string, unknown>
        }) => (await api.post(`/sales-orders/${id}/${action}`, payload ?? {})).data,
        onSuccess: () => invalidateSales(client),
    })
}

/** Selling touches quotes, orders, invoices and what the customer owes. */
function invalidateSales(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'quotations',
        'quotation',
        'sales-orders',
        'sales-order',
        'invoices',
        'invoice',
        'treasury-summary',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Suppliers & purchasing ──────────────────────────────── */

export function useSuppliers(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.suppliers(filters),
        queryFn: async () =>
            (await api.get<{ data: Supplier[] }>('/suppliers', { params: filters })).data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useSupplier(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.supplier(id ?? 0),
        queryFn: async () => (await api.get<{ data: Supplier }>(`/suppliers/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSaveSupplier(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (
                await (id
                    ? api.put<{ data: Supplier }>(`/suppliers/${id}`, payload)
                    : api.post<{ data: Supplier }>('/suppliers', payload))
            ).data.data,
        onSuccess: () => invalidatePurchasing(client),
    })
}

export function usePurchaseOrders(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.purchaseOrders(filters),
        queryFn: async () =>
            (await api.get<{ data: PurchaseOrder[] }>('/purchase-orders', { params: filters })).data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function usePurchaseOrder(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.purchaseOrder(id ?? 0),
        queryFn: async () =>
            (await api.get<{ data: PurchaseOrder }>(`/purchase-orders/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSavePurchaseOrder(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (
                await (id
                    ? api.put<{ data: PurchaseOrder }>(`/purchase-orders/${id}`, payload)
                    : api.post<{ data: PurchaseOrder }>('/purchase-orders', payload))
            ).data.data,
        onSuccess: () => invalidatePurchasing(client),
    })
}

/** send · cancel · receive — all shift stock, orders and supplier balances. */
export function usePurchaseOrderAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
        }: {
            id: number
            action: 'send' | 'cancel' | 'receive'
            payload?: Record<string, unknown>
        }) =>
            (await api.post<{ data: PurchaseOrder }>(`/purchase-orders/${id}/${action}`, payload ?? {}))
                .data.data,
        onSuccess: () => invalidatePurchasing(client),
    })
}

export function usePaySupplier() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post('/supplier-payments', payload)).data,
        onSuccess: () => invalidatePurchasing(client),
    })
}

/** Buying touches stock, cash and what is owed, so all of it refreshes. */
function invalidatePurchasing(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'suppliers',
        'supplier',
        'purchase-orders',
        'purchase-order',
        'items',
        'warehouses',
        'movements',
        'stock-summary',
        'cash-boxes',
        'cash-movements',
        'treasury-summary',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Invoices & treasury ─────────────────────────────────── */

export function useInvoices(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.invoices(filters),
        queryFn: async () =>
            (await api.get<Paginated<Invoice>>('/invoices', { params: filters })).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useInvoice(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.invoice(id ?? 0),
        queryFn: async () => (await api.get<{ data: Invoice }>(`/invoices/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSaveInvoice(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            id
                ? (await api.put<{ data: Invoice }>(`/invoices/${id}`, payload)).data.data
                : (await api.post<Invoice>('/invoices', payload)).data,
        onSuccess: () => invalidateMoney(client),
    })
}

/** issue · void · delete · bill a finished job — all shift the same views. */
export function useInvoiceAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
            taskId,
        }: {
            id?: number
            action: 'issue' | 'void' | 'delete' | 'from-task'
            payload?: Record<string, unknown>
            taskId?: number
        }) => {
            if (action === 'from-task') {
                return (await api.post<Invoice>(`/tasks/${taskId}/invoice`, payload ?? {})).data
            }

            if (action === 'delete') {
                return (await api.delete(`/invoices/${id}`)).data
            }

            return (await api.post<{ data: Invoice }>(`/invoices/${id}/${action}`, payload ?? {})).data
        },
        onSuccess: () => invalidateMoney(client),
    })
}

export function useCashBoxes() {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.cashBoxes,
        queryFn: async () => (await api.get<{ data: CashBoxSummary[] }>('/treasury/boxes')).data.data,
        enabled: canDispatch,
    })
}

export function useCashMovements(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.cashMovements(filters),
        queryFn: async () =>
            (await api.get<{ data: CashMovementRow[] }>('/treasury/movements', { params: filters })).data
                .data,
        placeholderData: (previous) => previous,
    })
}

/** `range` narrows the analysis; the headline figures ignore it. */
export function useTreasurySummary(range: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const params = pruneRange(range)

    return useQuery({
        queryKey: keys.treasurySummary(params),
        queryFn: async () =>
            (await api.get<TreasurySummary>('/treasury/summary', { params })).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useTreasuryStatement(
    boxId: number | null | undefined,
    range: Record<string, unknown> = {},
) {
    const params = pruneRange(range)

    return useQuery({
        queryKey: keys.treasuryStatement(boxId ?? 0, params),
        queryFn: async () =>
            (await api.get<{ data: TreasuryStatement }>(`/treasury/boxes/${boxId}/statement`, {
                params,
            })).data.data,
        enabled: Boolean(boxId),
    })
}

export function useSaveCashBox() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post('/treasury/boxes', payload)).data,
        onSuccess: () => invalidateMoney(client),
    })
}

/**
 * Blank dates must not reach the API as `from=` — the `date` rule rejects an
 * empty string, and the key would fragment the cache besides.
 */
function pruneRange(range: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(range).filter(([, value]) => Boolean(value)))
}

export function usePayments(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.payments(filters),
        queryFn: async () =>
            (await api.get<Paginated<Payment>>('/payments', { params: filters })).data,
        placeholderData: (previous) => previous,
    })
}

export function useReceivePayment() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<Payment>('/payments', payload)).data,
        onSuccess: () => invalidateMoney(client),
    })
}

export function useReversePayment() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/payments/${id}`)).data,
        onSuccess: () => invalidateMoney(client),
    })
}

/** Cash and receivables move together, so they refresh together. */
export function useTreasuryOperation(operation: 'expense' | 'transfer') {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post(`/treasury/${operation}`, payload)).data,
        onSuccess: () => invalidateMoney(client),
    })
}

function invalidateMoney(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'invoices',
        'invoice',
        'payments',
        'cash-boxes',
        'cash-movements',
        'treasury-summary',
        'treasury-statement',
        'task',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Own profile ─────────────────────────────────────────── */

export function useUpdateProfile() {
    const client = useQueryClient()
    const { refresh } = useAuth()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.put<{ data: User }>('/profile', payload)).data.data,
        onSuccess: async () => {
            // The header and sidebar read the name off the auth context, so it
            // has to be re-fetched — invalidating queries alone would not move it.
            await refresh()
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}

export function useUpdatePassword() {
    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.put<{ message: string }>('/profile/password', payload)).data,
    })
}

/* ── Notifications ───────────────────────────────────────── */

export function useNotifications() {
    return useQuery({
        queryKey: keys.notifications,
        queryFn: async () =>
            (await api.get<{ data: AppNotification[]; meta: { unread_count: number } }>('/notifications'))
                .data,
        refetchInterval: 45_000,
    })
}

export function useMarkAllRead() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async () => (await api.post('/notifications/read-all')).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.notifications })
        },
    })
}

/* â”€â”€ Accounting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const accountingKeys = {
    summary: (range?: Record<string, unknown>) => ['accounting-summary', range ?? {}] as const,
    accounts: (filters?: Record<string, unknown>) => ['accounts', filters ?? {}] as const,
    accountLedger: (id: number | string, range?: Record<string, unknown>) =>
        ['account-ledger', Number(id), range ?? {}] as const,
    entries: (filters?: Record<string, unknown>) => ['journal-entries', filters ?? {}] as const,
    entry: (id: number | string) => ['journal-entry', Number(id)] as const,
    trialBalance: (range?: Record<string, unknown>) => ['trial-balance', range ?? {}] as const,
    incomeStatement: (range?: Record<string, unknown>) => ['income-statement', range ?? {}] as const,
    balanceSheet: (range?: Record<string, unknown>) => ['balance-sheet', range ?? {}] as const,
    costCenters: (range?: Record<string, unknown>) => ['cost-centers', range ?? {}] as const,
}

export function useAccountingSummary(range: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const params = pruneRange(range)

    return useQuery({
        queryKey: accountingKeys.summary(params),
        queryFn: async () =>
            (await api.get<AccountingSummary>('/accounting/summary', { params })).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useAccounts(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const params = pruneRange(filters)

    return useQuery({
        queryKey: accountingKeys.accounts(params),
        queryFn: async () =>
            (await api.get<{ data: Account[] }>('/accounting/accounts', { params })).data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useAccountLedger(
    accountId: number | null | undefined,
    range: Record<string, unknown> = {},
) {
    const params = pruneRange(range)

    return useQuery({
        queryKey: accountingKeys.accountLedger(accountId ?? 0, params),
        queryFn: async () =>
            (await api.get<{ data: AccountLedger }>(`/accounting/accounts/${accountId}/ledger`, {
                params,
            })).data.data,
        enabled: Boolean(accountId),
    })
}

export function useJournalEntries(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const params = pruneRange(filters)

    return useQuery({
        queryKey: accountingKeys.entries(params),
        queryFn: async () =>
            (await api.get<{ data: JournalEntry[]; meta: { total: number; last_page: number } }>(
                '/accounting/entries',
                { params },
            )).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useTrialBalance(range: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const params = pruneRange(range)

    return useQuery({
        queryKey: accountingKeys.trialBalance(params),
        queryFn: async () =>
            (await api.get<{ data: TrialBalance }>('/accounting/trial-balance', { params })).data
                .data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useIncomeStatement(range: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const params = pruneRange(range)

    return useQuery({
        queryKey: accountingKeys.incomeStatement(params),
        queryFn: async () =>
            (await api.get<{ data: IncomeStatement }>('/accounting/income-statement', { params }))
                .data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useBalanceSheet(range: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const params = pruneRange(range)

    return useQuery({
        queryKey: accountingKeys.balanceSheet(params),
        queryFn: async () =>
            (await api.get<{ data: BalanceSheet }>('/accounting/balance-sheet', { params })).data
                .data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useCostCenters(range: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const params = pruneRange(range)

    return useQuery({
        queryKey: accountingKeys.costCenters(params),
        queryFn: async () =>
            (await api.get<{ data: CostCenterReport[] }>('/accounting/cost-centers', { params }))
                .data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useSaveAccount(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            id
                ? (await api.put(`/accounting/accounts/${id}`, payload)).data
                : (await api.post('/accounting/accounts', payload)).data,
        onSuccess: () => invalidateBooks(client),
    })
}

export function useDeleteAccount() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/accounting/accounts/${id}`)).data,
        onSuccess: () => invalidateBooks(client),
    })
}

export function useSaveCostCenter(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            id
                ? (await api.put(`/accounting/cost-centers/${id}`, payload)).data
                : (await api.post('/accounting/cost-centers', payload)).data,
        onSuccess: () => invalidateBooks(client),
    })
}

export function useDeleteCostCenter() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/accounting/cost-centers/${id}`)).data,
        onSuccess: () => invalidateBooks(client),
    })
}

export function usePostEntry() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<{ data: JournalEntry }>('/accounting/entries', payload)).data.data,
        onSuccess: () => invalidateBooks(client),
    })
}

/** Reverse any entry, or strike out a hand-written one. */
export function useEntryAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
        }: {
            id: number
            action: 'reverse' | 'void'
            payload?: Record<string, unknown>
        }) =>
            action === 'void'
                ? (await api.delete(`/accounting/entries/${id}`)).data
                : (await api.post(`/accounting/entries/${id}/reverse`, payload ?? {})).data,
        onSuccess: () => invalidateBooks(client),
    })
}

/** Catch up documents that never reached the journal. */
export function useRepostLedger() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async () => (await api.post<{ message: string }>('/accounting/post')).data,
        onSuccess: () => invalidateBooks(client),
    })
}

/**
 * Every statement is a different view of the same journal, so one posting moves
 * all of them â€” there is no subset worth being clever about.
 */
function invalidateBooks(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'accounting-summary',
        'accounts',
        'account-ledger',
        'journal-entries',
        'journal-entry',
        'trial-balance',
        'income-statement',
        'balance-sheet',
        'cost-centers',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Warranties & claims ─────────────────────────────────── */

export function useWarranties(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.warranties(filters),
        queryFn: async () =>
            (await api.get<Paginated<Warranty>>('/warranties', { params: filters })).data,
        placeholderData: (previous) => previous,
    })
}

export function useWarrantyClaims(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.warrantyClaims(filters),
        queryFn: async () =>
            (await api.get<Paginated<WarrantyClaim>>('/warranty-claims', { params: filters })).data,
        placeholderData: (previous) => previous,
    })
}

export function useWarranty(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.warranty(id ?? 0),
        queryFn: async () => (await api.get<{ data: Warranty }>(`/warranties/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

/** «تاريخ الجهاز»: cover, claims and the repair orders they produced. */
export function useDeviceHistory(assetId: number | string | undefined) {
    return useQuery({
        queryKey: keys.deviceHistory(assetId ?? 0),
        queryFn: async () => (await api.get<DeviceHistory>(`/assets/${assetId}/history`)).data,
        enabled: Boolean(assetId),
    })
}

export function useRegisterWarranty() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<{ data: Warranty }>('/warranties', payload)).data.data,
        onSuccess: () => invalidateWarranties(client),
    })
}

/**
 * Extending, voiding and updating in one hook: they are the same document
 * moving, and the screens that call them refresh the same lists afterwards.
 */
export function useWarrantyAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
        }: {
            id: number
            action: 'extend' | 'void' | 'update'
            payload?: Record<string, unknown>
        }) => {
            if (action === 'update') {
                return (await api.put<{ data: Warranty }>(`/warranties/${id}`, payload ?? {})).data.data
            }

            return (await api.post<{ data: Warranty }>(`/warranties/${id}/${action}`, payload ?? {}))
                .data.data
        },
        onSuccess: () => invalidateWarranties(client),
    })
}

export function useFileClaim() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<{ data: WarrantyClaim }>('/warranty-claims', payload)).data.data,
        onSuccess: () => invalidateWarranties(client),
    })
}

/** Approve, reject, mark repaired, or swap the unit. */
export function useDecideClaim() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...payload }: { id: number } & Record<string, unknown>) =>
            (await api.post<{ data: WarrantyClaim }>(`/warranty-claims/${id}/decide`, payload)).data
                .data,
        onSuccess: () => invalidateWarranties(client),
    })
}

export function useRaiseRepairOrder() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...payload }: { id: number } & Record<string, unknown>) =>
            (await api.post<{ data: Task }>(`/warranty-claims/${id}/repair-order`, payload)).data.data,
        onSuccess: (_, variables) => {
            invalidateWarranties(client)
            // A repair order is a work order, so the dispatch board and the
            // dashboard's open-job counts move with it.
            void client.invalidateQueries({ queryKey: ['tasks'] })
            void client.invalidateQueries({ queryKey: keys.dashboard })
            void client.invalidateQueries({ queryKey: keys.warrantyClaim(variables.id) })
        },
    })
}

function invalidateWarranties(client: ReturnType<typeof useQueryClient>): void {
    for (const key of ['warranties', 'warranty', 'warranty-claims', 'device-history', 'assets', 'asset']) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Supplier bills & purchase returns ───────────────────── */

export function useSupplierInvoices(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.supplierInvoices(filters),
        queryFn: async () =>
            (await api.get<Paginated<SupplierInvoice>>('/supplier-invoices', { params: filters }))
                .data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useSupplierInvoice(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.supplierInvoice(id ?? 0),
        queryFn: async () =>
            (await api.get<{ data: SupplierInvoice }>(`/supplier-invoices/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

/** Deliveries a bill can still be drafted from. */
export function useUninvoicedReceipts(supplierId: number | null | undefined) {
    return useQuery({
        queryKey: keys.uninvoicedReceipts(supplierId ?? 0),
        queryFn: async () =>
            (
                await api.get<{ data: UninvoicedReceipt[]; total: number }>(
                    `/suppliers/${supplierId}/uninvoiced`,
                )
            ).data,
        enabled: Boolean(supplierId),
    })
}

export function useSupplierStatement(
    supplierId: number | string | undefined,
    range: Record<string, unknown> = {},
) {
    const params = pruneRange(range)

    return useQuery({
        queryKey: keys.supplierStatement(supplierId ?? 0, params),
        queryFn: async () =>
            (await api.get<{ data: SupplierStatement }>(`/suppliers/${supplierId}/statement`, {
                params,
            })).data.data,
        enabled: Boolean(supplierId),
    })
}

export function useSaveSupplierInvoice(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (
                await (id
                    ? api.put<{ data: SupplierInvoice }>(`/supplier-invoices/${id}`, payload)
                    : api.post<{ data: SupplierInvoice }>('/supplier-invoices', payload))
            ).data.data,
        onSuccess: () => invalidatePayables(client),
    })
}

/** Post, void or delete — the same document moving, so one hook. */
export function useSupplierInvoiceAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
        }: {
            id: number
            action: 'post' | 'void' | 'delete'
            payload?: Record<string, unknown>
        }) => {
            if (action === 'delete') {
                return (await api.delete(`/supplier-invoices/${id}`)).data
            }

            return (
                await api.post<{ data: SupplierInvoice }>(
                    `/supplier-invoices/${id}/${action}`,
                    payload ?? {},
                )
            ).data.data
        },
        onSuccess: () => invalidatePayables(client),
    })
}

export function usePurchaseReturns(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.purchaseReturns(filters),
        queryFn: async () =>
            (await api.get<Paginated<PurchaseReturn>>('/purchase-returns', { params: filters })).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useSavePurchaseReturn() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<{ data: PurchaseReturn }>('/purchase-returns', payload)).data.data,
        onSuccess: () => invalidatePayables(client),
    })
}

export function usePurchaseReturnAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, action }: { id: number; action: 'post' | 'delete' }) => {
            if (action === 'delete') {
                return (await api.delete(`/purchase-returns/${id}`)).data
            }

            return (await api.post<{ data: PurchaseReturn }>(`/purchase-returns/${id}/post`)).data
                .data
        },
        onSuccess: () => invalidatePayables(client),
    })
}

/**
 * Billing a delivery, returning it and paying for it all move the same three
 * things: what is owed, what is on the shelf, and what the books say.
 */
function invalidatePayables(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'supplier-invoices',
        'supplier-invoice',
        'uninvoiced-receipts',
        'supplier-statement',
        'purchase-returns',
        'suppliers',
        'supplier',
        'purchase-orders',
        'movements',
        'stock-summary',
        'items',
        'accounting-summary',
        'trial-balance',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Reports ─────────────────────────────────────────────── */

/**
 * Every report is the same shape of request: a window, sometimes a threshold,
 * always read-only. One hook rather than six near-identical ones.
 */
function useReport<T>(name: string, params: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()
    const clean = pruneRange(params)

    return useQuery({
        queryKey: keys.report(name, clean),
        queryFn: async () => (await api.get<{ data: T }>(`/reports/${name}`, { params: clean })).data.data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export const useSalesReport = (range: Record<string, unknown> = {}) =>
    useReport<SalesReport>('sales', range)

export const useProfitReport = (range: Record<string, unknown> = {}) =>
    useReport<ProfitReport>('profitability', range)

export const useStockReport = (idleDays = 90) =>
    useReport<StockReport>('stock', { idle_days: idleDays })

export const useCustodyReport = () => useReport<CustodyReport>('custody')

export const useContractReport = (days = 60) => useReport<ContractReport>('contracts', { days })

export const useWarrantyReport = (days = 60) => useReport<WarrantyReport>('warranties', { days })

/**
 * Pull a report's rows as a spreadsheet.
 *
 * Fetched with the auth header and handed to the browser as a blob rather than
 * linked directly — an `<a href>` carries no token, and the endpoint is not
 * open to anyone who guesses the URL.
 */
export async function downloadReport(
    name: string,
    params: Record<string, unknown> = {},
): Promise<void> {
    const response = await api.get(`/reports/${name}/export`, {
        params: pruneRange(params),
        responseType: 'blob',
    })

    const url = URL.createObjectURL(response.data as Blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `${name}.csv`
    link.click()

    URL.revokeObjectURL(url)
}

/* ── Sales returns (credit notes) ────────────────────────── */

export function useSalesReturns(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.salesReturns(filters),
        queryFn: async () =>
            (await api.get<{ data: SalesReturn[]; meta: { total: number } }>('/sales-returns', {
                params: filters,
            })).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

/** What an invoice can still take back — the same numbers the guard enforces. */
export function useReturnableInvoice(invoiceId: number | null | undefined) {
    return useQuery({
        queryKey: keys.returnable(invoiceId ?? 0),
        queryFn: async () =>
            (await api.get<ReturnableInvoice>(`/invoices/${invoiceId}/returnable`)).data,
        enabled: Boolean(invoiceId),
    })
}

export function useSaveSalesReturn() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<{ data: SalesReturn }>('/sales-returns', payload)).data.data,
        onSuccess: () => invalidateCredits(client),
    })
}

export function useSalesReturnAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, action }: { id: number; action: 'post' | 'delete' }) => {
            if (action === 'delete') {
                return (await api.delete(`/sales-returns/${id}`)).data
            }

            return (await api.post<{ data: SalesReturn }>(`/sales-returns/${id}/post`)).data.data
        },
        onSuccess: () => invalidateCredits(client),
    })
}

/**
 * A credit note moves the invoice, the customer's account, the shelf and the
 * books at once, so all four refresh together.
 */
function invalidateCredits(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'sales-returns',
        'returnable',
        'invoices',
        'invoice',
        'statement',
        'treasury-summary',
        'movements',
        'stock-summary',
        'items',
        'accounting-summary',
        'trial-balance',
        'report',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Audit trail ─────────────────────────────────────────── */

export function useActivity(filters: Record<string, unknown> = {}) {
    const { user } = useAuth()

    return useQuery({
        queryKey: keys.activity(filters),
        queryFn: async () =>
            (await api.get<Paginated<ActivityEntry>>('/activity', { params: pruneRange(filters) }))
                .data,
        // Admin-only endpoint; asking as anyone else just 403s.
        enabled: user?.role === 'admin',
        placeholderData: (previous) => previous,
    })
}

export function useActivityFilters() {
    const { user } = useAuth()

    return useQuery({
        queryKey: keys.activityFilters,
        queryFn: async () => (await api.get<ActivityFilters>('/activity/filters')).data,
        enabled: user?.role === 'admin',
    })
}

/* ── Printed vouchers ────────────────────────────────────── */

export function useSupplierPayment(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.supplierPayment(id ?? 0),
        queryFn: async () =>
            (await api.get<{ data: SupplierPaymentVoucher }>(`/supplier-payments/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

/* ── Purchase requests ───────────────────────────────────── */

export function usePurchaseRequests(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.purchaseRequests(filters),
        queryFn: async () =>
            (
                await api.get<{
                    data: PurchaseRequest[]
                    meta: { total: number; last_page: number; awaiting: number }
                }>('/purchase-requests', { params: filters })
            ).data,
        placeholderData: (previous) => previous,
    })
}

export function useSavePurchaseRequest(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (
                await (id
                    ? api.put<{ data: PurchaseRequest }>(`/purchase-requests/${id}`, payload)
                    : api.post<{ data: PurchaseRequest }>('/purchase-requests', payload))
            ).data.data,
        onSuccess: () => invalidateRequests(client),
    })
}

/** Submit, decide, order or delete — the same document moving. */
export function usePurchaseRequestAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
        }: {
            id: number
            action: 'submit' | 'decide' | 'order' | 'delete'
            payload?: Record<string, unknown>
        }) => {
            if (action === 'delete') {
                return (await api.delete(`/purchase-requests/${id}`)).data
            }

            return (await api.post(`/purchase-requests/${id}/${action}`, payload ?? {})).data
        },
        onSuccess: () => invalidateRequests(client),
    })
}

function invalidateRequests(client: ReturnType<typeof useQueryClient>): void {
    for (const key of ['purchase-requests', 'purchase-orders', 'suppliers']) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Serial-tracked units ────────────────────────────────── */

export function useItemSerials(itemId: number | null | undefined, filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.itemSerials(itemId ?? 0, filters),
        queryFn: async () =>
            (
                await api.get<{ data: ItemSerial[]; meta: { total: number; in_stock: number } }>(
                    `/items/${itemId}/serials`,
                    { params: filters },
                )
            ).data,
        enabled: Boolean(itemId),
    })
}

export function useScrapSerial() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, reason }: { id: number; reason: string }) =>
            (await api.post(`/serials/${id}/scrap`, { reason })).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['item-serials'] })
            void client.invalidateQueries({ queryKey: ['items'] })
        },
    })
}

/* ── Cheques & bank reconciliation ───────────────────────── */

export function useCheques(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.cheques(filters),
        queryFn: async () =>
            (
                await api.get<{ data: Cheque[]; meta: ChequeOutlook & { total: number } }>(
                    '/cheques',
                    { params: pruneRange(filters) },
                )
            ).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useSaveCheque() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<{ data: Cheque }>('/cheques', payload)).data.data,
        onSuccess: () => invalidateCheques(client),
    })
}

/** Deposit, clear, bounce or cancel — one document changing state. */
export function useChequeTransition() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...payload }: { id: number } & Record<string, unknown>) =>
            (await api.post<{ data: Cheque }>(`/cheques/${id}/transition`, payload)).data.data,
        onSuccess: () => invalidateCheques(client),
    })
}

export function useReconciliation(
    boxId: number | null | undefined,
    params: Record<string, unknown> = {},
) {
    return useQuery({
        queryKey: keys.reconciliation(boxId ?? 0, params),
        queryFn: async () =>
            (
                await api.get<Reconciliation>(`/treasury/boxes/${boxId}/reconciliation`, {
                    params: pruneRange(params),
                })
            ).data,
        enabled: Boolean(boxId),
    })
}

export function useReconcile() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: { ids: number[]; reconciled: boolean }) =>
            (await api.post('/treasury/reconcile', payload)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['reconciliation'] })
        },
    })
}

/**
 * Clearing a cheque produces a receipt or a voucher, so everything a payment
 * touches moves with it.
 */
function invalidateCheques(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'cheques',
        'reconciliation',
        'invoices',
        'invoice',
        'payments',
        'cash-boxes',
        'cash-movements',
        'treasury-summary',
        'suppliers',
        'supplier-invoices',
        'statement',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

/* ── Permissions ─────────────────────────────────────────── */

export function usePermissionCatalogue() {
    const { isAdmin } = useAuth()

    return useQuery({
        queryKey: keys.permissionCatalogue,
        queryFn: async () => (await api.get<PermissionCatalogue>('/permissions')).data,
        enabled: isAdmin,
        // The catalogue lives in code, so it cannot change while a session is
        // open. Refetching it on every user opened is wasted traffic.
        staleTime: Infinity,
    })
}

export function useUserPermissions(userId: number | null | undefined) {
    return useQuery({
        queryKey: keys.userPermissions(userId ?? 0),
        queryFn: async () =>
            (await api.get<UserPermissions>(`/users/${userId}/permissions`)).data,
        enabled: Boolean(userId),
    })
}

export function useSavePermissions(userId: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: { permissions: Record<string, boolean> }) =>
            (await api.put<UserPermissions>(`/users/${userId}/permissions`, payload)).data,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.userPermissions(userId) })
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}

/* ── Human resources ─────────────────────────────────────── */

export function useEmployees(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.employees(filters),
        queryFn: async () =>
            (await api.get<Paginated<Employee> & { meta: { active: number; monthly_payroll: number } }>(
                '/employees',
                { params: filters },
            )).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useEmployee(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.employee(id ?? 0),
        queryFn: async () => (await api.get<{ data: Employee }>(`/employees/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useSaveEmployee(id?: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (
                await (id
                    ? api.put<{ data: Employee }>(`/employees/${id}`, payload)
                    : api.post<{ data: Employee }>('/employees', payload))
            ).data.data,
        onSuccess: () => invalidateHr(client),
    })
}

export function useDeleteEmployee() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (id: number) => (await api.delete(`/employees/${id}`)).data,
        onSuccess: () => invalidateHr(client),
    })
}

export function useLeave(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.leave(filters),
        queryFn: async () =>
            (await api.get<Paginated<LeaveRequest> & { meta: { pending: number } }>('/leave', {
                params: filters,
            })).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function useSaveLeave() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post<{ data: LeaveRequest }>('/leave', payload)).data.data,
        onSuccess: () => invalidateHr(client),
    })
}

export function useLeaveAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...payload }: { id: number } & Record<string, unknown>) =>
            (await api.post<{ data: LeaveRequest }>(`/leave/${id}/decide`, payload)).data.data,
        onSuccess: () => invalidateHr(client),
    })
}

export function useAdvances(filters: Record<string, unknown> = {}) {
    return useQuery({
        queryKey: keys.advances(filters),
        queryFn: async () =>
            (await api.get<{ data: SalaryAdvance[]; meta: { total: number } }>('/advances', {
                params: filters,
            })).data,
        placeholderData: (previous) => previous,
    })
}

export function useSaveAdvance() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            (await api.post('/advances', payload)).data,
        onSuccess: () => invalidateHr(client),
    })
}

export function usePayrollRuns(filters: Record<string, unknown> = {}) {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.payrollRuns(filters),
        queryFn: async () =>
            (await api.get<{ data: PayrollRun[]; meta: { total: number } }>('/payroll', {
                params: filters,
            })).data,
        enabled: canDispatch,
        placeholderData: (previous) => previous,
    })
}

export function usePayrollRun(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.payrollRun(id ?? 0),
        queryFn: async () => (await api.get<{ data: PayrollRun }>(`/payroll/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

export function useOpenPayroll() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (payload: { year: number; month: number }) =>
            (await api.post<{ data: PayrollRun }>('/payroll', payload)).data.data,
        onSuccess: () => invalidateHr(client),
    })
}

/** Approve or pay a whole run — one document moving. */
export function usePayrollAction(runId: number) {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({ action, ...payload }: { action: 'approve' | 'pay' } & Record<string, unknown>) =>
            (await api.post<{ data: PayrollRun }>(`/payroll/${runId}/${action}`, payload)).data.data,
        onSuccess: () => invalidateHr(client),
    })
}

export function usePayslip(id: number | string | undefined) {
    return useQuery({
        queryKey: keys.payslip(id ?? 0),
        queryFn: async () => (await api.get<{ data: Payslip }>(`/payslips/${id}`)).data.data,
        enabled: Boolean(id),
    })
}

/** Adjust a slip, or pay it on its own. */
export function usePayslipAction() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            action,
            payload,
        }: {
            id: number
            action: 'adjust' | 'pay'
            payload?: Record<string, unknown>
        }) =>
            action === 'adjust'
                ? (await api.put<{ data: Payslip }>(`/payslips/${id}`, payload ?? {})).data.data
                : (await api.post<{ data: Payslip }>(`/payslips/${id}/pay`, payload ?? {})).data.data,
        onSuccess: () => invalidateHr(client),
    })
}

/** Payroll moves money, so the treasury and the books refresh with HR. */
function invalidateHr(client: ReturnType<typeof useQueryClient>): void {
    for (const key of [
        'employees',
        'employee',
        'leave',
        'advances',
        'payroll-runs',
        'payroll-run',
        'payslip',
        'cash-boxes',
        'treasury-summary',
        'accounting-summary',
        'trial-balance',
    ]) {
        void client.invalidateQueries({ queryKey: [key] })
    }
}

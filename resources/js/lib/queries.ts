import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type {
    AppNotification,
    Asset,
    Branch,
    Contract,
    Customer,
    DashboardData,
    CashBoxSummary,
    CashMovementRow,
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
    StockMovement,
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
    technicians: ['technicians'] as const,
    notifications: ['notifications'] as const,

    branches: (filters?: Record<string, unknown>) => ['branches', filters ?? {}] as const,
    customerBranches: (id: number | string) => ['customer-branches', Number(id)] as const,

    settings: ['settings'] as const,
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
    cashMovements: (filters?: Record<string, unknown>) => ['cash-movements', filters ?? {}] as const,
    treasurySummary: ['treasury-summary'] as const,

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

export function useTreasurySummary() {
    const { canDispatch } = useAuth()

    return useQuery({
        queryKey: keys.treasurySummary,
        queryFn: async () =>
            (
                await api.get<{
                    cash_on_hand: number
                    receivable: number
                    overdue_count: number
                    collected_this_month: number
                }>('/treasury/summary')
            ).data,
        enabled: canDispatch,
    })
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

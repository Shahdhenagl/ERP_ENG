import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type {
    AppNotification,
    Asset,
    Customer,
    DashboardData,
    Paginated,
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
    users: (filters?: Record<string, unknown>) => ['users', filters ?? {}] as const,
    technicians: ['technicians'] as const,
    notifications: ['notifications'] as const,
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

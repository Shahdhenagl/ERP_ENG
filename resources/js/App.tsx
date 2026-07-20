import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { ToastProvider } from '@/components/Toast'
import { PageLoader } from '@/components/ui'
import { AuthProvider, useAuth } from '@/lib/auth'
import { areaFor } from '@/lib/nav'
import { AssetDetail } from '@/pages/AssetDetail'
import { AssetList } from '@/pages/AssetList'
import { ContractDetail } from '@/pages/ContractDetail'
import { ContractList } from '@/pages/ContractList'
import { CustomerList } from '@/pages/CustomerList'
import { Inventory } from '@/pages/Inventory'
import { InvoiceDetail } from '@/pages/InvoiceDetail'
import { InvoiceList } from '@/pages/InvoiceList'
import { Treasury } from '@/pages/Treasury'
import { MyStock } from '@/pages/MyStock'
import { Dashboard } from '@/pages/Dashboard'
import { Login } from '@/pages/Login'
import { Profile } from '@/pages/Profile'
import { TaskDetail } from '@/pages/TaskDetail'
import { TaskForm } from '@/pages/TaskForm'
import { TaskList } from '@/pages/TaskList'
import { UserList } from '@/pages/UserList'
import type { Role } from '@/types'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: true,
            staleTime: 20_000,
        },
    },
})

export function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <ToastProvider>
                    <AuthProvider>
                        <Routes>
                            <Route path="/login" element={<Login />} />

                            <Route element={<RequireAuth />}>
                                <Route element={<AppLayout />}>
                                    {/* ── Technician area ──────────────── */}
                                    <Route path="tech" element={<RequireRole roles={['technician']} />}>
                                        <Route index element={<Dashboard />} />
                                        <Route path="tasks" element={<TaskList />} />
                                        <Route path="tasks/:id" element={<TaskDetail />} />
                                        {/* Read-only, and scoped by the API to
                                            devices they were dispatched to. */}
                                        <Route path="assets/:id" element={<AssetDetail />} />
                                        {/* Read-only view of what they are carrying. */}
                                        <Route path="stock" element={<MyStock />} />
                                        <Route path="profile" element={<Profile />} />
                                    </Route>

                                    {/* ── Dispatcher area ──────────────── */}
                                    <Route path="manager" element={<RequireRole roles={['admin', 'manager']} />}>
                                        <Route index element={<Dashboard />} />
                                        <Route path="tasks" element={<TaskList />} />
                                        <Route path="tasks/new" element={<TaskForm />} />
                                        <Route path="tasks/:id" element={<TaskDetail />} />
                                        <Route path="tasks/:id/edit" element={<TaskForm />} />
                                        <Route path="customers" element={<CustomerList />} />
                                        <Route path="assets" element={<AssetList />} />
                                        <Route path="assets/:id" element={<AssetDetail />} />
                                        <Route path="contracts" element={<ContractList />} />
                                        <Route path="contracts/:id" element={<ContractDetail />} />
                                        <Route path="inventory" element={<Inventory />} />
                                        <Route path="invoices" element={<InvoiceList />} />
                                        <Route path="invoices/:id" element={<InvoiceDetail />} />
                                        <Route path="treasury" element={<Treasury />} />
                                        <Route path="profile" element={<Profile />} />

                                        <Route element={<RequireRole roles={['admin']} />}>
                                            <Route path="users" element={<UserList />} />
                                        </Route>
                                    </Route>

                                    {/* Notifications and old bookmarks still point at the
                                        unprefixed paths — they cannot know the recipient's
                                        area, so resolve it here at click time. */}
                                    <Route path="tasks/:id" element={<AreaRedirect to="/tasks/:id" />} />
                                    <Route path="tasks" element={<AreaRedirect to="/tasks" />} />
                                </Route>
                            </Route>

                            <Route path="*" element={<AreaRedirect to="/" />} />
                        </Routes>
                    </AuthProvider>
                </ToastProvider>
            </BrowserRouter>
        </QueryClientProvider>
    )
}

/* ── Route guards ────────────────────────────────────────── */

function RequireAuth() {
    const { user, loading } = useAuth()

    if (loading) return <PageLoader />
    if (!user) return <Navigate to="/login" replace />

    return <Outlet />
}

function RequireRole({ roles }: { roles: Role[] }) {
    const { user } = useAuth()

    // Silently send the user to their own area rather than showing a dead-end
    // error page — a technician who opens /manager just lands on /tech.
    if (!user || !roles.includes(user.role)) return <AreaRedirect to="/" />

    return <Outlet />
}

/**
 * Resolves an unprefixed path against the signed-in user's area. `:id` is
 * filled from the current match so a notification link survives the redirect.
 */
function AreaRedirect({ to }: { to: string }) {
    const { user, loading } = useAuth()
    const { id } = useParams()

    if (loading) return <PageLoader />
    if (!user) return <Navigate to="/login" replace />

    const suffix = id ? to.replace(':id', id) : to

    return <Navigate to={areaFor(user.role) + (suffix === '/' ? '' : suffix)} replace />
}

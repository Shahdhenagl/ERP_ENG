import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
    BrowserRouter,
    Navigate,
    Outlet,
    Route,
    Routes,
    useLocation,
    useParams,
} from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { ToastProvider } from '@/components/Toast'
import { PageLoader } from '@/components/ui'
import { AuthProvider, useAuth } from '@/lib/auth'
import { areaFor } from '@/lib/nav'
import { AccountingLayout } from '@/pages/accounting/AccountingLayout'
import { AccountsPage } from '@/pages/accounting/AccountsPage'
import { BalanceSheetPage } from '@/pages/accounting/BalanceSheetPage'
import { CostCentersPage } from '@/pages/accounting/CostCentersPage'
import { GeneralLedgerPage } from '@/pages/accounting/GeneralLedgerPage'
import { IncomeStatementPage } from '@/pages/accounting/IncomeStatementPage'
import { JournalPage } from '@/pages/accounting/JournalPage'
import { TrialBalancePage } from '@/pages/accounting/TrialBalancePage'
import { AssetDetail } from '@/pages/AssetDetail'
import { AssetList } from '@/pages/AssetList'
import { BatteriesPage } from '@/pages/BatteriesPage'
import { SatisfactionPage } from '@/pages/SatisfactionPage'
import { PpmPage } from '@/pages/PpmPage'
import { PartsUsedPage } from '@/pages/PartsUsedPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { ContractDetail } from '@/pages/ContractDetail'
import { ContractList } from '@/pages/ContractList'
import { ContractRenewalsPage } from '@/pages/ContractRenewalsPage'
import { ContractHistoryPage } from '@/pages/ContractHistoryPage'
import { CustomerList } from '@/pages/CustomerList'
import { CustomerProfile } from '@/pages/CustomerProfile'
import { ContactsPage } from '@/pages/ContactsPage'
import { SiteSurveyPage } from '@/pages/SiteSurveyPage'
import { CustodyPage } from '@/pages/inventory/CustodyPage'
import { CustodySettlePage } from '@/pages/inventory/CustodySettlePage'
import { CustodyStatementPage } from '@/pages/inventory/CustodyStatementPage'
import { InventoryLayout } from '@/pages/inventory/InventoryLayout'
import { ItemsPage } from '@/pages/inventory/ItemsPage'
import { MovementsPage } from '@/pages/inventory/MovementsPage'
import { StocktakePage } from '@/pages/inventory/StocktakePage'
import { StockIssuePage } from '@/pages/inventory/StockIssuePage'
import { WarehouseTransferPage } from '@/pages/inventory/WarehouseTransferPage'
import { ItemGroupsPage } from '@/pages/inventory/ItemGroupsPage'
import { WarehousesPage } from '@/pages/inventory/WarehousesPage'
import { InvoiceDetail } from '@/pages/InvoiceDetail'
import { InvoiceList } from '@/pages/InvoiceList'
import { Purchasing } from '@/pages/Purchasing'
import { PurchaseReceivingPage } from '@/pages/purchasing/PurchaseReceivingPage'
import { SupplierQuotesPage } from '@/pages/SupplierQuotesPage'
import { TendersPage } from '@/pages/TendersPage'
import { Sales } from '@/pages/Sales'
import { QuoteApprovalsPage } from '@/pages/sales/QuoteApprovalsPage'
import { DeliveryNotesPage } from '@/pages/sales/DeliveryNotesPage'
import { Settings } from '@/pages/Settings'
import { InvoicePrint } from '@/pages/print/InvoicePrint'
import { QuotationPrint } from '@/pages/print/QuotationPrint'
import { ServiceReportPrint } from '@/pages/print/ServiceReportPrint'
import { StatementPrint } from '@/pages/print/StatementPrint'
import { CustomerTasksPrint } from '@/pages/print/CustomerTasksPrint'
import { CustomerLedgerPrint } from '@/pages/print/CustomerLedgerPrint'
import { SiteSurveyPrint } from '@/pages/print/SiteSurveyPrint'
import { ContractPrint } from '@/pages/print/ContractPrint'
import { DeliveryNotePrint } from '@/pages/print/DeliveryNotePrint'
import { PaymentVoucherPrint } from '@/pages/print/PaymentVoucherPrint'
import { CashVoucherPrint } from '@/pages/print/CashVoucherPrint'
import { CustodyStatementPrint } from '@/pages/print/CustodyStatementPrint'
import { TaskListPrint } from '@/pages/print/TaskListPrint'
import { InvoiceListPrint } from '@/pages/print/InvoiceListPrint'
import { MovementListPrint } from '@/pages/print/MovementListPrint'
import { ReceiptPrint } from '@/pages/print/ReceiptPrint'
import { WarrantyCertificate } from '@/pages/print/WarrantyCertificate'
import { ContractReportPage } from '@/pages/reports/ContractReportPage'
import { CustodyReportPage } from '@/pages/reports/CustodyReportPage'
import { CustomExportPage } from '@/pages/reports/CustomExportPage'
import { HrReportPage } from '@/pages/reports/HrReportPage'
import { MaintenanceReportPage } from '@/pages/reports/MaintenanceReportPage'
import { ProfitReportPage } from '@/pages/reports/ProfitReportPage'
import { ReportsLayout } from '@/pages/reports/ReportsLayout'
import { SalesReportPage } from '@/pages/reports/SalesReportPage'
import { StockReportPage } from '@/pages/reports/StockReportPage'
import { WarrantyReportPage } from '@/pages/reports/WarrantyReportPage'
import { CrmReportPage } from '@/pages/reports/CrmReportPage'
import { CrmPage } from '@/pages/crm/CrmPage'
import { FollowUpsPage } from '@/pages/crm/FollowUpsPage'
import { CustomerLedgerPage } from '@/pages/CustomerLedgerPage'
import { HrPage } from '@/pages/hr/HrPage'
import { PayslipPrint } from '@/pages/print/PayslipPrint'
import { ClaimsPage } from '@/pages/warranty/ClaimsPage'
import { WarrantyLayout } from '@/pages/warranty/WarrantyLayout'
import { WarrantyRegisterPage } from '@/pages/warranty/WarrantyRegisterPage'
import { WarrantyCertificatePage } from '@/pages/warranty/WarrantyCertificatePage'
import { RepairOrdersPage } from '@/pages/warranty/RepairOrdersPage'
import { WarrantyLifecyclePage } from '@/pages/warranty/WarrantyLifecyclePage'
import { ChequesPage } from '@/pages/treasury/ChequesPage'
import { BanksPage } from '@/pages/treasury/BanksPage'
import { TreasuryPage } from '@/pages/treasury/TreasuryPage'
import { DaybookPage } from '@/pages/treasury/DaybookPage'
import { PaymentsOutPage } from '@/pages/treasury/PaymentsOutPage'
import { CashOperationsPage } from '@/pages/treasury/CashOperationsPage'
import { MyStock } from '@/pages/MyStock'
import { ComingSoon } from '@/pages/ComingSoon'
import { TechniciansPage } from '@/pages/TechniciansPage'
import { TechnicianProfile } from '@/pages/TechnicianProfile'
import { TechLeavePage } from '@/pages/TechLeavePage'
import { CollectionsPage } from '@/pages/CollectionsPage'
import { CustomerStatementPage } from '@/pages/CustomerStatementPage'
import { SupplierStatementPage } from '@/pages/SupplierStatementPage'
import { Dashboard } from '@/pages/Dashboard'
import { Login } from '@/pages/Login'
import { Profile } from '@/pages/Profile'
import { TaskDetail } from '@/pages/TaskDetail'
import { TaskForm } from '@/pages/TaskForm'
import { TaskList } from '@/pages/TaskList'
import { AuditLog } from '@/pages/AuditLog'
import { RolesPage } from '@/pages/RolesPage'
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
                                {/* ── Printed documents ────────────────
                                    Outside AppLayout on purpose: a document is
                                    a sheet of paper, not a screen with a nav
                                    bar wrapped round it.

                                    Nested under /manager so the links can be
                                    built with the same path() helper as every
                                    other dispatcher route. */}
                                <Route
                                    path="manager/print"
                                    element={<RequireRole roles={['admin', 'manager']} />}
                                >
                                    <Route path="invoices/:id" element={<InvoicePrint />} />
                                    <Route path="quotations/:id" element={<QuotationPrint />} />
                                    <Route path="statements/:id" element={<StatementPrint />} />
                                    <Route path="customer-tasks/:id" element={<CustomerTasksPrint />} />
                                    <Route path="customer-ledger/:id" element={<CustomerLedgerPrint />} />
                                    <Route path="site-surveys/:id" element={<SiteSurveyPrint />} />
                                    <Route path="contracts/:id" element={<ContractPrint />} />
                                    <Route path="warranty/:id" element={<WarrantyCertificate />} />
                                    <Route path="delivery/:id" element={<DeliveryNotePrint />} />
                                    <Route path="vouchers/:id" element={<PaymentVoucherPrint />} />
                                    <Route path="cash-vouchers/:id" element={<CashVoucherPrint />} />
                                    <Route path="custody/:id" element={<CustodyStatementPrint />} />
                                    <Route path="tasks" element={<TaskListPrint />} />
                                    <Route path="invoices-list" element={<InvoiceListPrint />} />
                                    <Route path="movements" element={<MovementListPrint />} />
                                    <Route path="receipts/:id" element={<ReceiptPrint />} />
                                    <Route path="payslips/:id" element={<PayslipPrint />} />
                                </Route>

                                {/* The service report is unprefixed: a technician
                                    prints it on site and has the customer sign
                                    it, so both roles reach the same URL. */}
                                <Route path="print/tasks/:id" element={<ServiceReportPrint />} />

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
                                        <Route path="leave" element={<TechLeavePage />} />
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
                                        <Route path="customers/:id" element={<CustomerProfile />} />
                                        <Route path="crm" element={<CrmPage />} />
                                        <Route path="customer-followups" element={<FollowUpsPage />} />
                                        <Route path="customer-ledger" element={<CustomerLedgerPage />} />
                                        <Route path="notifications" element={<NotificationsPage />} />
                                        <Route path="contacts" element={<ContactsPage />} />
                                        <Route path="site-surveys" element={<SiteSurveyPage />} />
                                        <Route path="assets" element={<AssetList />} />
                                        <Route path="assets/:id" element={<AssetDetail />} />
                                        <Route path="batteries" element={<BatteriesPage />} />
                                        <Route path="satisfaction" element={<SatisfactionPage />} />
                                        <Route path="ppm" element={<PpmPage />} />
                                        <Route path="parts-used" element={<PartsUsedPage />} />
                                        <Route path="contracts" element={<ContractList />} />
                                        <Route path="contracts/renewals" element={<ContractRenewalsPage />} />
                                        <Route path="contracts/history" element={<ContractHistoryPage />} />
                                        <Route path="contracts/:id" element={<ContractDetail />} />
                                        {/* Sections rather than tabs, so the
                                            sidebar can link straight into one. */}
                                        <Route path="inventory" element={<InventoryLayout />}>
                                            <Route index element={<Navigate to="items" replace />} />
                                            <Route path="items" element={<ItemsPage />} />
                                            <Route path="warehouses" element={<WarehousesPage />} />
                                            {/* Custody moved out of the shell; keep the
                                                old link working. */}
                                            <Route
                                                path="custody"
                                                element={<Navigate to="/manager/custody" replace />}
                                            />
                                            <Route path="movements" element={<MovementsPage />} />
                                            <Route path="stocktake" element={<StocktakePage />} />
                                        </Route>

                                        {/* Standalone inventory screens — own header,
                                            reached from the sidebar, not folded into
                                            the inventory shell's tabs. */}
                                        <Route path="inventory/issue" element={<StockIssuePage />} />
                                        <Route path="inventory/transfers" element={<WarehouseTransferPage />} />
                                        <Route path="inventory/groups" element={<ItemGroupsPage />} />
                                        <Route path="custody" element={<CustodyPage />} />
                                        <Route path="custody/settle" element={<CustodySettlePage />} />
                                        <Route path="custody/statement" element={<CustodyStatementPage />} />
                                        <Route path="warranties" element={<WarrantyLayout />}>
                                            <Route index element={<Navigate to="register" replace />} />
                                            <Route path="register" element={<WarrantyRegisterPage />} />
                                            <Route path="claims" element={<ClaimsPage />} />
                                        </Route>

                                        {/* Standalone warranty screens — own header,
                                            reached from the sidebar. */}
                                        <Route path="warranties/certificate" element={<WarrantyCertificatePage />} />
                                        <Route path="warranties/repair-orders" element={<RepairOrdersPage />} />
                                        <Route path="warranties/lifecycle" element={<WarrantyLifecyclePage />} />

                                        <Route path="sales" element={<Sales />} />
                                        <Route path="sales/approvals" element={<QuoteApprovalsPage />} />
                                        <Route path="sales/deliveries" element={<DeliveryNotesPage />} />
                                        <Route path="sales/:tab" element={<Sales />} />
                                        <Route path="purchasing" element={<Purchasing />} />
                                        <Route path="purchasing/receiving" element={<PurchaseReceivingPage />} />
                                        <Route path="purchasing/:tab" element={<Purchasing />} />
                                        <Route path="supplier-quotes" element={<SupplierQuotesPage />} />
                                        <Route path="tenders" element={<TendersPage />} />
                                        <Route path="invoices" element={<InvoiceList />} />
                                        <Route path="invoices/:id" element={<InvoiceDetail />} />
                                        <Route path="treasury" element={<TreasuryPage />} />
                                        <Route path="treasury/daybook" element={<DaybookPage />} />
                                        <Route path="treasury/payments-out" element={<PaymentsOutPage />} />
                                        <Route path="treasury/operations" element={<CashOperationsPage />} />
                                        <Route path="collections" element={<CollectionsPage />} />
                                        <Route path="customer-statement" element={<CustomerStatementPage />} />
                                        <Route path="supplier-statement" element={<SupplierStatementPage />} />
                                        <Route path="cheques" element={<ChequesPage />} />
                                        <Route path="cheques/:view" element={<ChequesPage />} />
                                        <Route path="banks" element={<BanksPage />} />
                                        <Route path="banks/:view" element={<BanksPage />} />
                                        <Route path="technicians" element={<TechniciansPage />} />
                                        <Route path="technicians/:id" element={<TechnicianProfile />} />
                                        <Route path="hr" element={<HrPage />} />
                                        <Route path="hr/:tab" element={<HrPage />} />

                                        {/* Sections rather than tabs for the
                                            same reason as inventory: the
                                            sidebar links straight into one. */}
                                        <Route path="accounting" element={<AccountingLayout />}>
                                            <Route index element={<Navigate to="accounts" replace />} />
                                            <Route path="accounts" element={<AccountsPage />} />
                                            <Route path="journal" element={<JournalPage />} />
                                            <Route path="ledger" element={<GeneralLedgerPage />} />
                                            <Route path="trial-balance" element={<TrialBalancePage />} />
                                            <Route path="income-statement" element={<IncomeStatementPage />} />
                                            <Route path="balance-sheet" element={<BalanceSheetPage />} />
                                            <Route path="cost-centers" element={<CostCentersPage />} />
                                        </Route>

                                        <Route path="reports" element={<ReportsLayout />}>
                                            <Route index element={<Navigate to="sales" replace />} />
                                            <Route path="sales" element={<SalesReportPage />} />
                                            <Route path="profit" element={<ProfitReportPage />} />
                                            <Route path="stock" element={<StockReportPage />} />
                                            <Route path="custody" element={<CustodyReportPage />} />
                                            <Route path="contracts" element={<ContractReportPage />} />
                                            <Route path="warranties" element={<WarrantyReportPage />} />
                                            <Route path="crm" element={<CrmReportPage />} />
                                            <Route path="hr" element={<HrReportPage />} />
                                            <Route path="maintenance" element={<MaintenanceReportPage />} />
                                            <Route path="custom" element={<CustomExportPage />} />
                                        </Route>

                                        <Route path="profile" element={<Profile />} />

                                        {/* Every sidebar screen not yet built lands here
                                            rather than bouncing to the dashboard — the
                                            page names what it will become. */}
                                        <Route path="soon/*" element={<ComingSoon />} />

                                        <Route element={<RequireRole roles={['admin']} />}>
                                            <Route path="users" element={<UserList />} />
                                            <Route path="roles" element={<RolesPage />} />
                                            <Route path="audit" element={<AuditLog />} />
                                            <Route path="settings" element={<Settings />} />
                                        </Route>
                                    </Route>

                                    {/* Notifications and old bookmarks still point at the
                                        unprefixed paths — they cannot know the recipient's
                                        area, so resolve it here at click time. */}
                                    <Route path="tasks/:id" element={<AreaRedirect to="/tasks/:id" />} />
                                    <Route path="tasks" element={<AreaRedirect to="/tasks" />} />
                                </Route>
                            </Route>

                            <Route path="*" element={<AreaFallback />} />
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

/**
 * Anything that fell through, sent to the same path inside the signed-in area.
 *
 * A desktop push carries an unprefixed path — /sales/approvals?quote=5 — because
 * the server cannot know which area the recipient reads in. Landing that on the
 * dashboard loses the thing the notification was about. Already-prefixed paths
 * go home instead, or an unknown one would bounce against itself forever.
 */
function AreaFallback() {
    const { user, loading } = useAuth()
    const { pathname, search } = useLocation()

    if (loading) return <PageLoader />
    if (!user) return <Navigate to="/login" replace />

    const base = areaFor(user.role)
    const inArea = pathname === base || pathname.startsWith(`${base}/`)

    return <Navigate to={inArea || pathname === '/' ? base : `${base}${pathname}${search}`} replace />
}

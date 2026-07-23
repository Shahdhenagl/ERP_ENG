<?php

use App\Http\Controllers\Api\AccountingController;
use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AssetController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\ChequeController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\CustodyController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\FollowUpController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\LeaveController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ItemCategoryController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\ItemSerialController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\PurchaseRequestController;
use App\Http\Controllers\Api\QuotationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SalesOrderController;
use App\Http\Controllers\Api\SalesReturnController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\StatementController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\SupplierInvoiceController;
use App\Http\Controllers\Api\TreasuryController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\PushSubscriptionController;
use App\Http\Controllers\Api\TaskAttachmentController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TaskReportController;
use App\Http\Controllers\Api\TaskStatusController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WarrantyController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public
|--------------------------------------------------------------------------
*/
Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');

/*
|--------------------------------------------------------------------------
| Authenticated — every role
|--------------------------------------------------------------------------
| `role` with no arguments just enforces "logged in and not suspended".
*/
Route::middleware(['auth:sanctum', 'role'])->group(function () {

    // The letterhead appears on documents a technician prints on site, so
    // reading it is not gated — only changing it is.
    Route::get('settings', [SettingController::class, 'index']);

    // ── Session & profile ────────────────────────────────────
    Route::get('me', [AuthController::class, 'me']);
    Route::post('logout', [AuthController::class, 'logout']);
    Route::put('profile', [AuthController::class, 'updateProfile']);
    Route::put('profile/password', [AuthController::class, 'updatePassword']);

    // ── Dashboard ────────────────────────────────────────────
    Route::get('dashboard', DashboardController::class);

    // ── Notifications ────────────────────────────────────────
    Route::get('notifications', [NotificationController::class, 'index']);
    Route::post('notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);

    // ── Web push registration ────────────────────────────────
    Route::post('push-subscriptions', [PushSubscriptionController::class, 'store']);
    Route::delete('push-subscriptions', [PushSubscriptionController::class, 'destroy']);

    // ── Jobs: read, drive forward, report ────────────────────
    // Technicians reach these too; the controllers scope them to their own
    // assignments rather than the route layer.
    Route::get('tasks', [TaskController::class, 'index']);
    Route::get('tasks/{task}', [TaskController::class, 'show']);
    Route::post('tasks/{task}/status', TaskStatusController::class);
    Route::post('tasks/{task}/reports', [TaskReportController::class, 'store']);
    Route::post('tasks/{task}/attachments', [TaskAttachmentController::class, 'store']);
    Route::delete('tasks/{task}/attachments/{attachment}', [TaskAttachmentController::class, 'destroy']);

    // A technician needs the customer card for the job they are standing at.
    Route::get('customers/{customer}', [CustomerController::class, 'show']);

    // Device history for the unit in front of them — the controller refuses
    // assets they have never been dispatched to.
    Route::get('assets/{asset}', [AssetController::class, 'show']);

    // ── Purchase requests ────────────────────────────────────
    // A technician who has just run out is the person who knows, so these
    // are open to every role; the controller scopes the list to their own.
    Route::get('purchase-requests', [PurchaseRequestController::class, 'index']);
    Route::post('purchase-requests', [PurchaseRequestController::class, 'store']);
    Route::get('purchase-requests/{purchaseRequest}', [PurchaseRequestController::class, 'show']);
    Route::put('purchase-requests/{purchaseRequest}', [PurchaseRequestController::class, 'update']);
    Route::delete('purchase-requests/{purchaseRequest}', [PurchaseRequestController::class, 'destroy']);
    Route::post('purchase-requests/{purchaseRequest}/submit', [PurchaseRequestController::class, 'submit']);

    // A technician needs to see what is in their own van to report parts used.
    // A scanner points at this: which unit is this, and where has it been.
    Route::get('serials/lookup', [ItemSerialController::class, 'lookup']);

    Route::get('stock/mine', [StockController::class, 'myStock']);
    Route::get('stock/warehouses', [StockController::class, 'warehouses']);
    Route::get('stock/movements', [StockController::class, 'movements']);
});

/*
|--------------------------------------------------------------------------
| Dispatchers — admin + manager
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'role:admin,manager'])->group(function () {
    Route::post('tasks', [TaskController::class, 'store'])->middleware('can:tasks.dispatch');
    Route::put('tasks/{task}', [TaskController::class, 'update'])->middleware('can:tasks.dispatch');
    Route::delete('tasks/{task}', [TaskController::class, 'destroy'])->middleware('can:tasks.dispatch');
    Route::post('tasks/{task}/assign', [TaskController::class, 'assign'])->middleware('can:tasks.dispatch');

    Route::get('customers/{customer}/statement', StatementController::class)->middleware('can:customers.manage');
    Route::get('customers/{customer}/profile', [CustomerController::class, 'profile'])->middleware('can:customers.manage');

    // ── Customer branches ────────────────────────────────────
    Route::get('branches', [BranchController::class, 'index'])->middleware('can:customers.manage');
    Route::get('customers/{customer}/branches', [BranchController::class, 'forCustomer'])->middleware('can:customers.manage');
    Route::post('customers/{customer}/branches', [BranchController::class, 'store'])->middleware('can:customers.manage');
    Route::get('branches/{branch}', [BranchController::class, 'show'])->middleware('can:customers.manage');
    Route::put('branches/{branch}', [BranchController::class, 'update'])->middleware('can:customers.manage');
    Route::delete('branches/{branch}', [BranchController::class, 'destroy'])->middleware('can:customers.manage');

    Route::get('customers', [CustomerController::class, 'index'])->middleware('can:customers.manage');
    Route::post('customers', [CustomerController::class, 'store'])->middleware('can:customers.manage');
    Route::put('customers/{customer}', [CustomerController::class, 'update'])->middleware('can:customers.manage');
    Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])->middleware('can:customers.manage');

    Route::get('assets', [AssetController::class, 'index'])->middleware('can:assets.manage');
    Route::post('assets', [AssetController::class, 'store'])->middleware('can:assets.manage');
    Route::put('assets/{asset}', [AssetController::class, 'update'])->middleware('can:assets.manage');
    Route::delete('assets/{asset}', [AssetController::class, 'destroy'])->middleware('can:assets.manage');

    Route::get('technicians', [UserController::class, 'technicians']);

    // ── CRM: leads and follow-ups ────────────────────────────
    // The front of the funnel. Winning a lead mints a customer, so the whole
    // module sits behind one permission distinct from customer management.
    Route::get('leads', [LeadController::class, 'index'])->middleware('can:crm.manage');
    Route::post('leads', [LeadController::class, 'store'])->middleware('can:crm.manage');
    Route::get('leads/{lead}', [LeadController::class, 'show'])->middleware('can:crm.manage');
    Route::put('leads/{lead}', [LeadController::class, 'update'])->middleware('can:crm.manage');
    Route::post('leads/{lead}/status', [LeadController::class, 'status'])->middleware('can:crm.manage');
    Route::delete('leads/{lead}', [LeadController::class, 'destroy'])->middleware('can:crm.manage');

    Route::get('follow-ups', [FollowUpController::class, 'index'])->middleware('can:crm.manage');
    Route::post('follow-ups', [FollowUpController::class, 'store'])->middleware('can:crm.manage');
    Route::put('follow-ups/{followUp}', [FollowUpController::class, 'update'])->middleware('can:crm.manage');
    Route::post('follow-ups/{followUp}/complete', [FollowUpController::class, 'complete'])->middleware('can:crm.manage');
    Route::delete('follow-ups/{followUp}', [FollowUpController::class, 'destroy'])->middleware('can:crm.manage');

    // ── Human resources ──────────────────────────────────────
    // Employees and leave under one permission; the money — advances and
    // payroll — under another, because paying salaries is a treasury act.
    Route::apiResource('employees', EmployeeController::class)->middleware('can:hr.manage');

    Route::get('leave', [LeaveController::class, 'index'])->middleware('can:hr.manage');
    Route::post('leave', [LeaveController::class, 'store'])->middleware('can:hr.manage');
    Route::post('leave/{leaveRequest}/decide', [LeaveController::class, 'decide'])->middleware('can:hr.manage');
    Route::post('leave/{leaveRequest}/cancel', [LeaveController::class, 'cancel'])->middleware('can:hr.manage');

    Route::get('advances', [PayrollController::class, 'advances'])->middleware('can:payroll.manage');
    Route::post('advances', [PayrollController::class, 'storeAdvance'])->middleware('can:payroll.manage');

    Route::get('payroll', [PayrollController::class, 'index'])->middleware('can:payroll.manage');
    Route::post('payroll', [PayrollController::class, 'open'])->middleware('can:payroll.manage');
    Route::get('payroll/{payrollRun}', [PayrollController::class, 'show'])->middleware('can:payroll.manage');
    Route::post('payroll/{payrollRun}/approve', [PayrollController::class, 'approve'])->middleware('can:payroll.manage');
    Route::post('payroll/{payrollRun}/pay', [PayrollController::class, 'pay'])->middleware('can:payroll.manage');

    Route::get('payslips/{payslip}', [PayrollController::class, 'slip'])->middleware('can:payroll.manage');
    Route::put('payslips/{payslip}', [PayrollController::class, 'adjustSlip'])->middleware('can:payroll.manage');
    Route::post('payslips/{payslip}/pay', [PayrollController::class, 'paySlip'])->middleware('can:payroll.manage');

    // ── Reports ──────────────────────────────────────────────
    // Read-only views over what the other modules already own. The export is
    // deliberately generic: handing over the rows beats a report builder
    // nobody can verify.
    Route::get('reports/sales', [ReportController::class, 'sales'])->middleware('can:reports.view');
    Route::get('reports/profitability', [ReportController::class, 'profitability'])->middleware('can:reports.view');
    Route::get('reports/stock', [ReportController::class, 'stock'])->middleware('can:reports.view');
    Route::get('reports/custody', [ReportController::class, 'custody'])->middleware('can:reports.view');
    Route::get('reports/contracts', [ReportController::class, 'contracts'])->middleware('can:reports.view');
    Route::get('reports/warranties', [ReportController::class, 'warranties'])->middleware('can:reports.view');
    Route::get('reports/crm', [ReportController::class, 'crm'])->middleware('can:reports.view');
    Route::get('reports/{report}/export', [ReportController::class, 'export'])->middleware('can:reports.view');

    // ── Warranties & claims ──────────────────────────────────
    Route::get('warranties', [WarrantyController::class, 'index'])->middleware('can:warranties.manage');
    Route::post('warranties', [WarrantyController::class, 'store'])->middleware('can:warranties.manage');
    Route::get('warranties/{warranty}', [WarrantyController::class, 'show'])->middleware('can:warranties.manage');
    Route::put('warranties/{warranty}', [WarrantyController::class, 'update'])->middleware('can:warranties.manage');

    // A term only moves by being extended or torn up — never by editing the
    // dates, which would erase what was originally promised.
    Route::post('warranties/{warranty}/extend', [WarrantyController::class, 'extend'])->middleware('can:warranties.manage');
    Route::post('warranties/{warranty}/void', [WarrantyController::class, 'void'])->middleware('can:warranties.manage');

    // «تاريخ الجهاز» — cover, claims and the repair orders they produced.
    Route::get('assets/{asset}/history', [WarrantyController::class, 'history'])->middleware('can:warranties.manage');

    Route::get('warranty-claims', [WarrantyController::class, 'claims'])->middleware('can:warranties.manage');
    Route::post('warranty-claims', [WarrantyController::class, 'storeClaim'])->middleware('can:warranties.manage');
    Route::get('warranty-claims/{claim}', [WarrantyController::class, 'showClaim'])->middleware('can:warranties.manage');
    Route::post('warranty-claims/{claim}/decide', [WarrantyController::class, 'decide'])->middleware('can:warranties.manage');
    Route::post('warranty-claims/{claim}/repair-order', [WarrantyController::class, 'repairOrder'])->middleware('can:warranties.manage');

    // ── Maintenance contracts ────────────────────────────────
    Route::get('contracts', [ContractController::class, 'index'])->middleware('can:contracts.manage');
    Route::post('contracts', [ContractController::class, 'store'])->middleware('can:contracts.manage');
    Route::get('contracts/{contract}', [ContractController::class, 'show'])->middleware('can:contracts.manage');
    Route::put('contracts/{contract}', [ContractController::class, 'update'])->middleware('can:contracts.manage');
    Route::delete('contracts/{contract}', [ContractController::class, 'destroy'])->middleware('can:contracts.manage');

    // Lifecycle is explicit rather than a status field anyone can PUT: each of
    // these rebuilds or tears down the visit plan behind it.
    Route::post('contracts/{contract}/activate', [ContractController::class, 'activate'])->middleware('can:contracts.manage');
    Route::post('contracts/{contract}/renew', [ContractController::class, 'renew'])->middleware('can:contracts.manage');
    Route::post('contracts/{contract}/cancel', [ContractController::class, 'cancel'])->middleware('can:contracts.manage');
    Route::post('contracts/{contract}/materialise', [ContractController::class, 'materialise'])->middleware('can:contracts.manage');

    // ── Inventory ────────────────────────────────────────────
    Route::apiResource('items', ItemController::class)->middleware('can:inventory.view');
    Route::apiResource('item-categories', ItemCategoryController::class)->except(['show']);
    Route::get('items/{item}/serials', [ItemSerialController::class, 'index'])->middleware('can:inventory.manage');
    Route::post('serials/{serial}/scrap', [ItemSerialController::class, 'scrap'])->middleware('can:inventory.manage');

    // ── Stores ───────────────────────────────────────────────
    Route::post('warehouses', [StockController::class, 'storeWarehouse'])->middleware('can:inventory.manage');
    Route::put('warehouses/{warehouse}', [StockController::class, 'updateWarehouse'])->middleware('can:inventory.manage');
    Route::delete('warehouses/{warehouse}', [StockController::class, 'destroyWarehouse'])->middleware('can:inventory.manage');

    // ── Custody: stock, money and devices ────────────────────
    Route::get('custody', [CustodyController::class, 'index'])->middleware('can:inventory.manage');
    Route::get('custody/devices', [CustodyController::class, 'devices'])->middleware('can:inventory.manage');
    Route::get('custody/{user}', [CustodyController::class, 'show'])->middleware('can:inventory.manage');
    Route::post('custody/cash', [CustodyController::class, 'cash'])->middleware('can:inventory.manage');
    Route::post('custody/spend', [CustodyController::class, 'spend'])->middleware('can:inventory.manage');
    Route::post('custody/devices', [CustodyController::class, 'takeDevice'])->middleware('can:inventory.manage');
    Route::post('custody/devices/{custody}/return', [CustodyController::class, 'returnDevice'])->middleware('can:inventory.manage');

    Route::get('stock/summary', [StockController::class, 'summary'])->middleware('can:inventory.manage');
    Route::post('stock/receive', [StockController::class, 'receive'])->middleware('can:inventory.manage');
    Route::post('stock/transfer', [StockController::class, 'transfer'])->middleware('can:inventory.manage');
    Route::post('stock/adjust', [StockController::class, 'adjust'])->middleware('can:inventory.manage');

    // ── Purchasing ───────────────────────────────────────────
    Route::get('suppliers', [SupplierController::class, 'index'])->middleware('can:purchasing.manage');
    Route::post('suppliers', [SupplierController::class, 'store'])->middleware('can:purchasing.manage');
    Route::get('suppliers/{supplier}', [SupplierController::class, 'show'])->middleware('can:purchasing.manage');
    Route::put('suppliers/{supplier}', [SupplierController::class, 'update'])->middleware('can:purchasing.manage');
    Route::delete('suppliers/{supplier}', [SupplierController::class, 'destroy'])->middleware('can:purchasing.manage');

    Route::post('supplier-payments', [SupplierController::class, 'pay'])->middleware('can:purchasing.manage');
    Route::get('supplier-payments/{payment}', [SupplierController::class, 'showPayment'])->middleware('can:purchasing.manage');
    Route::delete('supplier-payments/{payment}', [SupplierController::class, 'reversePayment'])->middleware('can:purchasing.manage');

    // ── Supplier bills & purchase returns ────────────────────
    // The bill covers deliveries that are already in the payable, so these
    // two sit next to the receipts they account for rather than under sales.
    Route::get('supplier-invoices', [SupplierInvoiceController::class, 'index'])->middleware('can:purchasing.manage');
    Route::post('supplier-invoices', [SupplierInvoiceController::class, 'store'])->middleware('can:purchasing.manage');
    Route::get('supplier-invoices/{supplierInvoice}', [SupplierInvoiceController::class, 'show'])->middleware('can:purchasing.manage');
    Route::put('supplier-invoices/{supplierInvoice}', [SupplierInvoiceController::class, 'update'])->middleware('can:purchasing.manage');
    Route::delete('supplier-invoices/{supplierInvoice}', [SupplierInvoiceController::class, 'destroy'])->middleware('can:purchasing.manage');
    Route::post('supplier-invoices/{supplierInvoice}/post', [SupplierInvoiceController::class, 'post'])->middleware('can:purchasing.manage');
    Route::post('supplier-invoices/{supplierInvoice}/void', [SupplierInvoiceController::class, 'void'])->middleware('can:purchasing.manage');

    Route::get('suppliers/{supplier}/uninvoiced', [SupplierInvoiceController::class, 'uninvoicedReceipts'])->middleware('can:purchasing.manage');
    Route::get('suppliers/{supplier}/statement', [SupplierInvoiceController::class, 'statement'])->middleware('can:purchasing.manage');

    Route::get('purchase-returns', [SupplierInvoiceController::class, 'returns'])->middleware('can:purchasing.manage');
    Route::post('purchase-returns', [SupplierInvoiceController::class, 'storeReturn'])->middleware('can:purchasing.manage');
    Route::post('purchase-returns/{purchaseReturn}/post', [SupplierInvoiceController::class, 'postReturn'])->middleware('can:purchasing.manage');
    Route::delete('purchase-returns/{purchaseReturn}', [SupplierInvoiceController::class, 'destroyReturn'])->middleware('can:purchasing.manage');

    Route::post('purchase-requests/{purchaseRequest}/decide', [PurchaseRequestController::class, 'decide'])->middleware('can:requests.decide');
    Route::post('purchase-requests/{purchaseRequest}/order', [PurchaseRequestController::class, 'toOrder'])->middleware('can:requests.decide');

    Route::get('purchase-orders', [PurchaseOrderController::class, 'index'])->middleware('can:purchasing.manage');
    Route::post('purchase-orders', [PurchaseOrderController::class, 'store'])->middleware('can:purchasing.manage');
    Route::get('purchase-orders/{order}', [PurchaseOrderController::class, 'show'])->middleware('can:purchasing.manage');
    Route::put('purchase-orders/{order}', [PurchaseOrderController::class, 'update'])->middleware('can:purchasing.manage');
    Route::delete('purchase-orders/{order}', [PurchaseOrderController::class, 'destroy'])->middleware('can:purchasing.manage');
    Route::post('purchase-orders/{order}/send', [PurchaseOrderController::class, 'send'])->middleware('can:purchasing.manage');
    Route::post('purchase-orders/{order}/cancel', [PurchaseOrderController::class, 'cancel'])->middleware('can:purchasing.manage');
    Route::post('purchase-orders/{order}/receive', [PurchaseOrderController::class, 'receive'])->middleware('can:purchasing.manage');

    // ── Quotations & sales orders ────────────────────────────
    Route::get('quotations', [QuotationController::class, 'index'])->middleware('can:sales.manage');
    Route::post('quotations', [QuotationController::class, 'store'])->middleware('can:sales.manage');
    Route::get('quotations/{quotation}', [QuotationController::class, 'show'])->middleware('can:sales.manage');
    Route::put('quotations/{quotation}', [QuotationController::class, 'update'])->middleware('can:sales.manage');
    Route::delete('quotations/{quotation}', [QuotationController::class, 'destroy'])->middleware('can:sales.manage');
    Route::post('quotations/{quotation}/send', [QuotationController::class, 'send'])->middleware('can:sales.manage');
    Route::post('quotations/{quotation}/accept', [QuotationController::class, 'accept'])->middleware('can:sales.manage');
    Route::post('quotations/{quotation}/reject', [QuotationController::class, 'reject'])->middleware('can:sales.manage');
    Route::post('quotations/{quotation}/cancel', [QuotationController::class, 'cancel'])->middleware('can:sales.manage');

    Route::get('sales-orders', [SalesOrderController::class, 'index'])->middleware('can:sales.manage');
    Route::post('sales-orders', [SalesOrderController::class, 'store'])->middleware('can:sales.manage');
    Route::get('sales-orders/{salesOrder}', [SalesOrderController::class, 'show'])->middleware('can:sales.manage');
    Route::post('sales-orders/{salesOrder}/deliver', [SalesOrderController::class, 'deliver'])->middleware('can:sales.manage');
    Route::post('sales-orders/{salesOrder}/cancel', [SalesOrderController::class, 'cancel'])->middleware('can:sales.manage');
    Route::post('sales-orders/{salesOrder}/invoice', [SalesOrderController::class, 'invoice'])->middleware('can:sales.manage');

    // ── Receivables & treasury ───────────────────────────────
    // Kept with the dispatchers: in a company this size the office manager
    // raises the invoice and takes the money.
    Route::get('invoices', [InvoiceController::class, 'index'])->middleware('can:invoices.manage');
    Route::post('invoices', [InvoiceController::class, 'store'])->middleware('can:invoices.manage');
    Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->middleware('can:invoices.manage');
    Route::put('invoices/{invoice}', [InvoiceController::class, 'update'])->middleware('can:invoices.manage');
    Route::delete('invoices/{invoice}', [InvoiceController::class, 'destroy'])->middleware('can:invoices.manage');
    Route::post('invoices/{invoice}/issue', [InvoiceController::class, 'issue'])->middleware('can:invoices.manage');
    Route::post('invoices/{invoice}/void', [InvoiceController::class, 'void'])->middleware('can:invoices.manage');
    Route::post('tasks/{task}/invoice', [InvoiceController::class, 'fromTask'])->middleware('can:invoices.manage');

    // ── Sales returns (credit notes) ─────────────────────────
    // Always raised against the invoice they reverse, which is what makes
    // 'more back than went out' a question with an answer.
    Route::get('sales-returns', [SalesReturnController::class, 'index'])->middleware('can:sales.manage');
    Route::post('sales-returns', [SalesReturnController::class, 'store'])->middleware('can:sales.manage');
    Route::get('sales-returns/{salesReturn}', [SalesReturnController::class, 'show'])->middleware('can:sales.manage');
    Route::put('sales-returns/{salesReturn}', [SalesReturnController::class, 'update'])->middleware('can:sales.manage');
    Route::delete('sales-returns/{salesReturn}', [SalesReturnController::class, 'destroy'])->middleware('can:sales.manage');
    Route::post('sales-returns/{salesReturn}/post', [SalesReturnController::class, 'post'])->middleware('can:sales.manage');
    Route::get('invoices/{invoice}/returnable', [SalesReturnController::class, 'returnable'])->middleware('can:sales.manage');

    // ── Cheques & bank reconciliation ────────────────────────
    // A cheque is a promise, not money: nothing here touches the treasury
    // until it clears, and clearing goes through the ordinary receipt and
    // voucher paths.
    Route::get('cheques', [ChequeController::class, 'index'])->middleware('can:cheques.manage');
    Route::post('cheques', [ChequeController::class, 'store'])->middleware('can:cheques.manage');
    Route::get('cheques/{cheque}', [ChequeController::class, 'show'])->middleware('can:cheques.manage');
    Route::post('cheques/{cheque}/transition', [ChequeController::class, 'transition'])->middleware('can:cheques.manage');

    Route::get('treasury/boxes/{box}/reconciliation', [ChequeController::class, 'reconciliation'])->middleware('can:cheques.manage');
    Route::post('treasury/reconcile', [ChequeController::class, 'reconcile'])->middleware('can:cheques.manage');

    Route::get('treasury/summary', [TreasuryController::class, 'summary'])->middleware('can:treasury.manage');
    Route::get('treasury/boxes', [TreasuryController::class, 'boxes'])->middleware('can:treasury.manage');
    Route::get('treasury/boxes/{box}/statement', [TreasuryController::class, 'statement'])->middleware('can:treasury.manage');
    Route::post('treasury/boxes', [TreasuryController::class, 'storeBox'])->middleware('can:treasury.manage');
    Route::get('treasury/movements', [TreasuryController::class, 'movements'])->middleware('can:treasury.manage');
    Route::post('treasury/expense', [TreasuryController::class, 'expense'])->middleware('can:treasury.manage');
    Route::post('treasury/transfer', [TreasuryController::class, 'transfer'])->middleware('can:treasury.manage');

    Route::get('payments', [TreasuryController::class, 'payments'])->middleware('can:treasury.manage');
    Route::post('payments', [TreasuryController::class, 'receive'])->middleware('can:treasury.manage');
    Route::delete('payments/{payment}', [TreasuryController::class, 'reverse'])->middleware('can:treasury.manage');

    /*
    | Accounting — reading
    |
    | The statements are what the office manager checks the month against, so
    | they sit with the dispatchers. Everything that changes the chart or writes
    | the journal by hand is admin-only, below.
    */
    Route::prefix('accounting')->group(function () {
        Route::get('summary', [AccountingController::class, 'summary'])->middleware('can:accounting.view');
        Route::get('accounts', [AccountingController::class, 'accounts'])->middleware('can:accounting.view');
        Route::get('accounts/{account}/ledger', [AccountingController::class, 'ledgerFor'])->middleware('can:accounting.view');
        Route::get('cost-centers', [AccountingController::class, 'costCenters'])->middleware('can:accounting.view');

        Route::get('entries', [AccountingController::class, 'entries'])->middleware('can:accounting.view');
        Route::get('entries/{entry}', [AccountingController::class, 'entry'])->middleware('can:accounting.view');

        Route::get('trial-balance', [AccountingController::class, 'trialBalance'])->middleware('can:accounting.view');
        Route::get('income-statement', [AccountingController::class, 'incomeStatement'])->middleware('can:accounting.view');
        Route::get('balance-sheet', [AccountingController::class, 'balanceSheet'])->middleware('can:accounting.view');
    });
});

/*
|--------------------------------------------------------------------------
| System administration — admin only
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'role:admin'])->group(function () {
    // ── Audit trail ──────────────────────────────────────────
    // Read-only by design. There is no write endpoint and no delete: a log
    // anyone can add to or remove from answers nothing.
    Route::get('activity', [ActivityLogController::class, 'index'])->middleware('can:audit.view');
    Route::get('activity/filters', [ActivityLogController::class, 'filters'])->middleware('can:audit.view');

    Route::put('settings', [SettingController::class, 'update'])->middleware('can:settings.manage');
    Route::apiResource('users', UserController::class)->middleware('can:users.manage');

    // ── Permissions ──────────────────────────────────────────
    // The catalogue lives in code; only the departures from a role are
    // stored, and only an admin may set them.
    Route::get('permissions', [PermissionController::class, 'index'])->middleware('can:users.manage');
    Route::get('users/{user}/permissions', [PermissionController::class, 'show'])->middleware('can:users.manage');
    Route::put('users/{user}/permissions', [PermissionController::class, 'update'])->middleware('can:users.manage');

    /*
    | Accounting — writing
    |
    | The chart is the shape every report is read through, and a hand-written
    | entry is the one way into the journal that no document vouches for.
    | Both belong with whoever answers for the books.
    */
    Route::prefix('accounting')->group(function () {
        Route::post('accounts', [AccountingController::class, 'storeAccount'])->middleware('can:accounting.manage');
        Route::put('accounts/{account}', [AccountingController::class, 'updateAccount'])->middleware('can:accounting.manage');
        Route::delete('accounts/{account}', [AccountingController::class, 'destroyAccount'])->middleware('can:accounting.manage');

        Route::post('cost-centers', [AccountingController::class, 'storeCostCenter'])->middleware('can:accounting.manage');
        Route::put('cost-centers/{costCenter}', [AccountingController::class, 'updateCostCenter'])->middleware('can:accounting.manage');
        Route::delete('cost-centers/{costCenter}', [AccountingController::class, 'destroyCostCenter'])->middleware('can:accounting.manage');

        Route::post('entries', [AccountingController::class, 'storeEntry'])->middleware('can:accounting.manage');
        Route::post('entries/{entry}/reverse', [AccountingController::class, 'reverseEntry'])->middleware('can:accounting.manage');
        Route::delete('entries/{entry}', [AccountingController::class, 'destroyEntry'])->middleware('can:accounting.manage');

        // Catches up documents written before the ledger existed, and any a
        // swallowed posting failure left behind.
        Route::post('post', [AccountingController::class, 'post'])->middleware('can:accounting.manage');
    });
});

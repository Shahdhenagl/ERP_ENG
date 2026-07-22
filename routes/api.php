<?php

use App\Http\Controllers\Api\AccountingController;
use App\Http\Controllers\Api\AssetController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\CustodyController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\QuotationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SalesOrderController;
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

    // A technician needs to see what is in their own van to report parts used.
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
    Route::post('tasks', [TaskController::class, 'store']);
    Route::put('tasks/{task}', [TaskController::class, 'update']);
    Route::delete('tasks/{task}', [TaskController::class, 'destroy']);
    Route::post('tasks/{task}/assign', [TaskController::class, 'assign']);

    Route::get('customers/{customer}/statement', StatementController::class);

    // ── Customer branches ────────────────────────────────────
    Route::get('branches', [BranchController::class, 'index']);
    Route::get('customers/{customer}/branches', [BranchController::class, 'forCustomer']);
    Route::post('customers/{customer}/branches', [BranchController::class, 'store']);
    Route::get('branches/{branch}', [BranchController::class, 'show']);
    Route::put('branches/{branch}', [BranchController::class, 'update']);
    Route::delete('branches/{branch}', [BranchController::class, 'destroy']);

    Route::get('customers', [CustomerController::class, 'index']);
    Route::post('customers', [CustomerController::class, 'store']);
    Route::put('customers/{customer}', [CustomerController::class, 'update']);
    Route::delete('customers/{customer}', [CustomerController::class, 'destroy']);

    Route::get('assets', [AssetController::class, 'index']);
    Route::post('assets', [AssetController::class, 'store']);
    Route::put('assets/{asset}', [AssetController::class, 'update']);
    Route::delete('assets/{asset}', [AssetController::class, 'destroy']);

    Route::get('technicians', [UserController::class, 'technicians']);

    // ── Reports ──────────────────────────────────────────────
    // Read-only views over what the other modules already own. The export is
    // deliberately generic: handing over the rows beats a report builder
    // nobody can verify.
    Route::get('reports/sales', [ReportController::class, 'sales']);
    Route::get('reports/profitability', [ReportController::class, 'profitability']);
    Route::get('reports/stock', [ReportController::class, 'stock']);
    Route::get('reports/custody', [ReportController::class, 'custody']);
    Route::get('reports/contracts', [ReportController::class, 'contracts']);
    Route::get('reports/warranties', [ReportController::class, 'warranties']);
    Route::get('reports/{report}/export', [ReportController::class, 'export']);

    // ── Warranties & claims ──────────────────────────────────
    Route::get('warranties', [WarrantyController::class, 'index']);
    Route::post('warranties', [WarrantyController::class, 'store']);
    Route::get('warranties/{warranty}', [WarrantyController::class, 'show']);
    Route::put('warranties/{warranty}', [WarrantyController::class, 'update']);

    // A term only moves by being extended or torn up — never by editing the
    // dates, which would erase what was originally promised.
    Route::post('warranties/{warranty}/extend', [WarrantyController::class, 'extend']);
    Route::post('warranties/{warranty}/void', [WarrantyController::class, 'void']);

    // «تاريخ الجهاز» — cover, claims and the repair orders they produced.
    Route::get('assets/{asset}/history', [WarrantyController::class, 'history']);

    Route::get('warranty-claims', [WarrantyController::class, 'claims']);
    Route::post('warranty-claims', [WarrantyController::class, 'storeClaim']);
    Route::get('warranty-claims/{claim}', [WarrantyController::class, 'showClaim']);
    Route::post('warranty-claims/{claim}/decide', [WarrantyController::class, 'decide']);
    Route::post('warranty-claims/{claim}/repair-order', [WarrantyController::class, 'repairOrder']);

    // ── Maintenance contracts ────────────────────────────────
    Route::get('contracts', [ContractController::class, 'index']);
    Route::post('contracts', [ContractController::class, 'store']);
    Route::get('contracts/{contract}', [ContractController::class, 'show']);
    Route::put('contracts/{contract}', [ContractController::class, 'update']);
    Route::delete('contracts/{contract}', [ContractController::class, 'destroy']);

    // Lifecycle is explicit rather than a status field anyone can PUT: each of
    // these rebuilds or tears down the visit plan behind it.
    Route::post('contracts/{contract}/activate', [ContractController::class, 'activate']);
    Route::post('contracts/{contract}/cancel', [ContractController::class, 'cancel']);
    Route::post('contracts/{contract}/materialise', [ContractController::class, 'materialise']);

    // ── Inventory ────────────────────────────────────────────
    Route::apiResource('items', ItemController::class);

    // ── Stores ───────────────────────────────────────────────
    Route::post('warehouses', [StockController::class, 'storeWarehouse']);
    Route::put('warehouses/{warehouse}', [StockController::class, 'updateWarehouse']);
    Route::delete('warehouses/{warehouse}', [StockController::class, 'destroyWarehouse']);

    // ── Custody: stock, money and devices ────────────────────
    Route::get('custody', [CustodyController::class, 'index']);
    Route::get('custody/devices', [CustodyController::class, 'devices']);
    Route::get('custody/{user}', [CustodyController::class, 'show']);
    Route::post('custody/cash', [CustodyController::class, 'cash']);
    Route::post('custody/spend', [CustodyController::class, 'spend']);
    Route::post('custody/devices', [CustodyController::class, 'takeDevice']);
    Route::post('custody/devices/{custody}/return', [CustodyController::class, 'returnDevice']);

    Route::get('stock/summary', [StockController::class, 'summary']);
    Route::post('stock/receive', [StockController::class, 'receive']);
    Route::post('stock/transfer', [StockController::class, 'transfer']);
    Route::post('stock/adjust', [StockController::class, 'adjust']);

    // ── Purchasing ───────────────────────────────────────────
    Route::get('suppliers', [SupplierController::class, 'index']);
    Route::post('suppliers', [SupplierController::class, 'store']);
    Route::get('suppliers/{supplier}', [SupplierController::class, 'show']);
    Route::put('suppliers/{supplier}', [SupplierController::class, 'update']);
    Route::delete('suppliers/{supplier}', [SupplierController::class, 'destroy']);

    Route::post('supplier-payments', [SupplierController::class, 'pay']);
    Route::delete('supplier-payments/{payment}', [SupplierController::class, 'reversePayment']);

    // ── Supplier bills & purchase returns ────────────────────
    // The bill covers deliveries that are already in the payable, so these
    // two sit next to the receipts they account for rather than under sales.
    Route::get('supplier-invoices', [SupplierInvoiceController::class, 'index']);
    Route::post('supplier-invoices', [SupplierInvoiceController::class, 'store']);
    Route::get('supplier-invoices/{supplierInvoice}', [SupplierInvoiceController::class, 'show']);
    Route::put('supplier-invoices/{supplierInvoice}', [SupplierInvoiceController::class, 'update']);
    Route::delete('supplier-invoices/{supplierInvoice}', [SupplierInvoiceController::class, 'destroy']);
    Route::post('supplier-invoices/{supplierInvoice}/post', [SupplierInvoiceController::class, 'post']);
    Route::post('supplier-invoices/{supplierInvoice}/void', [SupplierInvoiceController::class, 'void']);

    Route::get('suppliers/{supplier}/uninvoiced', [SupplierInvoiceController::class, 'uninvoicedReceipts']);
    Route::get('suppliers/{supplier}/statement', [SupplierInvoiceController::class, 'statement']);

    Route::get('purchase-returns', [SupplierInvoiceController::class, 'returns']);
    Route::post('purchase-returns', [SupplierInvoiceController::class, 'storeReturn']);
    Route::post('purchase-returns/{purchaseReturn}/post', [SupplierInvoiceController::class, 'postReturn']);
    Route::delete('purchase-returns/{purchaseReturn}', [SupplierInvoiceController::class, 'destroyReturn']);

    Route::get('purchase-orders', [PurchaseOrderController::class, 'index']);
    Route::post('purchase-orders', [PurchaseOrderController::class, 'store']);
    Route::get('purchase-orders/{order}', [PurchaseOrderController::class, 'show']);
    Route::put('purchase-orders/{order}', [PurchaseOrderController::class, 'update']);
    Route::delete('purchase-orders/{order}', [PurchaseOrderController::class, 'destroy']);
    Route::post('purchase-orders/{order}/send', [PurchaseOrderController::class, 'send']);
    Route::post('purchase-orders/{order}/cancel', [PurchaseOrderController::class, 'cancel']);
    Route::post('purchase-orders/{order}/receive', [PurchaseOrderController::class, 'receive']);

    // ── Quotations & sales orders ────────────────────────────
    Route::get('quotations', [QuotationController::class, 'index']);
    Route::post('quotations', [QuotationController::class, 'store']);
    Route::get('quotations/{quotation}', [QuotationController::class, 'show']);
    Route::put('quotations/{quotation}', [QuotationController::class, 'update']);
    Route::delete('quotations/{quotation}', [QuotationController::class, 'destroy']);
    Route::post('quotations/{quotation}/send', [QuotationController::class, 'send']);
    Route::post('quotations/{quotation}/accept', [QuotationController::class, 'accept']);
    Route::post('quotations/{quotation}/reject', [QuotationController::class, 'reject']);
    Route::post('quotations/{quotation}/cancel', [QuotationController::class, 'cancel']);

    Route::get('sales-orders', [SalesOrderController::class, 'index']);
    Route::post('sales-orders', [SalesOrderController::class, 'store']);
    Route::get('sales-orders/{salesOrder}', [SalesOrderController::class, 'show']);
    Route::post('sales-orders/{salesOrder}/deliver', [SalesOrderController::class, 'deliver']);
    Route::post('sales-orders/{salesOrder}/cancel', [SalesOrderController::class, 'cancel']);
    Route::post('sales-orders/{salesOrder}/invoice', [SalesOrderController::class, 'invoice']);

    // ── Receivables & treasury ───────────────────────────────
    // Kept with the dispatchers: in a company this size the office manager
    // raises the invoice and takes the money.
    Route::get('invoices', [InvoiceController::class, 'index']);
    Route::post('invoices', [InvoiceController::class, 'store']);
    Route::get('invoices/{invoice}', [InvoiceController::class, 'show']);
    Route::put('invoices/{invoice}', [InvoiceController::class, 'update']);
    Route::delete('invoices/{invoice}', [InvoiceController::class, 'destroy']);
    Route::post('invoices/{invoice}/issue', [InvoiceController::class, 'issue']);
    Route::post('invoices/{invoice}/void', [InvoiceController::class, 'void']);
    Route::post('tasks/{task}/invoice', [InvoiceController::class, 'fromTask']);

    Route::get('treasury/summary', [TreasuryController::class, 'summary']);
    Route::get('treasury/boxes', [TreasuryController::class, 'boxes']);
    Route::get('treasury/boxes/{box}/statement', [TreasuryController::class, 'statement']);
    Route::post('treasury/boxes', [TreasuryController::class, 'storeBox']);
    Route::get('treasury/movements', [TreasuryController::class, 'movements']);
    Route::post('treasury/expense', [TreasuryController::class, 'expense']);
    Route::post('treasury/transfer', [TreasuryController::class, 'transfer']);

    Route::get('payments', [TreasuryController::class, 'payments']);
    Route::post('payments', [TreasuryController::class, 'receive']);
    Route::delete('payments/{payment}', [TreasuryController::class, 'reverse']);

    /*
    | Accounting — reading
    |
    | The statements are what the office manager checks the month against, so
    | they sit with the dispatchers. Everything that changes the chart or writes
    | the journal by hand is admin-only, below.
    */
    Route::prefix('accounting')->group(function () {
        Route::get('summary', [AccountingController::class, 'summary']);
        Route::get('accounts', [AccountingController::class, 'accounts']);
        Route::get('accounts/{account}/ledger', [AccountingController::class, 'ledgerFor']);
        Route::get('cost-centers', [AccountingController::class, 'costCenters']);

        Route::get('entries', [AccountingController::class, 'entries']);
        Route::get('entries/{entry}', [AccountingController::class, 'entry']);

        Route::get('trial-balance', [AccountingController::class, 'trialBalance']);
        Route::get('income-statement', [AccountingController::class, 'incomeStatement']);
        Route::get('balance-sheet', [AccountingController::class, 'balanceSheet']);
    });
});

/*
|--------------------------------------------------------------------------
| System administration — admin only
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'role:admin'])->group(function () {
    Route::put('settings', [SettingController::class, 'update']);
    Route::apiResource('users', UserController::class);

    /*
    | Accounting — writing
    |
    | The chart is the shape every report is read through, and a hand-written
    | entry is the one way into the journal that no document vouches for.
    | Both belong with whoever answers for the books.
    */
    Route::prefix('accounting')->group(function () {
        Route::post('accounts', [AccountingController::class, 'storeAccount']);
        Route::put('accounts/{account}', [AccountingController::class, 'updateAccount']);
        Route::delete('accounts/{account}', [AccountingController::class, 'destroyAccount']);

        Route::post('cost-centers', [AccountingController::class, 'storeCostCenter']);
        Route::put('cost-centers/{costCenter}', [AccountingController::class, 'updateCostCenter']);
        Route::delete('cost-centers/{costCenter}', [AccountingController::class, 'destroyCostCenter']);

        Route::post('entries', [AccountingController::class, 'storeEntry']);
        Route::post('entries/{entry}/reverse', [AccountingController::class, 'reverseEntry']);
        Route::delete('entries/{entry}', [AccountingController::class, 'destroyEntry']);

        // Catches up documents written before the ledger existed, and any a
        // swallowed posting failure left behind.
        Route::post('post', [AccountingController::class, 'post']);
    });
});

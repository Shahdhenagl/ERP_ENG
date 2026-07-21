<?php

use App\Http\Controllers\Api\AssetController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\QuotationController;
use App\Http\Controllers\Api\SalesOrderController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\TreasuryController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\PushSubscriptionController;
use App\Http\Controllers\Api\TaskAttachmentController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TaskReportController;
use App\Http\Controllers\Api\TaskStatusController;
use App\Http\Controllers\Api\UserController;
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

    Route::get('customers', [CustomerController::class, 'index']);
    Route::post('customers', [CustomerController::class, 'store']);
    Route::put('customers/{customer}', [CustomerController::class, 'update']);
    Route::delete('customers/{customer}', [CustomerController::class, 'destroy']);

    Route::get('assets', [AssetController::class, 'index']);
    Route::post('assets', [AssetController::class, 'store']);
    Route::put('assets/{asset}', [AssetController::class, 'update']);
    Route::delete('assets/{asset}', [AssetController::class, 'destroy']);

    Route::get('technicians', [UserController::class, 'technicians']);

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
    Route::post('treasury/boxes', [TreasuryController::class, 'storeBox']);
    Route::get('treasury/movements', [TreasuryController::class, 'movements']);
    Route::post('treasury/expense', [TreasuryController::class, 'expense']);
    Route::post('treasury/transfer', [TreasuryController::class, 'transfer']);

    Route::get('payments', [TreasuryController::class, 'payments']);
    Route::post('payments', [TreasuryController::class, 'receive']);
    Route::delete('payments/{payment}', [TreasuryController::class, 'reverse']);
});

/*
|--------------------------------------------------------------------------
| System administration — admin only
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'role:admin'])->group(function () {
    Route::apiResource('users', UserController::class);
});

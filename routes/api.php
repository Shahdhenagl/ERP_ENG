<?php

use App\Http\Controllers\Api\AssetController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\NotificationController;
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
});

/*
|--------------------------------------------------------------------------
| System administration — admin only
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'role:admin'])->group(function () {
    Route::apiResource('users', UserController::class);
});

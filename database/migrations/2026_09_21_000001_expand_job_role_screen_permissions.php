<?php

use App\Services\PermissionRegistry;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Give existing job-role presets the new screen permissions corresponding to
 * the business permissions they already had. This preserves today's menus on
 * deployment; administrators can then remove individual screens deliberately.
 */
return new class extends Migration
{
    /** @var array<string, array<int, string>> */
    private const SCREENS_FOR_PERMISSION = [
        'tasks.dispatch' => ['screen.service.tasks', 'screen.service.technicians', 'screen.service.satisfaction'],
        'customers.manage' => ['screen.customers', 'screen.contacts', 'screen.customer-ledger'],
        'crm.manage' => ['screen.crm', 'screen.followups', 'screen.site-surveys'],
        'assets.manage' => ['screen.assets', 'screen.service.batteries'],
        'contracts.manage' => ['screen.contracts', 'screen.contracts.renewals', 'screen.contracts.history', 'screen.service.ppm'],
        'warranties.manage' => ['screen.warranties.register', 'screen.warranties.certificate', 'screen.warranties.claims', 'screen.warranties.repairs', 'screen.warranties.lifecycle'],
        'inventory.view' => ['screen.inventory.items', 'screen.inventory.warehouses', 'screen.inventory.receiving'],
        'inventory.manage' => ['screen.inventory.groups', 'screen.inventory.issue', 'screen.inventory.transfers', 'screen.inventory.stocktake', 'screen.service.parts', 'screen.custody.create', 'screen.custody.settle', 'screen.custody.statement'],
        'purchasing.manage' => ['screen.purchasing.suppliers', 'screen.purchasing.requests', 'screen.purchasing.quotes', 'screen.purchasing.orders', 'screen.purchasing.receiving', 'screen.purchasing.invoices', 'screen.purchasing.returns', 'screen.purchasing.statement'],
        'sales.manage' => ['screen.sales.quotations', 'screen.sales.orders', 'screen.sales.deliveries', 'screen.sales.returns', 'screen.sales.statement', 'screen.sales.tenders'],
        'sales.approve' => ['screen.sales.approvals'],
        'invoices.manage' => ['screen.sales.invoices'],
        'treasury.manage' => ['screen.sales.collections', 'screen.treasury.boxes', 'screen.treasury.payments', 'screen.treasury.operations', 'screen.treasury.daybook', 'screen.banks.accounts', 'screen.banks.transfers'],
        'cheques.manage' => ['screen.banks.incoming-cheques', 'screen.banks.outgoing-cheques', 'screen.banks.reconcile'],
        'hr.manage' => ['screen.service.monthly-reports', 'screen.hr.employees', 'screen.hr.attendance', 'screen.hr.leave'],
        'payroll.manage' => ['screen.hr.advances', 'screen.hr.adjustments', 'screen.hr.payroll'],
        'accounting.view' => ['screen.accounting.accounts', 'screen.accounting.journal', 'screen.accounting.ledger', 'screen.accounting.trial-balance', 'screen.accounting.income-statement', 'screen.accounting.balance-sheet', 'screen.accounting.cost-centers'],
        'users.manage' => ['screen.admin.users', 'screen.admin.roles'],
        'audit.view' => ['screen.admin.audit'],
        'settings.manage' => ['screen.admin.settings'],
        'reports.view' => ['screen.reports.sales', 'screen.reports.profit', 'screen.reports.stock', 'screen.reports.custody', 'screen.reports.contracts', 'screen.reports.warranties', 'screen.reports.crm', 'screen.reports.hr', 'screen.reports.maintenance', 'screen.reports.periodic', 'screen.reports.task-movements', 'screen.reports.custom'],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('job_roles')) {
            return;
        }

        DB::table('job_roles')->orderBy('id')->each(function (object $role): void {
            $permissions = json_decode($role->permissions, true) ?: [];

            if ($role->base_role === 'admin') {
                $permissions = PermissionRegistry::keys();
            } else {
                // Every office account keeps its landing page and notification centre.
                $permissions = [...$permissions, 'screen.dashboard', 'screen.notifications'];

                foreach (self::SCREENS_FOR_PERMISSION as $business => $screens) {
                    if (in_array($business, $permissions, true)) {
                        $permissions = [...$permissions, ...$screens];
                    }
                }
            }

            DB::table('job_roles')->where('id', $role->id)->update([
                'permissions' => json_encode(array_values(array_unique($permissions))),
                'updated_at' => now(),
            ]);
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('job_roles')) {
            return;
        }

        DB::table('job_roles')->orderBy('id')->each(function (object $role): void {
            $permissions = array_values(array_filter(
                json_decode($role->permissions, true) ?: [],
                fn (string $permission): bool => ! str_starts_with($permission, 'screen.'),
            ));

            DB::table('job_roles')->where('id', $role->id)->update([
                'permissions' => json_encode($permissions),
                'updated_at' => now(),
            ]);
        });
    }
};

<?php

use App\Services\PermissionRegistry;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Job roles become records instead of a class constant.
 *
 * The permissions themselves stay in code — a permission is only real if a
 * route checks it, so a row nobody checks would be a promise the system does
 * not keep. But which *bundle* of them a job carries is a question about how
 * this company is organised, not about the software, and the answer changes
 * without a release: a new department, a duty moved from one desk to another.
 * That belongs in a table an administrator owns.
 *
 * `key` is what `users.position` has always stored, so the roles that shipped
 * keep their keys and every existing account keeps its permissions untouched.
 */
return new class extends Migration
{
    /**
     * The roles the company runs on, as key => [name, base role, permissions].
     *
     * `'*'` is every permission — the company manager, who is an admin.
     */
    protected const SEED = [
        'company_manager' => ['مدير الشركة', 'admin', '*'],

        'secretary' => ['السكرتارية', 'manager', [
            'customers.manage', 'crm.manage', 'tasks.dispatch', 'reports.view',
        ]],

        'storekeeper' => ['أمين المخزن', 'manager', [
            'inventory.view', 'inventory.manage', 'assets.manage', 'reports.view',
        ]],

        'accountant' => ['الحسابات', 'manager', [
            'invoices.manage', 'treasury.manage', 'cheques.manage',
            'accounting.view', 'accounting.manage', 'reports.view',
        ]],

        'treasurer' => ['أمين الخزنة', 'manager', [
            'treasury.manage', 'cheques.manage', 'invoices.manage', 'reports.view',
        ]],

        'customer_service' => ['خدمة العملاء', 'manager', [
            'customers.manage', 'crm.manage', 'tasks.dispatch', 'contracts.manage', 'reports.view',
        ]],

        // Both of these live in the field app. The task manager assigns the
        // work and the technician does it; neither carries anything else,
        // which is the whole point of giving them a role of their own.
        'task_manager' => ['مدير المهام', 'manager', ['tasks.dispatch']],

        'maintenance_technician' => ['فني', 'technician', []],

        // Shipped before this change. Kept because accounts hold them, and
        // deleting a role out from under a live account would silently drop
        // that account back to bare role defaults.
        'maintenance_engineer' => ['مهندس صيانة', 'manager', [
            'tasks.dispatch', 'customers.manage', 'assets.manage',
            'contracts.manage', 'warranties.manage', 'warranties.approve',
            'inventory.view', 'requests.decide', 'reports.view',
        ]],

        'administrative' => ['إداري', 'manager', [
            'customers.manage', 'crm.manage', 'hr.manage', 'tasks.dispatch', 'reports.view',
        ]],
    ];

    public function up(): void
    {
        Schema::create('job_roles', function (Blueprint $table) {
            $table->id();
            // What users.position stores. Never changes once issued, so
            // renaming a role does not orphan the accounts holding it.
            $table->string('key', 40)->unique();
            $table->string('name', 80);
            // Which application the role gets — the field app or the office
            // one. Still the three roles it always was.
            $table->string('base_role', 20)->default('manager');
            $table->json('permissions');
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        $now = now();
        $sort = 0;

        foreach (self::SEED as $key => [$name, $role, $permissions]) {
            DB::table('job_roles')->insert([
                'key' => $key,
                'name' => $name,
                'base_role' => $role,
                'permissions' => json_encode(
                    $permissions === '*' ? PermissionRegistry::keys() : $permissions,
                ),
                'sort' => $sort += 10,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('job_roles');
    }
};

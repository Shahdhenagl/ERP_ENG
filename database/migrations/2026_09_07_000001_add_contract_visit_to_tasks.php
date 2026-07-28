<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A maintenance round now fans out across every branch a contract covers — one
 * work order per branch — so a visit owns many tasks rather than one.
 *
 * The link moves onto the task: `tasks.contract_visit_id` names the round a job
 * belongs to, the way `contract_visits.task_id` used to name the single job of
 * a round. That column stays for the representative task, but the task side is
 * now the source of truth, so a round can carry thirty jobs, one per branch.
 *
 * Existing rounds are backfilled from the link they already have, so nothing
 * in flight loses its plan entry.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('contract_visit_id')->nullable()->after('contract_id')
                ->constrained()->nullOnDelete();
        });

        // Carry the one-to-one link that already exists onto the task side.
        DB::statement(
            'UPDATE tasks
             JOIN contract_visits ON contract_visits.task_id = tasks.id
             SET tasks.contract_visit_id = contract_visits.id',
        );
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('contract_visit_id');
        });
    }
};

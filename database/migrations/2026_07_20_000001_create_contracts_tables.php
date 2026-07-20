<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Annual maintenance contracts.
 *
 * The plan and the work order are deliberately kept apart. `contract_visits`
 * holds every visit the contract promises, for the whole term, from the day it
 * is activated — cheap rows nobody counts. A visit only becomes a `task` once
 * it is close enough to act on.
 *
 * Generating the whole term straight into `tasks` was the obvious first move
 * and it is wrong: the dashboard counts every unassigned open job, so ten
 * four-visit contracts would drop forty non-actionable jobs into the manager's
 * "unassigned" badge and quietly ruin the number. It would also stamp a visit
 * scheduled for 2028 with a WO-2026 code.
 *
 * This host has no cron, so materialisation is driven by request traffic
 * instead — see App\Services\MaintenancePlanner.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contracts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // CT-2026-0001

            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('title')->nullable();

            $table->date('starts_on');
            $table->date('ends_on');
            $table->unsignedTinyInteger('visits_per_year')->default(4);

            // Only what an operator sets. "Expired" is a fact about the
            // calendar, derived on read — storing it would create an
            // obligation to flip it, and nothing here can run on a timer.
            $table->enum('status', ['draft', 'active', 'cancelled'])
                ->default('draft')
                ->index();

            $table->decimal('value', 12, 2)->nullable();
            $table->char('currency', 3)->default('EGP');

            // Continuous hours: no working calendar, by decision.
            $table->unsignedSmallInteger('sla_response_hours')->nullable();
            $table->unsignedSmallInteger('sla_resolution_hours')->nullable();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'status']);
            $table->index('ends_on');
        });

        // Which devices the contract covers. Empty means the whole customer.
        // Named the way Eloquent derives it — the two models in alphabetical
        // order — so the relation needs no override.
        Schema::create('asset_contract', function (Blueprint $table) {
            $table->foreignId('contract_id')->constrained()->cascadeOnDelete();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();

            $table->primary(['contract_id', 'asset_id']);
        });

        Schema::create('contract_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contract_id')->constrained()->cascadeOnDelete();

            // Position within the term, 1..n. Paired with contract_id this is
            // what makes materialisation idempotent: two managers opening the
            // dashboard in the same second cannot produce two tasks.
            $table->unsignedTinyInteger('sequence');
            $table->date('planned_for');

            $table->foreignId('task_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->enum('status', ['planned', 'scheduled', 'done', 'skipped', 'cancelled'])
                ->default('planned');

            $table->timestamps();

            $table->unique(['contract_id', 'sequence']);
            $table->index(['status', 'planned_for']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('contract_id')->nullable()->after('asset_id')
                ->constrained()->nullOnDelete();

            // Frozen at creation on purpose: re-pricing the contract next year
            // must not rewrite last year's breach record.
            $table->timestamp('response_due_at')->nullable()->after('scheduled_at');
            $table->timestamp('resolution_due_at')->nullable()->after('response_due_at');

            $table->index('contract_id');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('contract_id');
            $table->dropColumn(['response_due_at', 'resolution_due_at']);
        });

        Schema::dropIfExists('contract_visits');
        Schema::dropIfExists('asset_contract');
        Schema::dropIfExists('contracts');
    }
};

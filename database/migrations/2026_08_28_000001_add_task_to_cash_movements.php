<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ties a custody expense to the job it was spent on.
 *
 * A technician logs a fuel or transport cost from inside a task; linking the
 * movement to that task is what lets the job's report show what the trip cost,
 * and lets a manager see the spend gathered per visit rather than as a loose
 * stream against the float.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->foreignId('task_id')->nullable()->after('cash_box_id')
                ->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_id');
        });
    }
};

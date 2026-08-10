<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('task_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            
            $table->unique(['task_id', 'user_id']);
        });

        // Copy existing assignments
        DB::statement('INSERT INTO task_user (task_id, user_id, created_at, updated_at)
                       SELECT id, assigned_to, NOW(), NOW()
                       FROM tasks
                       WHERE assigned_to IS NOT NULL');

        // Drop assigned_to from tasks
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['assigned_to']);
            $table->dropColumn('assigned_to');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
        });

        // Copy back the FIRST assignment if it exists (data loss for >1 assignments)
        DB::statement('UPDATE tasks t
                       SET assigned_to = (
                           SELECT user_id FROM task_user tu WHERE tu.task_id = t.id LIMIT 1
                       )');

        Schema::dropIfExists('task_user');
    }
};
